import { NextRequest, NextResponse } from 'next/server';
import { buildFeatures } from '@/lib/features/buildFeatures';
import { loadModel } from '@/lib/model/registry';
import { logisticPredict } from '@/lib/model/infer';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const t1 = parseInt(url.searchParams.get('team1_id') || '0', 10);
    const t2 = parseInt(url.searchParams.get('team2_id') || '0', 10);
    if (!t1 || !t2 || t1 === t2) {
      return NextResponse.json({ error: 'invalid team ids' }, { status: 400 });
    }
    const fv = await buildFeatures(t1, t2);
    let prob: number | null = null;
    try {
      const { model, scalers } = await loadModel(false);
      prob = logisticPredict(fv.values, model, scalers);
    } catch {
      // Fallback if model not available yet
      prob = 0.5;
    }
    return NextResponse.json({
      team1_id: t1,
      team2_id: t2,
      probability_team1_win: prob,
      features: fv.order.reduce((acc: any, key, i) => { acc[key] = fv.values[i]; return acc; }, {}),
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'server error' }, { status: 500 });
  }
}
