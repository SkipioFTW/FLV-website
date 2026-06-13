#!/usr/bin/env python3
"""
FLV Season Transition Tool
==========================
Consolidates ALL steps for transitioning from one FLV season to the next.

WHAT IT DOES:
  1. Extracts the FULL current season's data from Supabase into a local
     SQLite database (.db file) as an offline archive.
  2. Tags any untagged matches with the old season ID.
  3. Archives history tables: player_history, player_team_history, team_history.
     - Fills any gaps using current player/team data.
     - Marks all player_team_history entries for old season as is_current=false.
  4. Records the season champion (winner_id) on the old season row.
  5. Deactivates any active league_snapshots (they belong to the old season).
  6. Creates the new season record in Supabase and activates it.
  7. Verifies the database state post-migration.

WHAT IT DOES NOT DO:
  - Add new teams / players for the new season (do that via the Admin Panel).
  - Set match schedules for the new season.
  - Change default_team_id on players (do that after rosters are confirmed).

USAGE:
  1. Copy the project root .env.local file next to this script, OR set env
     vars NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY directly.
  2. Edit the CONFIG block below (OLD_SEASON, NEW_SEASON).
  3. Run:
       pip install supabase python-dotenv
       python transition.py
  4. When prompted, confirm the archive path and approve each step.

ARCHIVE DATABASE:
  The script writes a SQLite file called  flv_<OLD_SEASON>_archive.db
  Keep this file indefinitely — it is your complete offline record of
  the old season and can be opened with DB Browser for SQLite or any
  SQLite client for reference.
"""

import os, sys, json, sqlite3, datetime
from pathlib import Path

# ─────────────────────────────────────────────────────────────────────────────
# CONFIG — edit these before running
# ─────────────────────────────────────────────────────────────────────────────
OLD_SEASON      = "S24"          # The season that is ENDING
NEW_SEASON      = "S25"          # The NEW season to create
NEW_SEASON_NAME = "Season 25"

# The SQLite archive file will be placed next to this script.
ARCHIVE_PATH = Path(__file__).parent / f"flv_{OLD_SEASON}_archive.db"
# ─────────────────────────────────────────────────────────────────────────────

# Lazy-import supabase so the script can at least show the usage block without it.
try:
    from supabase import create_client, Client
    from dotenv import load_dotenv
except ImportError:
    print("ERROR: Missing dependencies. Run:  pip install supabase python-dotenv")
    sys.exit(1)


# ── Helpers ───────────────────────────────────────────────────────────────────

