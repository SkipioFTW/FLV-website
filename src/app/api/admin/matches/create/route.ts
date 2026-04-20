import { NextRequest, NextResponse } from 'next/server';
import { isAuthorized } from '@/lib/adminAuth';
import { supabaseServer } from '@/lib/supabaseServer';

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const body = await req.json();

  // Inject active season if missing
  if (!body.season_id) {
    const { data: activeSeason } = await supabaseServer
      .from('seasons')
      .select('id')
      .eq('is_active', true)
      .single();
    if (activeSeason) {
      body.season_id = activeSeason.id;
    }
  }

  const { data, error } = await supabaseServer
    .from('matches')
    .insert(body)
    .select('id')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ id: data?.id || null });
}
