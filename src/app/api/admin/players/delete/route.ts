import { NextRequest, NextResponse } from 'next/server';
import { isAuthorized } from '@/lib/adminAuth';
import { supabaseServer } from '@/lib/supabaseServer';

export async function POST(req: NextRequest) {
    if (!isAuthorized(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    const body = await req.json();
    const { id } = body || {};
    if (!id) return NextResponse.json({ error: 'bad request: id required' }, { status: 400 });

    // First remove player from any match maps (to avoid FK violations)
    await supabaseServer.from('match_map_player_stats').delete().eq('player_id', id);

    const { error } = await supabaseServer.from('players').delete().eq('id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
}
