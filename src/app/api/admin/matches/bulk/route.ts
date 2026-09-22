import { NextRequest, NextResponse } from 'next/server';
import { isAuthorized } from '@/lib/adminAuth';
import { supabaseServer } from '@/lib/supabaseServer';

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  let matches = await req.json();

  if (!Array.isArray(matches)) return NextResponse.json({ error: 'invalid payload' }, { status: 400 });

  // Get active season
  const { data: activeSeason } = await supabaseServer
    .from('seasons')
    .select('id')
    .eq('is_active', true)
    .single();

  if (activeSeason) {
    matches = matches.map((m: any) => {
      if (m.season_id && m.season_id !== activeSeason.id && m.match_type === 'playoff') {
        // See the matching comment in matches/create/route.ts — not blocked,
        // just logged, since intentional historical-season fixes are valid.
        console.warn(
          `[admin/matches/bulk] playoff match created with season_id=${m.season_id} ` +
          `while active season is ${activeSeason.id} — round=${m.playoff_round} pos=${m.bracket_pos}`
        );
      }
      return { ...m, season_id: m.season_id || activeSeason.id };
    });
  }

  const { error } = await supabaseServer.from('matches').insert(matches);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
