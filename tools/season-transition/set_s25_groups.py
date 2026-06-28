#!/usr/bin/env python3
"""
FLV S25 Group Assignment
==========================
Applies the Sun/Moon/Star/Shadow group assignments from
`S25_data/teams_groups.csv` to both the live `teams.group_name` column and
this season's `team_history.group_name` (season_id = SEASON_ID) for the 37
teams imported by `import_s25_roster.py` / `link_s25_history.py`.

CSV LAYOUT
  Row 1 is the group header: Sun,Moon,Star,Shadow
  Each following row holds one team name per group column, e.g.
    Ouroboros,Mango Tree,Coffee Clan,Too High to Care
  means Ouroboros -> Sun, Mango Tree -> Moon, Coffee Clan -> Star,
  Too High to Care -> Shadow.

SPECIAL ENTRIES
  - "BYE": not a real team yet. Created here (bare team row, no roster/
    captain/logo) purely so a week can record "Team X vs BYE" when a group
    has an odd team out. Gets a team_history row for SEASON_ID like any
    other team.
  - "FA Team 1" / "FA Team 2": placeholders for teams the user will add
    later. Skipped entirely -- no team created, no group assigned.

NAME MATCHING
  Most CSV names match an existing `teams.name` case-insensitively. Two
  are abbreviations that need an explicit override:
    SSYS -> "spoon sword yogurt shield"
    DDLC -> "Doki Doki Literature Club"

USAGE
  python tools/season-transition/set_s25_groups.py            # dry run
  python tools/season-transition/set_s25_groups.py --apply    # writes
"""

import csv
import os
import sys
from pathlib import Path

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

try:
    from supabase import create_client, Client
    from dotenv import load_dotenv
except ImportError:
    print("ERROR: Missing dependencies. Run:  pip install supabase python-dotenv")
    sys.exit(1)

REPO_ROOT = Path(__file__).parent.parent.parent
GROUPS_CSV = REPO_ROOT / "S25_data" / "teams_groups.csv"

SEASON_ID = "S25"
APPLY = "--apply" in sys.argv

SKIP_NAMES = {"fa team 1", "fa team 2"}
BYE_NAME = "BYE"
NAME_OVERRIDES = {
    "ssys": "spoon sword yogurt shield",
    "ddlc": "doki doki literature club",
}


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
    print(f"  FLV {SEASON_ID} Group Assignment")
    print(f"  Mode: {'APPLY (will write)' if APPLY else 'DRY RUN (no writes)'}")
    print("=" * 60)

    with open(GROUPS_CSV, newline="", encoding="utf-8") as f:
        rows = list(csv.reader(f))
    group_names = rows[0]
    print(f"\n  Groups: {group_names}")

    assignments = []  # (csv_name, group_name)
    for row in rows[1:]:
        for col_idx, name in enumerate(row):
            name = name.strip()
            if name:
                assignments.append((name, group_names[col_idx]))

    print(f"  {len(assignments)} name/group entries loaded from CSV.")

    url, key = load_env()
    sb: Client = create_client(url, key)
    print(f"  Connected to Supabase: {url[:40]}...")

    existing_teams = fetch_all(sb, "teams", "id, name, group_name")
    teams_by_name = {t["name"].strip().lower(): t for t in existing_teams if t.get("name")}
    existing_th_team_ids = {
        r["team_id"] for r in fetch_all(sb, "team_history", "team_id", {"season_id": SEASON_ID})
    }

    resolved = []       # (team_id, name, group_name, is_new_team)
    skipped = []         # name
    unresolved = []      # name

    for name, group in assignments:
        key = name.strip().lower()
        if key in SKIP_NAMES:
            skipped.append(name)
            continue
        if key == BYE_NAME.lower():
            existing_bye = teams_by_name.get(key)
            resolved.append((existing_bye["id"] if existing_bye else None, BYE_NAME, group, existing_bye is None))
            continue
        lookup_key = NAME_OVERRIDES.get(key, key)
        t = teams_by_name.get(lookup_key)
        if not t:
            unresolved.append(name)
            continue
        resolved.append((t["id"], t["name"], group, False))

    print(f"\n{'─'*60}")
    print(f"  Resolved: {len(resolved)}  |  Skipped (FA placeholders): {len(skipped)}  |  Unresolved: {len(unresolved)}")
    for team_id, name, group, is_new in resolved:
        tag = " (NEW TEAM)" if is_new else ""
        print(f"    {name!r} -> {group}{tag}")
    if skipped:
        print(f"\n  Skipped (not creating, not assigning a group): {skipped}")
    if unresolved:
        print(f"\n  WARNING: could not match these CSV names to an existing team: {unresolved}")

    # ── Step 1: create BYE team if needed ────────────────────────────────────
    bye_entry_idx = next((i for i, (tid, name, _, is_new) in enumerate(resolved) if name == BYE_NAME and is_new), None)

    print(f"\n{'═'*60}")
    print("STEP 1 — Create 'BYE' placeholder team (if missing)")
    print(f"{'═'*60}")
    if bye_entry_idx is not None:
        if confirm("Create a bare 'BYE' team (no roster/captain/logo)?"):
            res = sb.table("teams").insert({"name": BYE_NAME, "tag": "BYE"}).execute()
            new_id = res.data[0]["id"]
            tid, name, group, is_new = resolved[bye_entry_idx]
            resolved[bye_entry_idx] = (new_id, name, group, is_new)
            print(f"    ✓ Created 'BYE' -> id {new_id}")
    else:
        print("    'BYE' already exists, nothing to create.")

    # ── Step 2: set teams.group_name ─────────────────────────────────────────
    print(f"\n{'═'*60}")
    print(f"STEP 2 — Set teams.group_name for {len(resolved)} teams")
    print(f"{'═'*60}")
    if confirm(f"Update teams.group_name for {len(resolved)} teams?"):
        for team_id, name, group, _ in resolved:
            if team_id is None:
                print(f"    ✗ SKIPPED '{name}': no team id (BYE wasn't created)")
                continue
            try:
                sb.table("teams").update({"group_name": group}).eq("id", team_id).execute()
                print(f"    ✓ '{name}' -> {group}")
            except Exception as e:
                print(f"    ✗ FAILED '{name}': {e}")

    # ── Step 3: set/insert team_history.group_name for SEASON_ID ────────────
    print(f"\n{'═'*60}")
    print(f"STEP 3 — Set team_history.group_name for {SEASON_ID}")
    print(f"{'═'*60}")
    if confirm(f"Update/insert team_history.group_name for {len(resolved)} teams?"):
        for team_id, name, group, _ in resolved:
            if team_id is None:
                print(f"    ✗ SKIPPED '{name}': no team id")
                continue
            try:
                if team_id in existing_th_team_ids:
                    sb.table("team_history").update({"group_name": group}).eq("team_id", team_id).eq("season_id", SEASON_ID).execute()
                else:
                    sb.table("team_history").insert({
                        "team_id": team_id, "season_id": SEASON_ID,
                        "captain": None, "co_captain": None, "group_name": group,
                    }).execute()
                print(f"    ✓ '{name}' -> {group}")
            except Exception as e:
                print(f"    ✗ FAILED '{name}': {e}")

    print(f"\n{'═'*60}")
    print("  DRY RUN complete. Re-run with --apply to write these changes." if not APPLY else "  Group assignment complete.")
    print(f"{'═'*60}")


if __name__ == "__main__":
    main()
