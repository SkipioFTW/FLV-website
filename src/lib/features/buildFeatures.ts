import { supabase } from '@/lib/supabase';

export type FeatureVector = {
  order: string[];
  values: number[];
};

async function getRecentMatches(teamId: number, limit = 5) {
  const { data, error } = await supabase
    .from('matches')
    .select('*')
    .or(`team1_id.eq.${teamId},team2_id.eq.${teamId}`)
    .order('id', { ascending: false })
    .limit(limit);
  if (error) return [];
  return data || [];
}

async function getTeamPoints(teamId: number): Promise<number> {
  const { data: maps } = await supabase
    .from('match_maps')
    .select('match_id, team1_rounds, team2_rounds');
  const { data: matches } = await supabase
    .from('matches')
    .select('*')
    .or(`team1_id.eq.${teamId},team2_id.eq.${teamId}`);
  if (!matches || !maps) return 0;
  const roundsByMatch = new Map<number, { t1: number; t2: number }>();
  maps.forEach((m: any) => {
    const agg = roundsByMatch.get(m.match_id) || { t1: 0, t2: 0 };
    agg.t1 += m.team1_rounds || 0;
    agg.t2 += m.team2_rounds || 0;
    roundsByMatch.set(m.match_id, agg);
  });
  let pts = 0;
  matches.forEach((m: any) => {
    const isT1 = m.team1_id === teamId;
    const r = roundsByMatch.get(m.id) || { t1: 0, t2: 0 };
    const my = isT1 ? r.t1 : r.t2;
    const op = isT1 ? r.t2 : r.t1;
    if (m.winner_id && m.winner_id === teamId) pts += 15;
    else pts += Math.min(my, 12);
  });
  return pts;
}

async function getRecentForm(teamId: number, sample = 5) {
  const ms = await getRecentMatches(teamId, sample);
  if (ms.length === 0) return { wr: 0, rd: 0 };
  let wins = 0;
  let rd = 0;
  for (const m of ms) {
    const { data: rounds } = await supabase
      .from('match_maps')
      .select('team1_rounds, team2_rounds')
      .eq('match_id', m.id);
    const agg = (rounds || []).reduce(
      (acc: any, r: any) => {
        acc.t1 += r.team1_rounds || 0;
        acc.t2 += r.team2_rounds || 0;
        return acc;
      },
      { t1: 0, t2: 0 }
    );
    const isT1 = m.team1_id === teamId;
    const my = isT1 ? agg.t1 : agg.t2;
    const op = isT1 ? agg.t2 : agg.t1;
    if (m.winner_id && m.winner_id === teamId) wins += 1;
    rd += (my || 0) - (op || 0);
  }
  return { wr: wins / ms.length, rd };
}

export async function buildFeatures(team1Id: number, team2Id: number): Promise<FeatureVector> {
  // Minimal robust features to start; extend as needed
  const [p1, p2, f1, f2] = await Promise.all([
    getTeamPoints(team1Id),
    getTeamPoints(team2Id),
    getRecentForm(team1Id, 5),
    getRecentForm(team2Id, 5),
  ]);

  const features: Record<string, number> = {
    points_diff: (p1 || 0) - (p2 || 0),
    recent_wr_diff: (f1.wr || 0) - (f2.wr || 0),
    recent_rd_diff: (f1.rd || 0) - (f2.rd || 0),
  };
  const order = Object.keys(features);
  const values = order.map((k) => features[k]);
  return { order, values };
}
