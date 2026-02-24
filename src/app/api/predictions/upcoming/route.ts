import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';
import { buildFeatures } from '@/lib/features/buildFeatures';
import { loadModel } from '@/lib/model/registry';
import { logisticPredict } from '@/lib/model/infer';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const { data: matches } = await supabaseServer
      .from('matches')
      .select('id, week, group_name, team1_id, team2_id, status')
      .neq('status', 'completed')
      .order('week', { ascending: true });

    if (!matches || matches.length === 0) {
      return NextResponse.json({ items: [] });
    }

    const { data: teams } = await supabaseServer
      .from('teams')
      .select('id,name,tag,logo_display');
    const teamMap = new Map<number, any>();
    (teams || []).forEach((t: any) => teamMap.set(Number(t.id), t));

    let model: any = null;
    let scalers: any = null;
    try {
      const loaded = await loadModel(false);
      model = loaded.model;
      scalers = loaded.scalers;
    } catch { }

    const items: any[] = [];
    for (const m of matches) {
      try {
        const t1_id = Number(m.team1_id);
        const t2_id = Number(m.team2_id);
        const fv = await buildFeatures(t1_id, t2_id);
        let prob = 0.5;
        if (model && scalers) {
          prob = logisticPredict(fv.values, model, scalers, t1_id, t2_id);
        }
        const t1 = teamMap.get(t1_id) || { id: m.team1_id, name: null, tag: null };
        const t2 = teamMap.get(t2_id) || { id: m.team2_id, name: null, tag: null };
        items.push({
          id: m.id,
          week: m.week,
          group: m.group_name,
          status: m.status,
          team1: { id: t1.id, name: t1.name, tag: t1.tag, logo: t1.logo_display },
          team2: { id: t2.id, name: t2.name, tag: t2.tag, logo: t2.logo_display },
          probability_team1_win: prob,
        });
      } catch {
        const t1 = teamMap.get(Number(m.team1_id)) || { id: m.team1_id, name: null, tag: null };
        const t2 = teamMap.get(Number(m.team2_id)) || { id: m.team2_id, name: null, tag: null };
        items.push({
          id: m.id,
          week: m.week,
          group: m.group_name,
          status: m.status,
          team1: { id: t1.id, name: t1.name, tag: t1.tag, logo: t1.logo_display },
          team2: { id: t2.id, name: t2.name, tag: t2.tag, logo: t2.logo_display },
          probability_team1_win: 0.5,
        });
      }
    }
    return NextResponse.json({ items });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'error' }, { status: 500 });
  }
}
