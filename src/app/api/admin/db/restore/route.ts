import { NextRequest, NextResponse } from 'next/server';
import { isAuthorized } from '@/lib/adminAuth';
import { supabaseServer } from '@/lib/supabaseServer';

export async function POST(req: NextRequest) {
    if (!isAuthorized(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

    const owner = process.env.GH_OWNER;
    const repo = process.env.GH_REPO;
    const path = process.env.GH_DB_PATH || 'data/valorant_s23_dump.json';
    const branch = process.env.GH_BRANCH || 'main';

    if (!owner || !repo) {
        return NextResponse.json({ error: 'GitHub owner/repo not configured' }, { status: 500 });
    }

    try {
        const url = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${path}`;
        const response = await fetch(url, { cache: 'no-store' });

        if (!response.ok) {
            return NextResponse.json({ error: `Failed to fetch restore file: ${response.status}` }, { status: 500 });
        }

        const dump = await response.json();

        // 1. Wipe current data (same as reset)
        const tables = ['match_stats_map', 'match_maps', 'matches', 'players', 'teams', 'seasons', 'ai_scenarios'];
        for (const table of tables) {
            await supabaseServer.from(table).delete().neq('id', -1);
        }

        // 2. Insert data (respecting foreign key order: teams -> players -> matches -> ...)
        const orderedTables = ['seasons', 'teams', 'players', 'matches', 'match_maps', 'match_stats_map', 'ai_scenarios'];

        for (const table of orderedTables) {
            const data = dump[table];
            if (data && Array.isArray(data) && data.length > 0) {
                // Chunk insertion if data is large
                const chunkSize = 100;
                for (let i = 0; i < data.length; i += chunkSize) {
                    const chunk = data.slice(i, i + chunkSize);
                    const { error } = await supabaseServer.from(table).insert(chunk);
                    if (error) {
                        console.error(`Error restoring chunk for table ${table}:`, error);
                    }
                }
            }
        }

        return NextResponse.json({ ok: true });
    } catch (error: any) {
        console.error("Restore failed:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
