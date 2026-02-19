import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { clearModelCache } from '@/lib/model/registry';

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
  clearModelCache();
  return NextResponse.json({ ok: true });
}
