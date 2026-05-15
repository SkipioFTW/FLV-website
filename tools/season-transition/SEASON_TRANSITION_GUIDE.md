# Season Transition Guide

This guide walks you through transitioning the FLV Portal from one season to the next (e.g., S24 → S25).

> **Important**: Always back up your database before running any migration scripts.

---

## Overview

A season transition involves:
1. Creating the new season record in the database
2. Archiving current season data (player ranks, team affiliations)
3. Tagging existing matches with the current season ID
4. Preparing the new season's data structures
5. Updating the active season flag
6. Deploying and verifying

---

## Prerequisites

- Node.js installed locally
- Access to the `.env.local` file with valid Supabase credentials
- The Supabase service role key (for write operations)

---

## Step-by-Step Process

### Step 1: Update the Migration Script

Open `migrate_season.js` (or `.ts`) and update the season IDs:

```javascript
// Change these values for your transition:
const OLD_SEASON = 'S24';  // The season that's ending
const NEW_SEASON = 'S25';  // The new season starting
```

### Step 2: Update the SQL Template

Open `migration_template.sql` and update the season values:

```sql
-- 1. Ensure the OLD season exists and is deactivated
INSERT INTO public.seasons (id, name, is_active)
VALUES ('S24', 'Season 24', false)
ON CONFLICT (id) DO UPDATE SET is_active = false;

-- 2. Create the NEW season
INSERT INTO public.seasons (id, name, is_active)
VALUES ('S25', 'Season 25', true)
ON CONFLICT (id) DO UPDATE SET is_active = true;

-- 3. Tag any untagged matches as the old season
UPDATE public.matches SET season_id = 'S24' WHERE season_id IS NULL;
```

### Step 3: Run the Migration

```bash
# From the project root:
node tools/season-transition/migrate_season.js
```

**What this does:**
- Creates the new season record
- Tags all existing untagged matches with the old season ID
- Creates `player_history` entries for current player ranks
- Creates `team_history` entries for current team affiliations
- Prepares the new season (inactive by default)

### Step 4: Archive Player Ranks

If player ranks need updating for the new season (e.g., scraping from Tracker.gg):

```bash
# Fix any rank format issues from the old season
python tools/season-transition/fix_ranks.py
```

### Step 5: Populate New Season Data

After registration for the new season is complete:

1. **Teams**: Ensure new teams are in the `teams` table
2. **Team History**: Add entries to `team_history` with the new season ID:
   ```sql
   INSERT INTO public.team_history (team_id, season_id, group_name)
   SELECT id, 'S25', group_name FROM public.teams
   WHERE id IN (/* list of participating team IDs */);
   ```
3. **Player History**: Add entries to `player_history` with new ranks:
   ```sql
   INSERT INTO public.player_history (player_id, season_id, rank)
   SELECT id, 'S25', rank FROM public.players
   WHERE id IN (/* list of participating player IDs */);
   ```
4. **Player-Team History**: Record which players are on which teams:
   ```sql
   INSERT INTO public.player_team_history (player_id, team_id, season_id)
   SELECT id, default_team_id, 'S25' FROM public.players
   WHERE default_team_id IS NOT NULL;
   ```

### Step 6: Activate the New Season

```sql
-- Deactivate all seasons
UPDATE public.seasons SET is_active = false;

-- Activate the new season
UPDATE public.seasons SET is_active = true WHERE id = 'S25';
```

### Step 7: Verify

1. Visit the portal and check the season selector shows the new season
2. Standings page should show new season teams (empty stats initially)
3. Old season should still be accessible via the season dropdown
4. Leaderboard should show "No stats yet" for the new season

### Step 8: Update the Discord Bot

If the bot has hardcoded season references, update them:
- Check `Skipio-bot/config.py` for any season defaults
- The bot should automatically use the active season from the database

---

## File Reference

| File | Purpose |
|------|---------|
| `migrate_season.js` | Node.js migration script (uses Supabase RPC) |
| `migrate_season.ts` | TypeScript version of the migration |
| `migration_template.sql` | Raw SQL template (run in Supabase SQL Editor) |
| `fix_ranks.py` | Python script to normalize rank strings |

---

## Troubleshooting

### "Migration Failed (DB Level)"
- Check that the `exec_sql` RPC function exists in your Supabase project
- Alternatively, run the SQL directly in the Supabase SQL Editor

### Matches not showing for the new season
- Verify matches have `season_id` set to the new season ID
- Check that `team_history` entries exist for the new season

### Players missing from leaderboard
- Ensure `player_history` entries exist for the new season
- For S23 legacy data, the system falls back to showing all players if no history exists

---

## Quick Reference Checklist

```
□ Back up database
□ Update season IDs in migration scripts
□ Run migration script (or SQL template)
□ Fix ranks if needed
□ Populate team_history for new season
□ Populate player_history for new season
□ Populate player_team_history for new season
□ Activate new season (set is_active = true)
□ Verify portal loads correctly
□ Verify old season still accessible
□ Update Discord bot if needed
□ Deploy to production
```
