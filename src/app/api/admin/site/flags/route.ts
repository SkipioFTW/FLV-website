import { NextRequest, NextResponse } from 'next/server';
import { isAuthorized } from '@/lib/adminAuth';
import { supabaseServer } from '@/lib/supabaseServer';

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { key, value } = await req.json();
  if (!key) return NextResponse.json({ error: 'bad request' }, { status: 400 });
  const { error } = await supabaseServer.from('site_settings').upsert({ key, value: String(value) }, { onConflict: 'key' } as any);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
