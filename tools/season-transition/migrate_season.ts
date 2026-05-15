import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load env from .env.local
dotenv.config({ path: path.resolve(__dirname, '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function runMigration() {
    console.log('--- Starting S24 Database Migration ---');

    const sql = `
        -- 1. Ensure S23 season exists
        INSERT INTO public.seasons (id, name, is_active) 
        VALUES ('S23', 'Season 23', false) 
        ON CONFLICT (id) DO NOTHING;

        -- 2. Update Matches Table
        DO $$ 
        BEGIN 
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='matches' AND column_name='season_id') THEN
                ALTER TABLE public.matches ADD COLUMN season_id TEXT;
            END IF;
        END $$;

        UPDATE public.matches SET season_id = 'S23' WHERE season_id IS NULL;

        -- Use a separate DO block or check for constraint existence
        DO $$
        BEGIN
            IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name='matches_season_id_fkey') THEN
                ALTER TABLE public.matches ADD CONSTRAINT matches_season_id_fkey FOREIGN KEY (season_id) REFERENCES public.seasons(id);
            END IF;
        END $$;

        -- 3. Create Player History
        CREATE TABLE IF NOT EXISTS public.player_history (
            id SERIAL PRIMARY KEY,
            player_id INT REFERENCES public.players(id),
            season_id TEXT REFERENCES public.seasons(id),
            rank TEXT,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );

        -- 4. Initial Migration of Ranks to S23
        INSERT INTO public.player_history (player_id, season_id, rank)
        SELECT id, 'S23', rank FROM public.players
        WHERE rank IS NOT NULL
        ON CONFLICT DO NOTHING;

        -- 5. Prepare S24 season (not active yet)
        INSERT INTO public.seasons (id, name, is_active) 
        VALUES ('S24', 'Season 24', false) 
        ON CONFLICT (id) DO NOTHING;

        SELECT 'Success' as status;
    `;

    console.log('Executing SQL via RPC exec_sql...');
    const { data, error } = await supabase.rpc('exec_sql', { query_text: sql });

    if (error) {
        console.error('Migration Failed:', error.message);
        process.exit(1);
    }

    console.log('Migration Result:', data);
    console.log('--- Migration Complete ---');
}

runMigration();