def load_env() -> tuple[str, str]:
    """Load Supabase credentials from .env.local (next to script or project root)."""
    candidates = [
        Path(__file__).parent / ".env.local",
        Path(__file__).parent.parent.parent / ".env.local",   # project root
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
        print("Place a .env.local next to this script or set them as env vars.")
        sys.exit(1)
    return url, key


def confirm(prompt: str) -> bool:
    """Ask user to confirm a step."""
    ans = input(f"\n{'─'*60}\n{prompt}\nType YES to continue, anything else to skip: ").strip()
    return ans.upper() == "YES"


def fetch_all(supabase: "Client", table: str, select: str = "*", filters: dict = None) -> list:
    """Fetch all rows from a Supabase table (handles pagination)."""
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


# ── Step 1: Extract to SQLite ─────────────────────────────────────────────────

TABLES_TO_ARCHIVE = [
    # Core data
    "seasons",
    "teams",
    "players",
    # History
    "team_history",
    "player_history",
    "player_team_history",
    # Match data
    "matches",
    "match_maps",
    "match_stats",
    "match_stats_map",
    "match_rounds",
    "match_player_rounds",
    # Misc (handled gracefully if absent)
    "match_substitutions",
    "league_snapshots",
]

def create_sqlite_table(cur: sqlite3.Cursor, table: str, rows: list):
    """Dynamically create a SQLite table from the first row's keys and insert all rows."""
    if not rows:
        print(f"    [{table}] — empty, skipping")
        return
    cols = list(rows[0].keys())
    col_defs = ", ".join(f'"{c}" TEXT' for c in cols)
    cur.execute(f'CREATE TABLE IF NOT EXISTS "{table}" ({col_defs})')
    placeholders = ", ".join("?" for _ in cols)
    for row in rows:
        values = []
        for c in cols:
            v = row[c]
            if isinstance(v, (dict, list)):
                v = json.dumps(v)
            values.append(str(v) if v is not None else None)
        cur.execute(f'INSERT INTO "{table}" VALUES ({placeholders})', values)


def step_extract_archive(supabase: "Client"):
    """Dump every relevant table from Supabase into a local SQLite file."""
    print(f"\n{'═'*60}")
    print(f"STEP 1 — Archive {OLD_SEASON} → {ARCHIVE_PATH.name}")
    print(f"{'═'*60}")

    if ARCHIVE_PATH.exists():
        print(f"  Archive already exists at {ARCHIVE_PATH}")
        if not confirm("Overwrite existing archive?"):
            print("  Skipping archive step.")
            return

    con = sqlite3.connect(ARCHIVE_PATH)
    cur = con.cursor()

    # Store metadata
    cur.execute('CREATE TABLE IF NOT EXISTS "_meta" (key TEXT, value TEXT)')
    cur.execute("INSERT INTO _meta VALUES ('archived_at', ?)",
                (datetime.datetime.utcnow().isoformat(),))
    cur.execute("INSERT INTO _meta VALUES ('old_season', ?)", (OLD_SEASON,))
    cur.execute("INSERT INTO _meta VALUES ('new_season', ?)", (NEW_SEASON,))

    for table in TABLES_TO_ARCHIVE:
        try:
            rows = fetch_all(supabase, table)
            create_sqlite_table(cur, table, rows)
            print(f"    [{table}] — {len(rows)} rows archived")
        except Exception as e:
            print(f"    [{table}] — SKIPPED ({e})")

    con.commit()
    con.close()
    size_kb = ARCHIVE_PATH.stat().st_size // 1024
    print(f"\n  ✓ Archive saved: {ARCHIVE_PATH}  ({size_kb} KB)")


# ── Step 2: Tag untagged matches ───────────────────────────────────────────────

def step_tag_old_matches(supabase: "Client"):
    """Set season_id = OLD_SEASON on any match that has no season tag yet."""
    print(f"\n{'═'*60}")
    print(f"STEP 2 — Tag untagged matches as {OLD_SEASON}")
    print(f"{'═'*60}")

    res = supabase.table("matches").select("id", count="exact").is_("season_id", "null").execute()
    untagged = res.count or 0
    print(f"  {untagged} untagged matches found.")

    if untagged == 0:
        print("  Nothing to do.")
        return

    if not confirm(f"Tag {untagged} matches with season_id = '{OLD_SEASON}'?"):
        return

    supabase.table("matches").update({"season_id": OLD_SEASON}).is_("season_id", "null").execute()
    print(f"  ✓ Done.")


# ── Step 3: Archive history tables for OLD_SEASON ─────────────────────────────

def step_archive_history(supabase: "Client"):
    """
    Snapshot player_history, player_team_history, and team_history for OLD_SEASON.
    - Fills any gaps using current player/team live data.
    - Marks all player_team_history entries for OLD_SEASON as is_current=false,
      so they are correctly recorded as historical (not active) affiliations.
    """
    print(f"\n{'═'*60}")
    print(f"STEP 3 — Validate & fill history tables for {OLD_SEASON}")
    print(f"{'═'*60}")

    # ── player_history ──────────────────────────────────────────────────────
    res = supabase.table("player_history").select("player_id", count="exact").eq("season_id", OLD_SEASON).execute()
    existing = res.count or 0
    print(f"\n  player_history: {existing} entries for {OLD_SEASON}")

    all_players = fetch_all(supabase, "players", "id, rank")
    recorded_ids = {r["player_id"] for r in fetch_all(supabase, "player_history", "player_id", {"season_id": OLD_SEASON})}
    missing = [p for p in all_players if p["id"] not in recorded_ids and p.get("rank")]

    if missing:
        print(f"  {len(missing)} players missing from player_history — will fill.")
        if confirm(f"Insert {len(missing)} missing player_history rows for {OLD_SEASON}?"):
            rows = [{"player_id": p["id"], "season_id": OLD_SEASON, "rank": p["rank"]} for p in missing]
            supabase.table("player_history").insert(rows).execute()
            print(f"  ✓ Inserted {len(rows)} rows.")
    else:
        print(f"  ✓ player_history complete.")

    # ── player_team_history ─────────────────────────────────────────────────
    res = supabase.table("player_team_history").select("player_id", count="exact").eq("season_id", OLD_SEASON).execute()
    existing = res.count or 0
    print(f"\n  player_team_history: {existing} entries for {OLD_SEASON}")

    all_players_with_team = fetch_all(supabase, "players", "id, default_team_id")
    recorded_pth = {r["player_id"] for r in fetch_all(supabase, "player_team_history", "player_id", {"season_id": OLD_SEASON})}
    missing_pth = [p for p in all_players_with_team if p["id"] not in recorded_pth and p.get("default_team_id")]

    if missing_pth:
        print(f"  {len(missing_pth)} players missing from player_team_history — will fill.")
        if confirm(f"Insert {len(missing_pth)} missing player_team_history rows for {OLD_SEASON}?"):
            rows = [{"player_id": p["id"], "team_id": p["default_team_id"], "season_id": OLD_SEASON, "is_current": False} for p in missing_pth]
            supabase.table("player_team_history").insert(rows).execute()
            print(f"  ✓ Inserted {len(rows)} rows.")
    else:
        print(f"  ✓ player_team_history: no missing entries.")

    # Mark ALL existing player_team_history entries for old season as is_current=false.
    # They are historical affiliations and should not appear as "current".
    if confirm(f"Mark all player_team_history entries for {OLD_SEASON} as is_current=false?"):
        supabase.table("player_team_history") \
            .update({"is_current": False}) \
            .eq("season_id", OLD_SEASON) \
            .execute()
        print(f"  ✓ All {OLD_SEASON} player_team_history entries marked as historical.")

    # ── team_history ─────────────────────────────────────────────────────────
    res = supabase.table("team_history").select("team_id", count="exact").eq("season_id", OLD_SEASON).execute()
    existing = res.count or 0
    print(f"\n  team_history: {existing} entries for {OLD_SEASON}")

    all_teams = fetch_all(supabase, "teams", "id, captain, co_captain, group_name")
    recorded_th = {r["team_id"] for r in fetch_all(supabase, "team_history", "team_id", {"season_id": OLD_SEASON})}
    missing_th = [t for t in all_teams if t["id"] not in recorded_th]

    if missing_th:
        print(f"  {len(missing_th)} teams missing from team_history — will fill.")
        if confirm(f"Insert {len(missing_th)} missing team_history rows for {OLD_SEASON}?"):
            rows = [{"team_id": t["id"], "season_id": OLD_SEASON,
                     "captain": t.get("captain"), "co_captain": t.get("co_captain"),
                     "group_name": t.get("group_name")} for t in missing_th]
            supabase.table("team_history").insert(rows).execute()
            print(f"  ✓ Inserted {len(rows)} rows.")
    else:
        print(f"  ✓ team_history complete.")


# ── Step 4: Record the season champion ────────────────────────────────────────

def step_record_champion(supabase: "Client"):
    """
    Optionally set the winner_id on the old season row.
    The seasons table has a winner_id FK → teams.id column for this purpose.
    """
    print(f"\n{'═'*60}")
    print(f"STEP 4 — Record season champion for {OLD_SEASON}")
    print(f"{'═'*60}")

    # Show current value
    res = supabase.table("seasons").select("winner_id").eq("id", OLD_SEASON).execute()
    current_winner = res.data[0].get("winner_id") if res.data else None
    if current_winner:
        print(f"  winner_id already set to team ID {current_winner}. Skipping.")
        return

    print("  No champion recorded yet for this season.")
    print("  If you know the winning team's ID, you can set it now.")
    print("  (Leave blank to skip — you can always update this later via the Admin Panel.)")

    team_id_raw = input("  Enter the winning team's numeric ID (or press Enter to skip): ").strip()
    if not team_id_raw:
        print("  Skipped — no winner recorded.")
        return

    try:
        team_id = int(team_id_raw)
    except ValueError:
        print("  Invalid input — must be a number. Skipping.")
        return

    # Verify the team exists
    res = supabase.table("teams").select("id, name").eq("id", team_id).execute()
    if not res.data:
        print(f"  Team ID {team_id} not found. Skipping.")
        return

    team_name = res.data[0].get("name", "Unknown")
    if confirm(f"Set winner of {OLD_SEASON} to '{team_name}' (ID {team_id})?"):
        supabase.table("seasons").update({"winner_id": team_id}).eq("id", OLD_SEASON).execute()
        print(f"  ✓ Season champion recorded: {team_name}")


# ── Step 5: Deactivate old league snapshots ───────────────────────────────────

def step_deactivate_snapshots(supabase: "Client"):
    """
    Deactivate any active league_snapshots so the new season starts clean.
    Active snapshots belong to the old season's standings and should not
    carry over as the 'current' snapshot for the new season.
    """
    print(f"\n{'═'*60}")
    print("STEP 5 — Deactivate old league snapshots")
    print(f"{'═'*60}")

    try:
        res = supabase.table("league_snapshots").select("id", count="exact").eq("is_active", True).execute()
        active_count = res.count or 0
        print(f"  {active_count} active league snapshot(s) found.")

        if active_count == 0:
            print("  Nothing to do.")
            return

        if confirm(f"Deactivate {active_count} active league snapshot(s)?"):
            supabase.table("league_snapshots").update({"is_active": False}).eq("is_active", True).execute()
            print(f"  ✓ All league snapshots deactivated.")
    except Exception as e:
        print(f"  league_snapshots — SKIPPED ({e})")


# ── Step 6: Create new season ─────────────────────────────────────────────────

def step_create_new_season(supabase: "Client"):
    """Insert the new season row and flip is_active flags."""
    print(f"\n{'═'*60}")
    print(f"STEP 6 — Create {NEW_SEASON} and activate it")
    print(f"{'═'*60}")

    # Check if season already exists
    res = supabase.table("seasons").select("id, is_active").eq("id", NEW_SEASON).execute()
    if res.data:
        print(f"  Season {NEW_SEASON} already exists (is_active={res.data[0]['is_active']}).")
    else:
        if not confirm(f"Create new season record '{NEW_SEASON}' ({NEW_SEASON_NAME})?"):
            return
        supabase.table("seasons").insert({"id": NEW_SEASON, "name": NEW_SEASON_NAME, "is_active": False}).execute()
        print(f"  ✓ Season {NEW_SEASON} created.")

    # Deactivate old season and activate new one
    if confirm(f"Deactivate {OLD_SEASON} and activate {NEW_SEASON}?"):
        supabase.table("seasons").update({"is_active": False}).eq("id", OLD_SEASON).execute()
        supabase.table("seasons").update({"is_active": True}).eq("id", NEW_SEASON).execute()
        print(f"  ✓ {OLD_SEASON} → inactive.  {NEW_SEASON} → ACTIVE.")


# ── Step 7: Verify ────────────────────────────────────────────────────────────

def step_verify(supabase: "Client"):
    """Print a summary of the database state post-migration."""
    print(f"\n{'═'*60}")
    print("STEP 7 — Post-migration verification")
    print(f"{'═'*60}")

    def count(table, filters=None):
        q = supabase.table(table).select("id", count="exact")
        if filters:
            for col, val in filters.items():
                q = q.eq(col, val)
        return (q.execute().count or 0)

    seasons = fetch_all(supabase, "seasons", "id, name, is_active, winner_id")
    print("\n  Seasons:")
    for s in seasons:
        active  = " ← ACTIVE" if s["is_active"] else ""
        champ   = f"  (champion team_id={s['winner_id']})" if s.get("winner_id") else ""
        print(f"    {s['id']}  {s['name']}{active}{champ}")

    old_matches = count("matches", {"season_id": OLD_SEASON})
    new_matches = count("matches", {"season_id": NEW_SEASON})
    untagged    = supabase.table("matches").select("id", count="exact").is_("season_id", "null").execute().count or 0

    print(f"\n  Matches:")
    print(f"    {OLD_SEASON}: {old_matches}  |  {NEW_SEASON}: {new_matches}  |  untagged: {untagged}")

    ph_old  = count("player_history",      {"season_id": OLD_SEASON})
    ph_new  = count("player_history",      {"season_id": NEW_SEASON})
    pth_old = count("player_team_history", {"season_id": OLD_SEASON})
    pth_new = count("player_team_history", {"season_id": NEW_SEASON})
    th_old  = count("team_history",        {"season_id": OLD_SEASON})
    th_new  = count("team_history",        {"season_id": NEW_SEASON})

    print(f"\n  History tables ({OLD_SEASON} / {NEW_SEASON}):")
    print(f"    player_history:       {ph_old} / {ph_new}")
    print(f"    player_team_history:  {pth_old} / {pth_new}")
    print(f"    team_history:         {th_old} / {th_new}")

    try:
        active_snaps = supabase.table("league_snapshots").select("id", count="exact").eq("is_active", True).execute().count or 0
        print(f"\n  Active league_snapshots: {active_snaps}  (should be 0 until regenerated for new season)")
    except Exception:
        pass

    if untagged > 0:
        print(f"\n  ⚠  WARNING: {untagged} matches still have no season_id — run STEP 2 again.")
    else:
        print(f"\n  ✓ All checks passed.")


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    print("=" * 60)
    print("  FLV Season Transition Tool")
    print(f"  {OLD_SEASON}  →  {NEW_SEASON}")
    print("=" * 60)
    print(f"  Archive will be written to: {ARCHIVE_PATH}")
    print("\n  Steps:")
    print("    1. Extract full DB to local SQLite archive")
    print("    2. Tag untagged matches with old season ID")
    print("    3. Validate & fill history tables for old season")
    print("    4. Record season champion (winner_id)")
    print("    5. Deactivate old league snapshots")
    print("    6. Create new season record + activate it")
    print("    7. Verify database state")
    print("\n  Each step will ask for confirmation before making changes.")

    if not confirm("Ready to begin? (Make sure you've backed up your DB first)"):
        print("Aborted.")
        sys.exit(0)

    url, key = load_env()
    sb: Client = create_client(url, key)
    print(f"\n  Connected to Supabase: {url[:40]}...")

    step_extract_archive(sb)
    step_tag_old_matches(sb)
    step_archive_history(sb)
    step_record_champion(sb)
    step_deactivate_snapshots(sb)
    step_create_new_season(sb)
    step_verify(sb)

    print(f"\n{'═'*60}")
    print("  Transition complete!")
    print(f"  Archive:     {ARCHIVE_PATH}")
    print(f"  Old season:  {OLD_SEASON} (inactive)")
    print(f"  New season:  {NEW_SEASON} (active)")
    print(f"\n  Next steps (do manually via Admin Panel):")
    print(f"    • Register new teams for {NEW_SEASON}")
    print(f"    • Register players / update rosters")
    print(f"    • Set the match schedule")
    print("=" * 60)


if __name__ == "__main__":
    main()
