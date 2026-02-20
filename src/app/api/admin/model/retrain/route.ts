import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

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

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  // Prefer dedicated predictor envs; fallback to existing ones for compatibility
  const token =
    process.env.PREDICTOR_GH_TOKEN ||
    process.env.GH_TOKEN ||
    process.env.GITHUB_TOKEN;
  const owner =
    process.env.PREDICTOR_GITHUB_OWNER ||
    process.env.GITHUB_OWNER ||
    process.env.GH_OWNER ||
    process.env.NEXT_PUBLIC_GITHUB_OWNER;
  const repo =
    process.env.PREDICTOR_GITHUB_REPO ||
    process.env.GITHUB_REPO ||
    process.env.GH_REPO ||
    process.env.NEXT_PUBLIC_GITHUB_REPO;
  const branch =
    process.env.PREDICTOR_GITHUB_BRANCH ||
    process.env.GITHUB_BRANCH ||
    process.env.GH_BRANCH ||
    'main';
  if (!token || !owner || !repo) return NextResponse.json({ error: 'missing github config' }, { status: 500 });
  const url = `https://api.github.com/repos/${owner}/${repo}/actions/workflows/train.yml/dispatches`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/vnd.github+json',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ ref: branch })
  });
  if (!res.ok) {
    const txt = await res.text();
    return NextResponse.json({ error: txt }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
