import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { supabaseServer } from '@/lib/supabaseServer';

function isAuthorized(req: NextRequest) {
  const cookie = req.cookies.get('admin_session')?.value;
  const token = process.env.ADMIN_TOKEN;
  if (!cookie || !token) return false;
  const [ts, sig] = cookie.split('.');
  const msg = `admin:${ts}`;
  const expected = crypto.createHmac('sha256', token).update(msg).digest('hex');
  const fresh = Math.abs(Date.now() - Number(ts)) < 12 * 60 * 60 * 1000;
  return expected === sig && fresh;
}

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
    matches = matches.map((m: any) => ({
      ...m,
      season_id: m.season_id || activeSeason.id
    }));
  }

  const { error } = await supabaseServer.from('matches').insert(matches);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
