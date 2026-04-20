import { NextRequest, NextResponse } from 'next/server';
import { isAuthorized } from '@/lib/adminAuth';
import { supabaseServer } from '@/lib/supabaseServer';

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const body = await req.json();
  const { id, update } = body || {};
  if (!id || !update) return NextResponse.json({ error: 'bad request' }, { status: 400 });
  const upd = { ...update };
  if (typeof upd.is_forfeit === 'boolean') upd.is_forfeit = upd.is_forfeit ? 1 : 0;
  const { error } = await supabaseServer.from('matches').update(upd).eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
