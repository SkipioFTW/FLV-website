-- 1. Ensure Seasons exist
INSERT INTO public.seasons (id, name, is_active)
VALUES ('S23', 'Season 23', false)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.seasons (id, name, is_active)
VALUES ('S24', 'Season 24', true)
ON CONFLICT (id) DO NOTHING;

-- 2. Clean up matches
UPDATE public.matches SET season_id = 'S23' WHERE season_id IS NULL;

-- 3. Create player_team_history table
-- This table tracks player transfers even within a season.
CREATE TABLE IF NOT EXISTS public.player_team_history (
    id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    player_id integer NOT NULL REFERENCES public.players(id),
    team_id integer NOT NULL REFERENCES public.teams(id),
    season_id text NOT NULL REFERENCES public.seasons(id),
    joined_at timestamp with time zone DEFAULT now(),
    left_at timestamp with time zone,
    is_current boolean DEFAULT true
);

-- 4. Initial population for S23 based on current players' default_team_id
-- We assume these players were part of these teams for S23.
INSERT INTO public.player_team_history (player_id, team_id, season_id, joined_at)
SELECT id, default_team_id, 'S23', '2023-01-01 00:00:00+00'
FROM public.players
WHERE default_team_id IS NOT NULL;

-- 5. Ensure player_history is populated for S23 ranks
INSERT INTO public.player_history (player_id, season_id, rank)
SELECT id, 'S23', rank
FROM public.players
WHERE rank IS NOT NULL;

-- 6. Add a trigger or function for 'automatic' tracking (Optional/Advanced)
-- For now, we will handle this in the application logic when an admin updates a player's team.
