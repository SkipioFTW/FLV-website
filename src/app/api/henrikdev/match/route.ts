import { NextRequest, NextResponse } from 'next/server';
import { isAuthorized } from '@/lib/adminAuth';

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const mid = searchParams.get('mid');
  const region = searchParams.get('region') || 'na';

  if (!mid) {
    return NextResponse.json({ error: 'Missing match ID (mid)' }, { status: 400 });
  }

  const apiKey = process.env.HENDRIK_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: 'HenrikDev API key not configured. Add HENDRIK_API_KEY to your environment variables.' },
      { status: 500 }
    );
  }

  // Sanitize match ID — Valorant match UUIDs are hex + dashes
  const cleanId = mid.replace(/[^A-Za-z0-9\-]/g, '');
  if (!cleanId) {
    return NextResponse.json({ error: 'Invalid match ID format' }, { status: 400 });
  }

  const validRegions = ['na', 'eu', 'ap', 'kr', 'latam', 'br'];
  const safeRegion = validRegions.includes(region) ? region : 'na';

  const url = `https://api.henrikdev.xyz/valorant/v4/match/${safeRegion}/${cleanId}`;

  try {
    const res = await fetch(url, {
      headers: { Authorization: apiKey },
      cache: 'no-store',
    });

    if (!res.ok) {
      const txt = await res.text();
      return NextResponse.json(
        { error: `HenrikDev API returned ${res.status}: ${txt}` },
        { status: res.status }
      );
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || 'Failed to reach HenrikDev API' },
      { status: 500 }
    );
  }
}
