#!/usr/bin/env python3
"""
FLV S25 Roster Import
======================
One-off script to import the S25 team/player registration data (exported from
the separate FLV-Registration Supabase project as CSVs) into this project's
`teams` and `players` tables.

The registration CSV schema does not match the main DB schema, so this script
maps columns and converts the registration app's numeric `pr` (0-7) rank code
into the canonical rank strings already used in `players.rank` (the same
mapping `fix_ranks.py` used historically, just keyed by int instead of the
legacy '7pr' string format).

CSV -> DB column mapping
-------------------------
teams_rows.csv      -> teams
  team_name         -> name
  team_tag          -> tag
  logo_url          -> logo_path        (kept as-is; some rows are raw base64
                                          data URIs instead of hosted URLs --
                                          flagged as a warning, not fixed here)
  cap_discord_id    -> captain          (resolved to the matching player's
                                          `@discord_username`-style name)
  cocap_discord_id  -> co_captain       (same resolution)
  group_name        -> left NULL (admin assigns divisions manually)

players_rows.csv    -> players
  discord_username  -> name             ('@' + discord_username, matching the
                                          existing convention in this table)
  discord_id        -> uuid
  riot_id           -> riot_id
  tracker           -> tracker_link
  pr                -> rank             (via RANK_MAPPING below)
  team_id           -> default_team_id  (resolved via the teams CSV's own
                                          `id` column, mapped to the real
                                          teams.id after insertion)

Matching against existing rows
-------------------------------
- A team is matched against an existing row by case-insensitive, trimmed
  `name`. If found, no new team is inserted -- its id is reused.
- A player is matched against an existing row by `uuid` (Discord id). If
  found, the row is UPDATED (rank/riot_id/tracker_link/default_team_id) but
  its `name` is left untouched, since that's an existing identity, not a
  re-registration.

USAGE
  python tools/season-transition/import_s25_roster.py            # dry run
  python tools/season-transition/import_s25_roster.py --apply    # writes
"""

import csv
import os
import sys
from pathlib import Path

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

csv.field_size_limit(50_000_000)  # a few rows embed multi-MB base64 logos

try:
    from supabase import create_client, Client
    from dotenv import load_dotenv
except ImportError:
    print("ERROR: Missing dependencies. Run:  pip install supabase python-dotenv")
    sys.exit(1)

REPO_ROOT = Path(__file__).parent.parent.parent
TEAMS_CSV = REPO_ROOT / "S25_data" / "teams_rows.csv"
PLAYERS_CSV = REPO_ROOT / "S25_data" / "players_rows.csv"

APPLY = "--apply" in sys.argv

RANK_MAPPING = {
    "7": "Immortal 3/Radiant",
    "6": "Immortal 1/2",
    "5": "Ascendant",
    "4": "Diamond",
    "3": "Platinum",
    "2": "Gold",
    "1": "Silver",
    "0": "Iron/Bronze",
}


def get_rank(pr: str):
    """Map the registration app's numeric pr code to the canonical rank string.
    Blank pr (registration not finished) defaults to 'Unranked', matching the
    admin player-create route's default. Any other unrecognized value is
    treated as invalid (caller should skip the row)."""
    pr = pr.strip()
    if pr == "":
        return "Unranked"
    return RANK_MAPPING.get(pr)


def load_env() -> tuple[str, str]:
    candidates = [
        Path(__file__).parent / ".env.local",
        REPO_ROOT / ".env.local",
    ]
    for p in candidates:
        if p.exists():
            load_dotenv(p)
            print(f"  Loaded env from: {p}")
            break

    url = os.getenv("NEXT_PUBLIC_SUPABASE_URL")
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("NEXT_PUBLIC_SUPABASE_ANON_KEY")
    if not url or not key:
        print("\nERROR: Could not find NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY.")
        sys.exit(1)
    return url, key


def fetch_all(supabase: "Client", table: str, select: str = "*") -> list:
    rows = []
    offset = 0
    page_size = 1000
    while True:
        res = supabase.table(table).select(select).range(offset, offset + page_size - 1).execute()
        batch = res.data or []
        rows.extend(batch)
        if len(batch) < page_size:
            break
        offset += page_size
    return rows


