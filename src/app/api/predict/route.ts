import { NextRequest, NextResponse } from 'next/server';
import { buildFeatures } from '@/lib/features/buildFeatures';
import { buildDynamicFeatures } from '@/lib/features/buildDynamicFeatures';
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
    let prob: number | null = null;
    let modelRaw: { type: string; teams?: Record<number, { rating_b: number; strength_s: number }> } | null = null;
    let features: Record<string, number> = {};

    try {
      const { model, scalers } = await loadModel(false);
      modelRaw = model;

      if (model.type !== 'b_ratings') {
        const dfv = await buildDynamicFeatures(t1, t2);
        prob = logisticPredict(dfv.values, model, scalers, t1, t2);
        features = dfv.order.reduce((acc: Record<string, number>, key, i) => {
          acc[key] = dfv.values[i];
          return acc;
        }, {});
      } else {
        const fv = await buildFeatures(t1, t2);
        prob = logisticPredict(fv.values, model, scalers, t1, t2);
        features = fv.order.reduce((acc: Record<string, number>, key, i) => {
          acc[key] = fv.values[i];
          return acc;
        }, {});
      }
    } catch (e) {
      console.error('Prediction error:', e);
      prob = 0.5;
    }

    // Inject Old Model detailed features for inspection
    let finalFeatures: Record<string, number | undefined> = { ...features };
    if (modelRaw?.type === 'b_ratings' && modelRaw.teams) {
      finalFeatures = {
        t1_rating_b: modelRaw.teams[t1]?.rating_b,
        t2_rating_b: modelRaw.teams[t2]?.rating_b,
        t1_strength_s: modelRaw.teams[t1]?.strength_s,
        t2_strength_s: modelRaw.teams[t2]?.strength_s,
        ...finalFeatures
      };
    }

    return NextResponse.json({
      team1_id: t1,
      team2_id: t2,
      probability_team1_win: prob,
      features: finalFeatures
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
