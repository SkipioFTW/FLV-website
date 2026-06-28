#!/usr/bin/env python3
"""
FLV S25 History Linker
=======================
Companion to `import_s25_roster.py`. That script wrote the live `teams` and
`players` rows (and `players.default_team_id`), but it never touched the
season-scoped history tables. Per `docs/DATA_FLOW.md` / `lib/data.ts`,
`team_history` and `player_history` are HARD GATES for season-filtered
queries (getStandings, getTeams, getTeamsBasic, getLeaderboard, getPlayers):
a team/player with zero rows for `season_id = 'S25'` simply does not appear
in standings/team list/leaderboard, full stop -- no fallback to the live
table. (`player_team_history` is the one exception that gracefully falls
back to `players.default_team_id`, but we fill it too for consistency.)

This script inserts, for season_id = SEASON_ID, exactly the teams/players
present in the S25 roster CSVs (not every team/player ever in the DB):
  - team_history:        team_id, season_id, captain, co_captain, group_name
  - player_history:      player_id, season_id, rank
  - player_team_history: player_id, team_id, season_id, is_current=true

group_name is intentionally left NULL here -- group assignments (Sun/Moon/
Star/Shadow) are provided separately and applied with a follow-up update.

Resolution is the same name/uuid matching `import_s25_roster.py` already
used, run again here since this script can be re-run independently. Rows
that already exist for SEASON_ID are skipped (never duplicated/overwritten).

USAGE
  python tools/season-transition/link_s25_history.py            # dry run
  python tools/season-transition/link_s25_history.py --apply    # writes
"""

import csv
import os
import sys
from pathlib import Path

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

csv.field_size_limit(50_000_000)

try:
    from supabase import create_client, Client
    from dotenv import load_dotenv
except ImportError:
    print("ERROR: Missing dependencies. Run:  pip install supabase python-dotenv")
    sys.exit(1)

REPO_ROOT = Path(__file__).parent.parent.parent
TEAMS_CSV = REPO_ROOT / "S25_data" / "teams_rows.csv"
PLAYERS_CSV = REPO_ROOT / "S25_data" / "players_rows.csv"

SEASON_ID = "S25"
APPLY = "--apply" in sys.argv


def load_env() -> tuple[str, str]:
    candidates = [Path(__file__).parent / ".env.local", REPO_ROOT / ".env.local"]
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


