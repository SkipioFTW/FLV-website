# Season Transition Guide

This folder contains **everything you need** to move from one FLV season to the next.
The process has been consolidated into a single Python script — run it and confirm each step.

---

## Files in this folder

| File | Purpose |
|------|---------|
| `transition.py` | **The one script to run.** Does everything step-by-step with confirmations. |
| `migration_template.sql` | SQL-only fallback — run in the Supabase SQL Editor if the Python script fails. |
| `flv_S##_archive.db` | Created by `transition.py` — SQLite offline archive of the old season. |

> **Note on `fix_ranks.py`**: This was a one-off legacy script that converted old internal rank codes
> (e.g. `7pr` → `Immortal 3/Radiant`) and deduplicated `player_history` rows. It has already served
> its purpose and should **not** be run as part of any regular season transition. It is kept only as
> a historical reference.

---

## How to run the transition

### 1 — Install dependencies (once)
```bash
pip install supabase python-dotenv
```

### 2 — Set season IDs
Open `transition.py` and update the **CONFIG block** at the top (currently set for
the S25 → S26 transition):
```python
OLD_SEASON      = "S25"          # the season that is ending
NEW_SEASON      = "S26"          # the new season to create
NEW_SEASON_NAME = "Season 26"
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
- `league_snapshots`
- `fantasy_teams`, `fantasy_rounds`, `fantasy_lineups`, `fantasy_results`, `fantasy_settings`
  (added mid-S25 — see the new "Fantasy" note under Step 3 below)
- `lockout_matches`, `lockout_teams`, `lockout_roster` (also season-scoped;
  skipped automatically if the tables don't exist or aren't in use)

> Keep this file permanently. It is your full offline record of the season
> and can be opened with [DB Browser for SQLite](https://sqlitebrowser.org/).

### Step 2 — Tag untagged matches
Sets `season_id = 'S24'` on any match row that still has `season_id = NULL`.

### Step 3 — Validate & fill history tables
Checks all three history tables for gaps and fills them using current `players`/`teams` data:

| Table | What gets written |
|-------|------------------|
| `player_history` | `player_id`, `season_id`, `rank` — one row per player per season |
| `player_team_history` | `player_id`, `team_id`, `season_id`, `is_current=false` — from `default_team_id` |
| `team_history` | `team_id`, `season_id`, `captain`, `co_captain`, `group_name` |

Already-existing rows are never overwritten.

> **Fantasy:** `fantasy_teams`/`fantasy_rounds` are season-scoped by an explicit
> `season_id` column that `api/fantasy.js`/`api/fantasy-admin.js` always pass on
> writes (`seasonOf(env)`, which reads `env.CURRENT_SEASON_ID`) — so the DB
> column's own `DEFAULT 'S25'` is not actually load-bearing, but it is stale and
> should be bumped when convenient (`ALTER TABLE ... ALTER COLUMN season_id SET
> DEFAULT 'S26'` on both tables) so it stops lying about the current season.
> This script only archives the old season's fantasy rows — it does **not**
> create `fantasy_rounds` for the new season. Do that via the Fantasy Admin tab
> in `staff.html` after the new season is active.

> **Important:** `is_current` is scoped per `(player_id, season_id)`, not "still active
> today" — `lib/data.ts`'s `getPlayerStats` reads `season_id = X AND is_current = true`
> to find a player's team for *any* season, including past ones. Never bulk-flip a past
> season's rows to `is_current=false` — that breaks that season's team lookup once the
> player's `default_team_id` changes. Only set `is_current=false` when a player has more
> than one `team_id` row for the *same* season (a real mid-season swap); keep the most
> recent row `true`.

### Step 4 — Record the season champion
Prompts for the winning team's numeric ID and saves it as `winner_id` on the old season row.
You can skip this and set it later via the Supabase dashboard if the winner isn't decided yet.

### Step 5 — Deactivate old league snapshots
Sets `is_active = false` on all `league_snapshots` rows, so the new season starts clean.
A new snapshot will be generated once the first matches of the new season are entered.

### Step 6 — Create the new season
- Inserts a new row in the `seasons` table: `{ id: 'S25', name: 'Season 25', is_active: false }`
- After your confirmation: sets `S24.is_active = false` and `S25.is_active = true`

### Step 7 — Verify
Prints a summary showing match counts per season, history table coverage, champion info,
and flags any remaining issues.

---

## After the script — manual steps

These are intentionally **not** automated since they require human decisions:

1. **Register new teams** for S26 via the Admin Panel → Teams
2. **Register new players** or update existing player rosters (import from new DB — separate process)
3. **Set the match schedule** (Week 1 matches) via the Admin Panel → Matches
4. **Verify on the portal** — the season selector should show S26 as default
5. **Bump the FLV-Registration repo's season constants** (separate repo, not
   touched by this script or by `.env.local` here):
   - `js/shared/config.js` → `CURRENT_SEASON_ID` / `CURRENT_SEASON_NAME`
   - `api/fantasy.js` and `api/fantasy-admin.js` → the `seasonOf()` fallback
     literal (`env?.CURRENT_SEASON_ID || 'S25'`) — there's no
     `CURRENT_SEASON_ID` var in `wrangler.jsonc` today, so this hardcoded
     fallback is what Fantasy actually uses at runtime
6. **Create `fantasy_rounds` for S26** via the Fantasy Admin tab in `staff.html`
   (not automated by this tool)

---

## SQL fallback

If the Python script can't connect to Supabase, open `migration_template.sql`
in the **Supabase Dashboard → SQL Editor** and run the statements there.
Edit `'S25'` / `'S26'` at the top before running.

---

## Quick reference checklist

```
□ Edit OLD_SEASON / NEW_SEASON in transition.py
□ Copy .env.local next to transition.py
□ pip install supabase python-dotenv
□ python tools/season-transition/transition.py
□ Confirm each step when prompted
□   Step 1: SQLite archive created ✓
□   Step 2: All matches tagged with season_id ✓
□   Step 3: All history tables filled ✓
□   Step 4: Season champion (winner_id) recorded ✓
□   Step 5: Old league snapshots deactivated ✓
□   Step 6: New season created and activated ✓
□   Step 7: Verification summary looks clean ✓
□ Register new teams in Admin Panel
□ Register/update player rosters
□ Set match schedule
□ Open portal and confirm S26 is the active season
□ Bump CURRENT_SEASON_ID/CURRENT_SEASON_NAME in FLV-Registration (config.js +
  fantasy.js/fantasy-admin.js seasonOf() fallback)
□ Create S26 fantasy_rounds via Fantasy Admin tab
```
