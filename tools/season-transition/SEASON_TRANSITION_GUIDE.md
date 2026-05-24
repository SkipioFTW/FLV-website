# Season Transition Guide

This folder contains **everything you need** to move from one FLV season to the next.
The process has been consolidated into a single Python script so there's nothing to
piece together manually.

---

## Files in this folder

| File | Purpose |
|------|---------|
| `transition.py` | **The one script to run.** Does everything step-by-step. |
| `migration_template.sql` | SQL-only fallback (run in Supabase SQL Editor if the script fails). |
| `fix_ranks.py` | Optional: normalises rank strings after importing player data from a new source. |
| `flv_S##_archive.db` | Created by `transition.py` — SQLite offline archive of the old season. |

---

## How to run the transition

### 1 — Install dependencies (once)
```bash
pip install supabase python-dotenv
```

### 2 — Set season IDs
Open `transition.py` and update the **CONFIG block** at the top:
```python
OLD_SEASON      = "S24"          # the season that is ending
NEW_SEASON      = "S25"          # the new season to create
NEW_SEASON_NAME = "Season 25"
```

### 3 — Provide credentials
Place a copy of the project root `.env.local` next to `transition.py`
(i.e. inside `tools/season-transition/`).
The script reads `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` from it.

### 4 — Run
```bash
python tools/season-transition/transition.py
```

The script will pause and ask for confirmation before every step that writes to the database.

---

## What the script does (in order)

### Step 1 — Archive to SQLite
Dumps **every relevant table** from Supabase into a local `.db` file:
`flv_S24_archive.db` (name uses OLD_SEASON value).

Tables archived:
- `seasons`, `teams`, `players`
- `team_history`, `player_history`, `player_team_history`
- `matches`, `match_maps`, `match_stats`, `match_stats_map`
- `match_rounds`, `match_player_rounds`

> Keep this file permanently. It is your full offline record of the season
> and can be opened with [DB Browser for SQLite](https://sqlitebrowser.org/).

### Step 2 — Tag untagged matches
Sets `season_id = 'S24'` on any match row that still has `season_id = NULL`.
(Matches created before multi-season support was added fall into this category.)

### Step 3 — Validate & fill history tables
Checks all three history tables for gaps and fills them using current `players`/`teams` data:

| Table | What gets written |
|-------|------------------|
| `player_history` | `player_id`, `season_id`, `rank` — one row per player per season |
| `player_team_history` | `player_id`, `team_id`, `season_id`, `is_current=false` — from `default_team_id` |
| `team_history` | `team_id`, `season_id`, `captain`, `co_captain`, `group_name` |

Already-existing rows are never overwritten.

### Step 4 — Create the new season
- Inserts a new row in the `seasons` table: `{ id: 'S25', name: 'Season 25', is_active: false }`
- After your confirmation: sets `S24.is_active = false` and `S25.is_active = true`

### Step 5 — Verify
Prints a summary showing match counts per season, history table coverage,
and flags any remaining issues.

---

## After the script — manual steps

These are intentionally NOT automated since they require human decisions:

1. **Register new teams** for S25 via the Admin Panel → Teams
2. **Register new players** or update existing player rosters
3. **Update player ranks** from Tracker.gg (optional — run `fix_ranks.py` if needed)
4. **Set the match schedule** (Week 1 matches) via the Admin Panel → Matches
5. **Verify on the portal** — the season selector should show S25 as default

---

## SQL fallback

If the Python script can't connect to Supabase, open `migration_template.sql`
in the **Supabase Dashboard → SQL Editor** and run the statements there.
Edit `'S24'` / `'S25'` at the top before running.

---

## Quick reference checklist

```
□ Edit OLD_SEASON / NEW_SEASON in transition.py
□ Copy .env.local next to transition.py
□ pip install supabase python-dotenv
□ python tools/season-transition/transition.py
□ Confirm each step when prompted
□ Verify archive .db file was created
□ Register new teams in Admin Panel
□ Register/update player rosters
□ Set match schedule
□ Open portal and confirm S25 is the active season
```
