import { createClient } from '@supabase/supabase-js';

export async function calculateWinProbability(t1_id: number, t2_id: number): Promise<number> {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // 1. Standings (Calculate R)
    const { data: matches } = await supabase.from("matches").select("team1_id, team2_id, winner_id, score_t1, score_t2").eq("status", "completed");
    const { data: teams } = await supabase.from("teams").select("id, name");

    const summaries: Record<number, any> = {};
    if (teams) {
        for (const t of teams) {
            summaries[t.id] = { points: 0, diff: 0, match_count: 0, rating_r: 0, strength_s: 0, rating_b: 0 };
        }
    }

    if (matches) {
        for (const m of matches) {
            const team1 = m.team1_id;
            const team2 = m.team2_id;
            const s1 = m.score_t1 || 0;
            const s2 = m.score_t2 || 0;
            const winner = m.winner_id;

            if (!summaries[team1] || !summaries[team2]) continue;

            summaries[team1].diff += (s1 - s2);
            summaries[team2].diff += (s2 - s1);
            summaries[team1].match_count += 1;
            summaries[team2].match_count += 1;

            if (winner === team1) {
                summaries[team1].points += 15;
                summaries[team2].points += Math.min(s2, 12);
            } else if (winner === team2) {
                summaries[team2].points += 15;
                summaries[team1].points += Math.min(s1, 12);
            }
        }
    }

    for (const sid of Object.keys(summaries)) {
        const id = parseInt(sid);
        summaries[id].rating_r = summaries[id].points + 0.5 * summaries[id].diff;
    }

    // 2. Player Strength (Calculate S)
    const { data: players } = await supabase.from('players').select('id, default_team_id').not('default_team_id', 'is', null);
    const playerToTeam: Record<number, number> = {};
    if (players) {
        for (const p of players) playerToTeam[p.id] = p.default_team_id;
    }

    const { data: mStats } = await supabase.from('match_stats_map').select('player_id, kills, deaths, acs, adr, kast, plants, defuses, clutches, survived');

    const teamStats: Record<number, any> = {};
    if (mStats) {
        for (const row of mStats) {
            const pid = row.player_id;
            if (!playerToTeam[pid]) continue;
            const tid = playerToTeam[pid];

            if (!teamStats[tid]) {
                teamStats[tid] = { k: 0, d: 0, acs: 0, adr: 0, kast: 0, plants: 0, defuses: 0, clutches: 0, survived: 0, rounds: 0 };
            }
            teamStats[tid].k += row.kills || 0;
            teamStats[tid].d += row.deaths || 0;
            teamStats[tid].acs += row.acs || 0;
            teamStats[tid].adr += row.adr || 0;
            teamStats[tid].kast += row.kast || 0;
            teamStats[tid].plants += row.plants || 0;
            teamStats[tid].defuses += row.defuses || 0;
            teamStats[tid].clutches += row.clutches || 0;
            teamStats[tid].survived += row.survived || 0;
            teamStats[tid].rounds += 1;
        }
    }

    const sValues: number[] = [];
    for (const sid of Object.keys(teamStats)) {
        const tid = parseInt(sid);
        const ts = teamStats[tid];
        if (ts.rounds === 0) continue;

        const avg_acs = ts.acs / ts.rounds;
        const avg_adr = ts.adr / ts.rounds;
        const avg_kast = ts.kast / ts.rounds;
        const avg_kd = ts.k / Math.max(1, ts.d);

        const avg_plants = ts.plants / ts.rounds;
        const avg_defuses = ts.defuses / ts.rounds;
        const avg_clutch = ts.clutches / ts.rounds;
        const avg_surv = ts.survived / ts.rounds;

        const base_s = (avg_acs - 200) + 100 * (avg_kd - 1) + 0.5 * (avg_adr - 130) + 0.2 * (avg_kast - 70);
        const deep_s = (avg_plants * 2.0) + (avg_defuses * 2.0) + (avg_clutch * 10.0) + (avg_surv * 1.5);

        const S = base_s + deep_s;
        if (summaries[tid]) {
            summaries[tid].strength_s = S;
            sValues.push(S);
        }
    }

    // 3. Blended Rating (B)
    let s_mean = 0;
    let s_std = 1;
    if (sValues.length > 1) {
        s_mean = sValues.reduce((a, b) => a + b, 0) / sValues.length;
        s_std = Math.sqrt(sValues.map(x => Math.pow(x - s_mean, 2)).reduce((a, b) => a + b, 0) / sValues.length);
        if (s_std === 0) s_std = 1;

        for (const sid of Object.keys(summaries)) {
            const id = parseInt(sid);
            const z = (summaries[id].strength_s - s_mean) / s_std;
            summaries[id].rating_b = summaries[id].rating_r + 10 * z;
        }
    } else {
        for (const sid of Object.keys(summaries)) {
            const id = parseInt(sid);
            summaries[id].rating_b = summaries[id].rating_r;
        }
    }

    // Logistic Win Probability
    const b1 = summaries[t1_id]?.rating_b || 0;
    const b2 = summaries[t2_id]?.rating_b || 0;
    const delta = b1 - b2;

    // Constant calibrations strictly from old model
    const alpha = 1.5;
    const std_x = 10.0;

    const x_prime = delta / std_x;
    return 1 / (1 + Math.exp(-alpha * x_prime));
}
