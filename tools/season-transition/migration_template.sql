-- ============================================================
-- FLV Season Transition — SQL Reference
-- ============================================================
-- PURPOSE: Run these statements manually in the Supabase SQL
--          Editor if you prefer SQL over the Python script,
--          or as a fallback if the Python script fails.
--
-- BEFORE RUNNING: Replace every occurrence of 'S24' and 'S25'
--                 with your actual OLD and NEW season IDs.
-- ============================================================


-- ── STEP 1: Ensure both season records exist ──────────────────

INSERT INTO public.seasons (id, name, is_active)
VALUES ('S24', 'Season 24', false)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.seasons (id, name, is_active)
VALUES ('S25', 'Season 25', false)
ON CONFLICT (id) DO NOTHING;


-- ── STEP 2: Tag any untagged matches as the old season ────────

UPDATE public.matches
SET season_id = 'S24'
WHERE season_id IS NULL;


-- ── STEP 3a: Snapshot player ranks into player_history ────────
-- Fills missing entries; existing rows are left untouched.

INSERT INTO public.player_history (player_id, season_id, rank)
SELECT
    p.id,
    'S24',
    p.rank
FROM public.players p
WHERE p.rank IS NOT NULL
  AND NOT EXISTS (
      SELECT 1 FROM public.player_history ph
      WHERE ph.player_id = p.id
        AND ph.season_id = 'S24'
  );


-- ── STEP 3b: Snapshot player-team affiliations ────────────────
-- Uses default_team_id as the source of truth for the old season.

INSERT INTO public.player_team_history (player_id, team_id, season_id, is_current)
SELECT
    p.id,
    p.default_team_id,
    'S24',
    false
FROM public.players p
WHERE p.default_team_id IS NOT NULL
  AND NOT EXISTS (
      SELECT 1 FROM public.player_team_history pth
      WHERE pth.player_id = p.id
        AND pth.season_id = 'S24'
  );


-- ── STEP 3c: Snapshot team metadata ──────────────────────────

INSERT INTO public.team_history (team_id, season_id, captain, co_captain, group_name)
SELECT
    t.id,
    'S24',
    t.captain,
    t.co_captain,
    t.group_name
FROM public.teams t
WHERE NOT EXISTS (
    SELECT 1 FROM public.team_history th
    WHERE th.team_id = t.id
      AND th.season_id = 'S24'
);


-- ── STEP 4: Activate the new season ──────────────────────────

-- Deactivate all seasons first
UPDATE public.seasons SET is_active = false;

-- Activate the new one
UPDATE public.seasons
SET is_active = true
WHERE id = 'S25';


-- ── STEP 5: Verification queries ─────────────────────────────
-- Run these after to confirm everything looks correct.

-- Count matches per season (should have 0 NULLs)
SELECT season_id, COUNT(*) as match_count
FROM public.matches
GROUP BY season_id
ORDER BY season_id;

-- Count history table coverage
SELECT 'player_history'     AS tbl, season_id, COUNT(*) AS rows FROM public.player_history      GROUP BY season_id
UNION ALL
SELECT 'player_team_history', season_id, COUNT(*)             FROM public.player_team_history   GROUP BY season_id
UNION ALL
SELECT 'team_history',         season_id, COUNT(*)             FROM public.team_history           GROUP BY season_id
ORDER BY tbl, season_id;

-- Show active season
SELECT id, name, is_active FROM public.seasons ORDER BY id;
