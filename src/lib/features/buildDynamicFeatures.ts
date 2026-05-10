import { supabase } from '@/lib/supabase';

// Map rank strings to numerical values
const RANK_MAP: Record<string, number> = {
    'Iron/Bronze': 2,
    'Silver': 5,
    'Gold': 8,
    'Platinum': 11,
    'Diamond': 14,
    'Ascendant': 17,
    'Immortal 1/2': 20,
    'Immortal 3/Radiant': 23,
    'Radiant': 25
};
const DEFAULT_RANK_VAL = 10;

function getRankValue(rankStr: string | null): number {
    if (!rankStr) return DEFAULT_RANK_VAL;
    for (const [key, val] of Object.entries(RANK_MAP)) {
        if (rankStr.toLowerCase().includes(key.toLowerCase())) return val;
    }
    return DEFAULT_RANK_VAL;
}

export type FeatureVector = {
    order: string[];
    values: number[];
};

export async function buildDynamicFeatures(team1Id: number, team2Id: number): Promise<FeatureVector> {
    // 1. Fetch current rosters for both teams
    const { data: players } = await supabase
        .from('players')
        .select('id, default_team_id, rank')
        .or(`default_team_id.eq.${team1Id},default_team_id.eq.${team2Id}`);

    const t1Players = (players || []).filter(p => p.default_team_id === team1Id);
    const t2Players = (players || []).filter(p => p.default_team_id === team2Id);

    // 2. Fetch pre-calculated historical stats (cached in storage)
    const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    let playerStats: Record<string, { acs: number; kd: number; exp: number }> = {};
    let teamStats: Record<string, { wr: number; form: number; rd: number }> = {};

    try {
        const [psRes, tsRes] = await Promise.all([
            fetch(`${baseUrl}/storage/v1/object/public/models/current/player_stats.json`).then(r => r.json()),
            fetch(`${baseUrl}/storage/v1/object/public/models/current/team_stats.json`).then(r => r.json())
        ]);
        playerStats = psRes;
        teamStats = tsRes;
    } catch (e) {
        console.error('Error fetching dynamic stats:', e);
    }

    const getTeamFeatures = (tid: number) => {
        const h = teamStats[tid];
        if (!h) return { wr: 0.5, form: 0.5, rd: 0 };
        return { wr: h.wr, form: h.form, rd: h.rd };
    };

    const rf1 = (() => {
        const acsList: number[] = [], kdList: number[] = [], rankList: number[] = [], expList: number[] = [];
        t1Players.forEach(p => {
            const rv = getRankValue(p.rank);
            rankList.push(rv);
            const h = playerStats[p.id];
            if (h) { acsList.push(h.acs); kdList.push(h.kd); expList.push(h.exp); }
            else { acsList.push(140 + rv * 6); kdList.push(0.4 + rv * 0.04); expList.push(0); }
        });
        if (acsList.length === 0) return { acs: 150, kd: 1.0, rank: 10, exp: 0 };
        return { acs: acsList.reduce((a,b)=>a+b,0)/acsList.length, kd: kdList.reduce((a,b)=>a+b,0)/kdList.length, rank: rankList.reduce((a,b)=>a+b,0)/rankList.length, exp: expList.reduce((a,b)=>a+b,0) };
    })();

    const rf2 = (() => {
        const acsList: number[] = [], kdList: number[] = [], rankList: number[] = [], expList: number[] = [];
        t2Players.forEach(p => {
            const rv = getRankValue(p.rank);
            rankList.push(rv);
            const h = playerStats[p.id];
            if (h) { acsList.push(h.acs); kdList.push(h.kd); expList.push(h.exp); }
            else { acsList.push(140 + rv * 6); kdList.push(0.4 + rv * 0.04); expList.push(0); }
        });
        if (acsList.length === 0) return { acs: 150, kd: 1.0, rank: 10, exp: 0 };
        return { acs: acsList.reduce((a,b)=>a+b,0)/acsList.length, kd: kdList.reduce((a,b)=>a+b,0)/kdList.length, rank: rankList.reduce((a,b)=>a+b,0)/rankList.length, exp: expList.reduce((a,b)=>a+b,0) };
    })();

    const tm1 = getTeamFeatures(team1Id);
    const tm2 = getTeamFeatures(team2Id);

    const features: Record<string, number> = {
        diff_acs: rf1.acs - rf2.acs,
        diff_kd: rf1.kd - rf2.kd,
        diff_rank: rf1.rank - rf2.rank,
        diff_exp: rf1.exp - rf2.exp,
        diff_wr: tm1.wr - tm2.wr,
        diff_form: tm1.form - tm2.form,
        diff_rd: tm1.rd - tm2.rd
    };

    const order = ["diff_acs", "diff_kd", "diff_rank", "diff_exp", "diff_wr", "diff_form", "diff_rd"];
    const values = order.map(k => features[k]);

    return { order, values };
}