def confirm(prompt: str) -> bool:
    if not APPLY:
        return False
    ans = input(f"\n{prompt}\nType YES to continue, anything else to skip: ").strip()
    return ans.upper() == "YES"


def main():
    print("=" * 60)
    print("  FLV S25 Roster Import")
    print(f"  Mode: {'APPLY (will write)' if APPLY else 'DRY RUN (no writes)'}")
    print("=" * 60)

    if not TEAMS_CSV.exists() or not PLAYERS_CSV.exists():
        print(f"ERROR: expected {TEAMS_CSV} and {PLAYERS_CSV}")
        sys.exit(1)

    with open(TEAMS_CSV, newline="", encoding="utf-8") as f:
        team_rows = list(csv.DictReader(f))
    with open(PLAYERS_CSV, newline="", encoding="utf-8") as f:
        player_rows = list(csv.DictReader(f))

    print(f"\n  Loaded {len(team_rows)} team rows, {len(player_rows)} player rows from CSV.")

    url, key = load_env()
    sb: Client = create_client(url, key)
    print(f"  Connected to Supabase: {url[:40]}...")

    existing_teams = fetch_all(sb, "teams", "id, name")
    existing_players = fetch_all(sb, "players", "id, name, uuid")

    teams_by_name = {t["name"].strip().lower(): t["id"] for t in existing_teams if t.get("name")}
    players_by_uuid = {p["uuid"]: p for p in existing_players if p.get("uuid")}

    # csv player discord_id -> csv row, used to resolve captain/co_captain names
    players_by_discord_id = {p["discord_id"]: p for p in player_rows}

    def resolve_player_display_name(discord_id: str):
        existing = players_by_uuid.get(discord_id)
        if existing:
            return existing["name"]
        csv_row = players_by_discord_id.get(discord_id)
        if csv_row:
            return "@" + csv_row["discord_username"]
        return None

    # ── Teams: classify new vs existing, flag base64 logos ──────────────────
    new_teams = []
    matched_teams = []  # (csv_id, existing_team_id, name)
    base64_warnings = []

    for row in team_rows:
        key_name = row["team_name"].strip().lower()
        if key_name in teams_by_name:
            matched_teams.append((row["id"], teams_by_name[key_name], row["team_name"]))
        else:
            new_teams.append(row)

        logo = row.get("logo_url") or ""
        if logo.startswith("data:"):
            base64_warnings.append((row["team_name"], len(logo) // 1024))

    print(f"\n{'─'*60}")
    print(f"  TEAMS: {len(new_teams)} new, {len(matched_teams)} already exist (matched by name)")
    if matched_teams:
        for csv_id, real_id, name in matched_teams:
            print(f"    = '{name}' -> existing team id {real_id}")
    if base64_warnings:
        print(f"\n  WARNING: {len(base64_warnings)} team(s) have a raw base64 logo embedded")
        print("  instead of a hosted URL. They'll still render as <img> data URIs,")
        print("  but bloat the DB row and page payload. Consider re-uploading via")
        print("  the Admin Panel afterwards:")
        for name, kb in base64_warnings:
            print(f"    - '{name}' ({kb} KB)")

    # ── Players: classify new vs existing, validate pr values ───────────────
    new_players = []
    update_players = []
    bad_rank = []

    for row in player_rows:
        if get_rank(row.get("pr", "")) is None:
            bad_rank.append((row["discord_username"], row.get("pr", "")))
            continue
        existing = players_by_uuid.get(row["discord_id"])
        if existing:
            update_players.append((row, existing))
        else:
            new_players.append(row)

    print(f"\n{'─'*60}")
    print(f"  PLAYERS: {len(new_players)} new, {len(update_players)} already exist (matched by Discord id, will update rank/team)")
    if bad_rank:
        print(f"\n  WARNING: {len(bad_rank)} player(s) have an unrecognized pr value, skipped:")
        for username, pr in bad_rank:
            print(f"    - {username}: pr={pr!r}")

    # ── Step 1: insert new teams ─────────────────────────────────────────────
    csv_team_id_to_real_id = {csv_id: real_id for csv_id, real_id, _ in matched_teams}

    print(f"\n{'═'*60}")
    print(f"STEP 1 — Insert {len(new_teams)} new teams")
    print(f"{'═'*60}")
    for row in new_teams:
        print(f"    + {row['team_name']!r}  tag={row['team_tag']!r}")

    if new_teams and confirm(f"Insert {len(new_teams)} new teams?"):
        for row in new_teams:
            payload = {
                "name": row["team_name"],
                "tag": row["team_tag"],
                "logo_path": row.get("logo_url") or None,
            }
            res = sb.table("teams").insert(payload).execute()
            new_id = res.data[0]["id"]
            csv_team_id_to_real_id[row["id"]] = new_id
            print(f"    ✓ Inserted '{row['team_name']}' -> id {new_id}")
    elif not APPLY:
        # dry run: fabricate placeholder ids so later steps can still preview
        for row in new_teams:
            csv_team_id_to_real_id[row["id"]] = f"<new:{row['team_name']}>"

    # ── Step 2: insert/update players ────────────────────────────────────────
    print(f"\n{'═'*60}")
    print(f"STEP 2 — Insert {len(new_players)} new players, update {len(update_players)} existing")
    print(f"{'═'*60}")

    if confirm(f"Insert {len(new_players)} new players?"):
        for row in new_players:
            team_real_id = csv_team_id_to_real_id.get(row["team_id"])
            payload = {
                "name": "@" + row["discord_username"],
                "riot_id": row.get("riot_id") or None,
                "uuid": row["discord_id"],
                "rank": get_rank(row["pr"]),
                "tracker_link": row.get("tracker") or None,
                "default_team_id": team_real_id if isinstance(team_real_id, int) else None,
            }
            try:
                sb.table("players").insert(payload).execute()
                print(f"    ✓ Inserted '{payload['name']}' (team {team_real_id})")
            except Exception as e:
                print(f"    ✗ FAILED '{payload['name']}': {e}")

    if confirm(f"Update {len(update_players)} existing players (rank/riot_id/tracker_link/default_team_id)?"):
        for row, existing in update_players:
            team_real_id = csv_team_id_to_real_id.get(row["team_id"])
            payload = {
                "riot_id": row.get("riot_id") or None,
                "rank": get_rank(row["pr"]),
                "tracker_link": row.get("tracker") or None,
                "default_team_id": team_real_id if isinstance(team_real_id, int) else None,
            }
            try:
                sb.table("players").update(payload).eq("id", existing["id"]).execute()
                print(f"    ✓ Updated '{existing['name']}' (team {team_real_id}, rank {payload['rank']})")
            except Exception as e:
                print(f"    ✗ FAILED '{existing['name']}': {e}")

    # ── Step 3: set captain / co_captain on teams ────────────────────────────
    print(f"\n{'═'*60}")
    print("STEP 3 — Set captain / co_captain on teams")
    print(f"{'═'*60}")

    captain_updates = []
    for row in team_rows:
        team_real_id = csv_team_id_to_real_id.get(row["id"])
        captain_name = resolve_player_display_name(row.get("cap_discord_id", ""))
        cocaptain_name = resolve_player_display_name(row.get("cocap_discord_id", "")) if row.get("cocap_discord_id") else None
        captain_updates.append((row["team_name"], team_real_id, captain_name, cocaptain_name))
        print(f"    {row['team_name']!r}: captain={captain_name!r} co_captain={cocaptain_name!r}")

    if confirm(f"Apply captain/co_captain to {len(captain_updates)} teams?"):
        for name, team_real_id, captain_name, cocaptain_name in captain_updates:
            if not isinstance(team_real_id, int):
                print(f"    ✗ SKIPPED '{name}': team id not resolved")
                continue
            payload = {"captain": captain_name, "co_captain": cocaptain_name}
            try:
                sb.table("teams").update(payload).eq("id", team_real_id).execute()
                print(f"    ✓ Updated '{name}'")
            except Exception as e:
                print(f"    ✗ FAILED '{name}': {e}")

    print(f"\n{'═'*60}")
    if not APPLY:
        print("  DRY RUN complete. Re-run with --apply to write these changes.")
    else:
        print("  Import complete.")
    print(f"{'═'*60}")


if __name__ == "__main__":
    main()