def fetch_all(supabase: "Client", table: str, select: str = "*", filters: dict = None) -> list:
    rows = []
    offset = 0
    page_size = 1000
    while True:
        q = supabase.table(table).select(select).range(offset, offset + page_size - 1)
        if filters:
            for col, val in filters.items():
                q = q.eq(col, val)
        res = q.execute()
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
    print(f"  FLV {SEASON_ID} History Linker")
    print(f"  Mode: {'APPLY (will write)' if APPLY else 'DRY RUN (no writes)'}")
    print("=" * 60)

    with open(TEAMS_CSV, newline="", encoding="utf-8") as f:
        team_rows = list(csv.DictReader(f))
    with open(PLAYERS_CSV, newline="", encoding="utf-8") as f:
        player_rows = list(csv.DictReader(f))
    print(f"\n  Loaded {len(team_rows)} team rows, {len(player_rows)} player rows from CSV.")

    url, key = load_env()
    sb: Client = create_client(url, key)
    print(f"  Connected to Supabase: {url[:40]}...")

    teams = fetch_all(sb, "teams", "id, name, captain, co_captain, group_name")
    players = fetch_all(sb, "players", "id, uuid, rank, default_team_id")

    teams_by_name = {t["name"].strip().lower(): t for t in teams if t.get("name")}
    players_by_uuid = {p["uuid"]: p for p in players if p.get("uuid")}

    existing_th = {r["team_id"] for r in fetch_all(sb, "team_history", "team_id", {"season_id": SEASON_ID})}
    existing_ph = {r["player_id"] for r in fetch_all(sb, "player_history", "player_id", {"season_id": SEASON_ID})}
    existing_pth = {r["player_id"] for r in fetch_all(sb, "player_team_history", "player_id", {"season_id": SEASON_ID})}

    # ── Resolve team_history rows ────────────────────────────────────────────
    team_history_rows = []
    unresolved_teams = []
    for row in team_rows:
        t = teams_by_name.get(row["team_name"].strip().lower())
        if not t:
            unresolved_teams.append(row["team_name"])
            continue
        if t["id"] in existing_th:
            continue
        team_history_rows.append({
            "team_id": t["id"],
            "season_id": SEASON_ID,
            "captain": t.get("captain"),
            "co_captain": t.get("co_captain"),
            "group_name": t.get("group_name"),  # left as-is (NULL for now)
        })

    # ── Resolve player_history / player_team_history rows ───────────────────
    player_history_rows = []
    player_team_history_rows = []
    unresolved_players = []
    no_team_players = []

    for row in player_rows:
        p = players_by_uuid.get(row["discord_id"])
        if not p:
            unresolved_players.append(row["discord_username"])
            continue
        if p["id"] not in existing_ph:
            player_history_rows.append({
                "player_id": p["id"],
                "season_id": SEASON_ID,
                "rank": p.get("rank"),
            })
        if p["id"] not in existing_pth:
            if p.get("default_team_id"):
                player_team_history_rows.append({
                    "player_id": p["id"],
                    "team_id": p["default_team_id"],
                    "season_id": SEASON_ID,
                    "is_current": True,
                })
            else:
                no_team_players.append(row["discord_username"])

    print(f"\n{'─'*60}")
    print(f"  team_history:        {len(team_history_rows)} to insert, {len(team_rows) - len(team_history_rows) - len(unresolved_teams)} already linked to {SEASON_ID}")
    print(f"  player_history:      {len(player_history_rows)} to insert")
    print(f"  player_team_history: {len(player_team_history_rows)} to insert")
    if unresolved_teams:
        print(f"\n  WARNING: {len(unresolved_teams)} team(s) from CSV not found in `teams` table: {unresolved_teams}")
    if unresolved_players:
        print(f"\n  WARNING: {len(unresolved_players)} player(s) from CSV not found in `players` table: {unresolved_players}")
    if no_team_players:
        print(f"\n  WARNING: {len(no_team_players)} player(s) have no default_team_id, skipped for player_team_history: {no_team_players}")

    print(f"\n  NOTE: group_name is NOT being set here -- it's carried over as NULL")
    print(f"  from the live `teams` table. Send the Sun/Moon/Star/Shadow group")
    print(f"  mapping and it'll be applied as a follow-up update to both")
    print(f"  `teams.group_name` and this season's `team_history.group_name`.")

    print(f"\n{'═'*60}")
    print(f"STEP 1 — Insert {len(team_history_rows)} team_history rows for {SEASON_ID}")
    print(f"{'═'*60}")
    if team_history_rows and confirm(f"Insert {len(team_history_rows)} team_history rows?"):
        for chunk_start in range(0, len(team_history_rows), 100):
            chunk = team_history_rows[chunk_start:chunk_start + 100]
            sb.table("team_history").insert(chunk).execute()
        print(f"    ✓ Inserted {len(team_history_rows)} rows.")

    print(f"\n{'═'*60}")
    print(f"STEP 2 — Insert {len(player_history_rows)} player_history rows for {SEASON_ID}")
    print(f"{'═'*60}")
    if player_history_rows and confirm(f"Insert {len(player_history_rows)} player_history rows?"):
        for chunk_start in range(0, len(player_history_rows), 100):
            chunk = player_history_rows[chunk_start:chunk_start + 100]
            sb.table("player_history").insert(chunk).execute()
        print(f"    ✓ Inserted {len(player_history_rows)} rows.")

    print(f"\n{'═'*60}")
    print(f"STEP 3 — Insert {len(player_team_history_rows)} player_team_history rows for {SEASON_ID}")
    print(f"{'═'*60}")
    if player_team_history_rows and confirm(f"Insert {len(player_team_history_rows)} player_team_history rows?"):
        for chunk_start in range(0, len(player_team_history_rows), 100):
            chunk = player_team_history_rows[chunk_start:chunk_start + 100]
            sb.table("player_team_history").insert(chunk).execute()
        print(f"    ✓ Inserted {len(player_team_history_rows)} rows.")

    print(f"\n{'═'*60}")
    print("  DRY RUN complete. Re-run with --apply to write these changes." if not APPLY else "  Linking complete.")
    print(f"{'═'*60}")


if __name__ == "__main__":
    main()
