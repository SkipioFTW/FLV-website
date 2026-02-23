import { NextRequest, NextResponse } from 'next/server';
import { isAuthorized } from '@/lib/adminAuth';
import { supabaseServer } from '@/lib/supabaseServer';

export async function POST(req: NextRequest) {
    if (!isAuthorized(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    const body = await req.json();
    const { id } = body || {};
    if (!id) return NextResponse.json({ error: 'bad request: id required' }, { status: 400 });

    // Remove match maps and player stats first
    const { data: maps } = await supabaseServer.from('match_maps').select('id').eq('match_id', id);
    if (maps && maps.length > 0) {
        const mapIds = maps.map((m: any) => m.id);
        await supabaseServer.from('match_map_player_stats').delete().in('map_id', mapIds);
        await supabaseServer.from('match_maps').delete().eq('match_id', id);
    }

    const { error } = await supabaseServer.from('matches').delete().eq('id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
}
