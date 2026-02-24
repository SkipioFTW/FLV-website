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
    let modelRaw: any = null;
    try {
      const { model, scalers } = await loadModel(false);
      prob = logisticPredict(fv.values, model, scalers, t1, t2);
      modelRaw = model;
    } catch {
      prob = 0.5;
    }

    // Inject Old Model detailed features for inspection
    let features = fv.order.reduce((acc: any, key, i) => { acc[key] = fv.values[i]; return acc; }, {});
    if (modelRaw?.type === 'b_ratings') {
      features = {
        t1_rating_b: modelRaw.teams?.[t1]?.rating_b,
        t2_rating_b: modelRaw.teams?.[t2]?.rating_b,
        t1_strength_s: modelRaw.teams?.[t1]?.strength_s,
        t2_strength_s: modelRaw.teams?.[t2]?.strength_s,
        ...features
      };
    }

    return NextResponse.json({
      team1_id: t1,
      team2_id: t2,
      probability_team1_win: prob,
      features
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'server error' }, { status: 500 });
  }
}
