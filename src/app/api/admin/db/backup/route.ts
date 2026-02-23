import { NextRequest, NextResponse } from 'next/server';
import { isAuthorized } from '@/lib/adminAuth';
import { supabaseServer } from '@/lib/supabaseServer';

export async function POST(req: NextRequest) {
    if (!isAuthorized(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

    const owner = process.env.GH_OWNER;
    const repo = process.env.GH_REPO;
    const path = process.env.GH_DB_PATH || 'data/valorant_s23_dump.json';
    const branch = process.env.GH_BRANCH || 'main';
    const token = process.env.GH_TOKEN;

    if (!owner || !repo || !token) {
        return NextResponse.json({ error: 'GitHub secrets not configured' }, { status: 500 });
    }

    try {
        // 1. Generate Dump
        const tables = ['teams', 'players', 'matches', 'match_maps', 'match_stats_map', 'seasons', 'ai_scenarios'];
        const dump: any = {};
        for (const table of tables) {
            const { data, error } = await supabaseServer.from(table).select('*');
            if (error) throw error;
            dump[table] = data;
        }
        const content = JSON.stringify(dump, null, 2);

        // 2. Get existing file SHA if any
        const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;
        const headers = {
            'Authorization': `Bearer ${token}`,
            'Accept': 'application/vnd.github+json'
        };

        let sha: string | undefined;
        try {
            const gr = await fetch(`${url}?ref=${branch}`, { headers });
            if (gr.ok) {
                const data = await gr.json();
                sha = data.sha;
            }
        } catch (e) { }

        // 3. Upload to GitHub
        const payload = {
            message: 'Portal DB backup (JSON)',
            content: Buffer.from(content).toString('base64'),
            branch,
            sha
        };

        const pr = await fetch(url, {
            method: 'PUT',
            headers,
            body: JSON.stringify(payload)
        });

        if (pr.ok) {
            return NextResponse.json({ ok: true });
        } else {
            const errText = await pr.text();
            return NextResponse.json({ error: `GitHub API error: ${pr.status} ${errText}` }, { status: 500 });
        }
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
