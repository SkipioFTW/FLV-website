import { NextRequest, NextResponse } from 'next/server';
import { isAuthorized } from '@/lib/adminAuth';
import { supabaseServer } from '@/lib/supabaseServer';

export async function GET(req: NextRequest) {
    if (!isAuthorized(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

    try {
        const tables = [
            'teams',
            'players',
            'matches',
            'match_maps',
            'match_stats_map',
            'seasons',
            'ai_scenarios'
        ];

        const dump: any = {};
        for (const table of tables) {
            const { data, error } = await supabaseServer.from(table).select('*');
            if (error) throw error;
            dump[table] = data;
        }

        return new NextResponse(JSON.stringify(dump, null, 2), {
            headers: {
                'Content-Type': 'application/json',
                'Content-Disposition': 'attachment; filename=valorant_s23_dump.json'
            }
        });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
