import { supabase } from '@/lib/supabase';

export type FeatureVector = {
  order: string[];
  values: number[];
};

type RollingEntry = { week: number; acs: number; kd: number; adr: number; kast: number; players_acs: number[] };

const WINDOW_N = 5;
const DECAY_LAMBDA = 0.07; // ~10-day half-life if week~day*7
const ELO_K = 24;

export async function buildFeatures(team1Id: number, team2Id: number): Promise<FeatureVector> {
  const { data: matches } = await supabase
    .from('matches')
    .select('id,team1_id,team2_id,winner_id,week,status')
    .eq('status', 'completed')
    .order('id', { ascending: true });
  const { data: stats } = await supabase
    .from('match_stats_map')
    .select('match_id,team_id,acs,kills,deaths,adr,kast');
  if (!matches || matches.length === 0) {
    return { order: ['x_acs', 'x_kd', 'x_adr', 'x_kast', 'x_recent_acs', 'x_consistency', 'x_carry', 'x_recent_wr', 'x_elo', 'x_interaction_1', 'rd', 'maps_played'], values: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] };
  }
  const maxWeek = Math.max(...matches.map(m => m.week || 0));
  const perMatchTeam = new Map<string, { players_acs: number[]; kills: number; deaths: number; adr_vals: number[]; kast_vals: number[] }>();
  (stats || []).forEach((s: any) => {
    const key = `${s.match_id}:${s.team_id}`;
    const rec = perMatchTeam.get(key) || { players_acs: [], kills: 0, deaths: 0, adr_vals: [], kast_vals: [] };
    rec.players_acs.push(s.acs || 0);
    rec.kills += s.kills || 0;
    rec.deaths += s.deaths || 0;
    if (s.adr !== null && s.adr !== undefined) rec.adr_vals.push(s.adr);
    if (s.kast !== null && s.kast !== undefined) rec.kast_vals.push(s.kast);
    perMatchTeam.set(key, rec);
  });
  const rolling = new Map<number, RollingEntry[]>();
  const wins = new Map<number, number[]>(); // 1/0 list
  const elo = new Map<number, number>();
  const getElo = (id: number) => elo.get(id) ?? 1500;
  const pushRolling = (id: number, entry: RollingEntry) => {
    const arr = rolling.get(id) ?? [];
    arr.push(entry);
    if (arr.length > WINDOW_N) arr.shift();
    rolling.set(id, arr);
  };
  const pushWin = (id: number, r: number) => {
    const arr = wins.get(id) ?? [];
    arr.push(r);
    if (arr.length > WINDOW_N) arr.shift();
    wins.set(id, arr);
  };
  for (const m of matches) {
    const mid = m.id as number;
    const t1 = m.team1_id as number;
    const t2 = m.team2_id as number;
    const week = m.week || 0;
    const k1 = perMatchTeam.get(`${mid}:${t1}`) || { players_acs: [], kills: 0, deaths: 0, adr_vals: [], kast_vals: [] };
    const k2 = perMatchTeam.get(`${mid}:${t2}`) || { players_acs: [], kills: 0, deaths: 0, adr_vals: [], kast_vals: [] };
    const acs1 = k1.players_acs.length ? k1.players_acs.reduce((a, b) => a + b, 0) / k1.players_acs.length : 0;
    const acs2 = k2.players_acs.length ? k2.players_acs.reduce((a, b) => a + b, 0) / k2.players_acs.length : 0;
    const kd1 = k1.deaths ? k1.kills / k1.deaths : k1.kills;
    const kd2 = k2.deaths ? k2.kills / k2.deaths : k2.kills;
    const adr1 = k1.adr_vals.length ? k1.adr_vals.reduce((a, b) => a + b, 0) / k1.adr_vals.length : 0;
    const adr2 = k2.adr_vals.length ? k2.adr_vals.reduce((a, b) => a + b, 0) / k2.adr_vals.length : 0;
    const kast1 = k1.kast_vals.length ? k1.kast_vals.reduce((a, b) => a + b, 0) / k1.kast_vals.length : 0;
    const kast2 = k2.kast_vals.length ? k2.kast_vals.reduce((a, b) => a + b, 0) / k2.kast_vals.length : 0;

    pushRolling(t1, { week, acs: acs1, kd: kd1, adr: adr1, kast: kast1, players_acs: k1.players_acs });
    pushRolling(t2, { week, acs: acs2, kd: kd2, adr: adr2, kast: kast2, players_acs: k2.players_acs });
    const w1 = m.winner_id === t1 ? 1 : 0;
    pushWin(t1, w1);
    pushWin(t2, 1 - w1);
    // ELO update after result
    const e1 = getElo(t1), e2 = getElo(t2);
    const expected1 = 1 / (1 + Math.pow(10, (e2 - e1) / 400));
    const res1 = w1;
    elo.set(t1, e1 + ELO_K * (res1 - expected1));
    elo.set(t2, e2 + ELO_K * ((1 - res1) - (1 - expected1)));
  }
  function aggregate(teamId: number) {
    const arr = rolling.get(teamId) ?? [];
    if (arr.length === 0) return { avg_acs: 0, kd: 1, adr: 0, kast: 0, w_acs: 0, var_acs: 0, carry_ratio: 1, wr: 0.5 };
    const weights: number[] = [];
    const acsVals: number[] = [];
    const kdVals: number[] = [];
    const adrVals: number[] = [];
    const kastVals: number[] = [];
    const playersAll: number[] = [];
    for (const e of arr) {
      const deltaW = Math.max(0, (maxWeek) - (e.week || 0));
      const w = Math.exp(-DECAY_LAMBDA * deltaW * 7);
      weights.push(w);
      acsVals.push(e.acs);
      kdVals.push(e.kd);
      adrVals.push(e.adr);
      kastVals.push(e.kast);
      playersAll.push(...e.players_acs);
    }
    const wsum = weights.reduce((a, b) => a + b, 0) || 1;
    const w_acs = weights.map((w, i) => w * acsVals[i]).reduce((a, b) => a + b, 0) / wsum;
    const avg_acs = acsVals.reduce((a, b) => a + b, 0) / acsVals.length;
    const kd = kdVals.reduce((a, b) => a + b, 0) / kdVals.length;
    const adr = adrVals.reduce((a, b) => a + b, 0) / adrVals.length;
    const kast = kastVals.reduce((a, b) => a + b, 0) / kastVals.length;

    let var_acs = 0, carry_ratio = 1;
    if (playersAll.length >= 2) {
      const mean = playersAll.reduce((a, b) => a + b, 0) / playersAll.length;
      var_acs = playersAll.reduce((a, b) => a + (b - mean) * (b - mean), 0) / (playersAll.length - 1);
      carry_ratio = mean > 0 ? Math.max(...playersAll) / mean : 1;
    }
    const wrArr = wins.get(teamId) ?? [];
    const wr = wrArr.length ? wrArr.reduce((a, b) => a + b, 0) / wrArr.length : 0.5;
    return { avg_acs, kd, adr, kast, w_acs, var_acs, carry_ratio, wr };
  }
  const t1f = aggregate(team1Id);
  const t2f = aggregate(team2Id);
  const e1 = getElo(team1Id), e2 = getElo(team2Id);
  const features: Record<string, number> = {
    x_acs: (t1f.avg_acs - t2f.avg_acs),
    x_kd: (t1f.kd - t2f.kd),
    x_adr: (t1f.adr - t2f.adr),
    x_kast: (t1f.kast - t2f.kast),
    x_recent_acs: (t1f.w_acs - t2f.w_acs),
    x_consistency: (t2f.var_acs - t1f.var_acs),
    x_carry: (t2f.carry_ratio - t1f.carry_ratio),
    x_recent_wr: (t1f.wr - t2f.wr),
    x_elo: (e1 - e2),
    x_interaction_1: (t1f.avg_acs - t2f.avg_acs) * (t1f.wr - t2f.wr),
    rd: 0,
    maps_played: 0
  };
  const order = Object.keys(features);
  const values = order.map(k => features[k]);
  return { order, values };
}
