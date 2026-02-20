import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { buildFeatures } from '@/lib/features/buildFeatures';
import { loadModel } from '@/lib/model/registry';
import { logisticPredict } from '@/lib/model/infer';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const { data: matches } = await supabase
      .from('matches')
      .select('id, week, group_name, team1_id, team2_id, status')
      .neq('status', 'completed')
      .order('week', { ascending: true });

    if (!matches || matches.length === 0) {
      return NextResponse.json({ items: [] });
    }

    const teamIds = Array.from(
      new Set(
        matches.flatMap((m: any) => [m.team1_id, m.team2_id]).filter(Boolean)
      )
    );
    const { data: teams } = await supabase
      .from('teams')
      .select('id,name,tag,logo_display')
      .in('id', teamIds as number[]);
    const teamMap = new Map<number, any>();
    (teams || []).forEach((t: any) => teamMap.set(t.id, t));

    let model: any = null;
    let scalers: any = null;
    try {
      const loaded = await loadModel(false);
      model = loaded.model;
      scalers = loaded.scalers;
    } catch {}

    const items: any[] = [];
    for (const m of matches) {
      try {
        const fv = await buildFeatures(m.team1_id, m.team2_id);
        let prob = 0.5;
        if (model && scalers) {
          prob = logisticPredict(fv.values, model, scalers);
        }
        items.push({
          id: m.id,
          week: m.week,
          group: m.group_name,
          status: m.status,
          team1: teamMap.get(m.team1_id) || { id: m.team1_id, name: 'Team 1' },
          team2: teamMap.get(m.team2_id) || { id: m.team2_id, name: 'Team 2' },
          probability_team1_win: prob,
        });
      } catch {
        items.push({
          id: m.id,
          week: m.week,
          group: m.group_name,
          status: m.status,
          team1: teamMap.get(m.team1_id) || { id: m.team1_id, name: 'Team 1' },
          team2: teamMap.get(m.team2_id) || { id: m.team2_id, name: 'Team 2' },
          probability_team1_win: 0.5,
        });
      }
    }
    return NextResponse.json({ items });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'error' }, { status: 500 });
  }
}
