import { NextRequest, NextResponse } from 'next/server';
import { isAuthorized } from '@/lib/adminAuth';
import { supabaseServer } from '@/lib/supabaseServer';

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const body = await req.json();

  // Inject active season if missing
  const { data: activeSeason } = await supabaseServer
    .from('seasons')
    .select('id')
    .eq('is_active', true)
    .single();
  if (!body.season_id) {
    if (activeSeason) {
      body.season_id = activeSeason.id;
    }
  } else if (activeSeason && body.season_id !== activeSeason.id && body.match_type === 'playoff') {
    // Not blocked -- staff sometimes need to intentionally write/fix
    // historical-season playoff data -- but this is the exact write shape
    // (a playoff match, tagged with a non-active season_id) that caused the
    // real S25 bracket to get duplicated into S23/S24 (see
    // tools/season-transition/cleanup_playoff_duplicates.py in the
    // FLV-Registration repo). Logging it means a repeat isn't silent.
    console.warn(
      `[admin/matches/create] playoff match created with season_id=${body.season_id} ` +
      `while active season is ${activeSeason.id} — round=${body.playoff_round} pos=${body.bracket_pos}`
    );
  }

  const { data, error } = await supabaseServer
    .from('matches')
    .insert(body)
    .select('id')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ id: data?.id || null });
}
