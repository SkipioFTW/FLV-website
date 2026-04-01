-- 1. Ensure Seasons exist
INSERT INTO public.seasons (id, name, is_active)
VALUES ('S23', 'Season 23', false)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.seasons (id, name, is_active)
VALUES ('S24', 'Season 24', true)
ON CONFLICT (id) DO NOTHING;

-- 2. Clean up matches (Tag old matches as S23)
UPDATE public.matches SET season_id = 'S23' WHERE season_id IS NULL;

-- 3. Fix team_history table identity if missing
-- The original schema might be missing a default value for 'id'
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'team_history'
        AND column_name = 'id'
        AND is_identity = 'YES'
    ) THEN
        ALTER TABLE public.team_history ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY;
    END IF;
END $$;

-- 4. Create player_team_history table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.player_team_history (
    id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    player_id integer NOT NULL REFERENCES public.players(id),
    team_id integer NOT NULL REFERENCES public.teams(id),
    season_id text NOT NULL REFERENCES public.seasons(id),
    joined_at timestamp with time zone DEFAULT now(),
    left_at timestamp with time zone,
    is_current boolean DEFAULT true
);

-- 5. Initial population for S23 player-team affiliations
-- Migration assumes players' current 'default_team_id' was their S23 team.
INSERT INTO public.player_team_history (player_id, team_id, season_id, joined_at)
SELECT id, default_team_id, 'S23', '2023-01-01 00:00:00+00'
FROM public.players
WHERE default_team_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- 6. Ensure player_history (ranks) is populated for S23
INSERT INTO public.player_history (player_id, season_id, rank)
SELECT id, 'S23', rank
FROM public.players
WHERE rank IS NOT NULL
ON CONFLICT DO NOTHING;

-- 7. Ensure team_history is populated for S23
INSERT INTO public.team_history (team_id, season_id)
SELECT id, 'S23'
FROM public.teams
ON CONFLICT DO NOTHING;
