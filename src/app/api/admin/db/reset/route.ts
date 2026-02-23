import { NextRequest, NextResponse } from 'next/server';
import { isAuthorized } from '@/lib/adminAuth';
import { supabaseServer } from '@/lib/supabaseServer';

export async function POST(req: NextRequest) {
    if (!isAuthorized(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

    try {
        const tables = [
            'match_stats_map',
            'match_maps',
            'matches',
            'players',
            'teams',
            'seasons',
            'ai_scenarios'
        ];

        for (const table of tables) {
            // Wiping rows using a range that covers all IDs or just a generic filter
            // In Supabase/PostgreSQL, to delete all rows without TRUNCATE (which needs higher permissions), 
            // we can eq('id', 'not null') or similar.
            const { error } = await supabaseServer.from(table).delete().neq('id', -1);
            if (error) {
                console.error(`Error resetting table ${table}:`, error);
            }
        }

        return NextResponse.json({ ok: true });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
