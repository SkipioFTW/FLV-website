/**
 * League Snapshot Generator (Optimized & Compact)
 *
 * Aggregates all league data into a MINIFIED JSON object
 * to stay within LLM token limits (especially Gemini Free Tier).
 *
 * Compact Key Map:
 *  - st: standings, ts: team_stats, ps: player_stats, ms: map_stats, as: agent_stats
 *  - ld: leaders, h2h: head_to_head, res: match_results
 *  - n: name, t: tag/team, m: matches, k: kills, d: deaths, a: assists
 *  - acs: avg_acs, adr: avg_adr, k: kills, d: deaths, kd: k/d ratio
 *  - ei: entry_impact, c: clutches, wr: win_rate
 */

import { supabase } from '../supabase';

// ─── Types (Compact) ──────────────────────────────────────────────────

export interface LeagueSnapshot {
    at: string; // generated_at
    ov: { t: number; p: number; m: number }; // overview
    st: any[]; // standings
    ts: any[]; // team_stats
    ps: any[]; // player_stats
    ms: any[]; // map_stats
    as: any[]; // agent_stats
    ld: any;    // leaders
    h2h: any[]; // head_to_head
    res: any[]; // match_results
}

// ─── Helpers ─────────────────────────────────────────────────────────

async function fetchAll(table: string, columns: string): Promise<any[]> {
    const PAGE = 1000;
    let all: any[] = [];
    let from = 0;
    while (true) {
        const { data, error } = await supabase
            .from(table)
            .select(columns)
            .range(from, from + PAGE - 1);
        if (error) throw error;
        if (!data || data.length === 0) break;
        all = all.concat(data);
        if (data.length < PAGE) break;
        from += PAGE;
    }
    return all;
}

// ─── Main Generator ──────────────────────────────────────────────────

export async function generateLeagueSnapshot(): Promise<LeagueSnapshot> {
    const [teams, players, matches, matchMaps, statsRaw, roundsRaw] = await Promise.all([
        fetchAll('teams', 'id,name,tag,group_name'),
        fetchAll('players', 'id,name,riot_id,default_team_id'),
        fetchAll('matches', 'id,week,team1_id,team2_id,winner_id,status,match_type,format,score_t1,score_t2'),
        fetchAll('match_maps', 'match_id,map_index,map_name,team1_rounds,team2_rounds,winner_id'),
        fetchAll('match_stats_map', 'player_id,team_id,match_id,map_index,agent,acs,kills,deaths,assists,adr,kast,hs_pct,fk,fd,clutches'),
        fetchAll('match_rounds', 'match_id,map_index,round_number,winning_team_id'),
    ]);

    const excludeNames = new Set(['FAT1', 'FAT2']);
    const excludeIds = new Set(teams.filter((t: any) => excludeNames.has(t.name)).map((t: any) => t.id));
    const activeTeams = teams.filter((t: any) => !excludeNames.has(t.name));

    const completedMatches = matches.filter((m: any) => m.status === 'completed');
    const completedIds = new Set(completedMatches.map((m: any) => m.id));
    const validMatches = completedMatches.filter(
        (m: any) => !excludeIds.has(m.team1_id) && !excludeIds.has(m.team2_id)
    );

    const teamById = new Map(teams.map((t: any) => [t.id, t]));
    const playerById = new Map(players.map((p: any) => [p.id, p]));
    const teamTag = (id: number) => teamById.get(id)?.tag || '??';
    const teamName = (id: number) => teamById.get(id)?.name || 'Unknown';

    const stats = statsRaw.filter((s: any) => completedIds.has(s.match_id));
    const rounds = roundsRaw.filter((r: any) => completedIds.has(r.match_id));

    const mapsByMatch = new Map<number, any[]>();
    matchMaps.filter((m: any) => completedIds.has(m.match_id)).forEach((m: any) => {
        const arr = mapsByMatch.get(m.match_id) || [];
        arr.push(m);
        mapsByMatch.set(m.match_id, arr);
    });

    // 1. Standings
    const standingsMap = new Map<number, { w: number; l: number; p: number; pa: number; rf: number; ra: number }>();
    activeTeams.forEach((t: any) => standingsMap.set(t.id, { w: 0, l: 0, p: 0, pa: 0, rf: 0, ra: 0 }));

    validMatches.filter((m: any) => m.match_type !== 'playoff').forEach((m: any) => {
        const t1 = standingsMap.get(m.team1_id);
        const t2 = standingsMap.get(m.team2_id);
        if (!t1 || !t2) return;

        const maps = mapsByMatch.get(m.id) || [];
        let t1R = 0, t2R = 0;
        maps.forEach((mm: any) => {
            t1R += mm.team1_rounds || 0;
            t2R += mm.team2_rounds || 0;
        });

        let winId = m.winner_id || (t1R > t2R ? m.team1_id : (t2R > t1R ? m.team2_id : null));

        if (winId === m.team1_id) {
            t1.w++; t2.l++; t1.p += 15; t2.pa += 15;
            const lp = Math.min(t2R, 12); t2.p += lp; t1.pa += lp;
        } else if (winId === m.team2_id) {
            t2.w++; t1.l++; t2.p += 15; t1.pa += 15;
            const lp = Math.min(t1R, 12); t1.p += lp; t2.pa += lp;
        }
        t1.rf += t1R; t1.ra += t2R; t2.rf += t2R; t2.ra += t1R;
    });

    const groupMap = new Map<string, any[]>();
    activeTeams.forEach((t: any) => {
        const g = t.group_name || 'U';
        const arr = groupMap.get(g) || [];
        const s = standingsMap.get(t.id)!;
        arr.push({ n: t.name, g: t.tag, w: s.w, l: s.l, p: s.p, pa: s.pa, pd: s.p - s.pa });
        groupMap.set(g, arr);
    });

    const st = Array.from(groupMap.entries()).map(([g, teams]) => ({
        g,
        teams: teams.sort((a, b) => {
            const ap = a?.p ?? 0;
            const bp = b?.p ?? 0;
            const apd = a?.pd ?? 0;
            const bpd = b?.pd ?? 0;
            return bp - ap || bpd - apd;
        }).map((t, i) => ({ r: i + 1, ...t }))
    }));

    // 2. Team Stats (Optimized)
    const teamRounds = new Map<number, { t: number; w: number; pt: number; pw: number }>();
    rounds.forEach((r: any) => {
        const m = validMatches.find(m => m.id === r.match_id);
        if (!m) return;
        [m.team1_id, m.team2_id].forEach(tid => {
            const c = teamRounds.get(tid) || { t: 0, w: 0, pt: 0, pw: 0 };
            c.t++; if (r.winning_team_id === tid) c.w++;
            if (r.round_number === 1 || r.round_number === 13) { c.pt++; if (r.winning_team_id === tid) c.pw++; }
            teamRounds.set(tid, c);
        });
    });

    const ts = activeTeams.map((t: any) => {
        const s = standingsMap.get(t.id)!;
        const rd = teamRounds.get(t.id);
        return {
            n: t.name, t: t.tag, w: s.w, l: s.l, rd: s.rf - s.ra,
            p_wr: rd && rd.pt > 0 ? Math.round((rd.pw / rd.pt) * 100) : 0,
            r_wr: rd && rd.t > 0 ? Math.round((rd.w / rd.t) * 100) : 0,
        };
    });

    // 3. Player Stats (Compact & Filtered)
    const playerAgg = new Map<number, any>();
    const mapInfoLookup = new Map<string, any>();
    matchMaps.forEach(mm => mapInfoLookup.set(`${mm.match_id}-${mm.map_index}`, mm));

    stats.forEach((s: any) => {
        if (!validMatches.find(m => m.id === s.match_id)) return;
        const d = playerAgg.get(s.player_id) || {
            acs: [], k: 0, d: 0, a: 0, adr: [], kast: [], hs: [], fk: 0, fd: 0, c: 0, m: new Set(),
            ag: new Map<string, { g: number; w: number }>()
        };
        d.acs.push(s.acs || 0); d.k += s.kills || 0; d.d += s.deaths || 0; d.a += s.assists || 0;
        d.fk += s.fk || 0; d.fd += s.fd || 0; d.c += s.clutches || 0;
        if (s.adr) d.adr.push(s.adr); if (s.kast) d.kast.push(s.kast); if (s.hs_pct) d.hs.push(s.hs_pct);
        d.m.add(s.match_id);
        if (s.agent) {
            const ag = d.ag.get(s.agent) || { g: 0, w: 0 }; ag.g++;
            if (mapInfoLookup.get(`${s.match_id}-${s.map_index}`)?.winner_id === s.team_id) ag.w++;
            d.ag.set(s.agent, ag);
        }
        playerAgg.set(s.player_id, d);
    });

    const avg = (arr: number[]) => arr.length > 0 ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : 0;
    const ps = Array.from(playerAgg.entries())
        .map(([pid, d]) => {
            const p = playerById.get(pid);
            if (!p || d.m.size === 0) return null;
            return {
                n: p.name, t: teamTag(p.default_team_id || 0), m: d.m.size,
                acs: avg(d.acs), k: d.k, d: d.d, a: d.a,
                kd: d.d > 0 ? Number((d.k / d.d).toFixed(2)) : d.k,
                adr: avg(d.adr), kast: avg(d.kast), hs: avg(d.hs),
                fk: d.fk, fd: d.fd, ei: d.fk - d.fd, c: d.c,
                ag: Array.from(d.ag.entries()).map(([n, a]: any) => ({ n, g: a.g, w: Math.round((a.w / a.g) * 100) })).sort((a, b) => b.g - a.g).slice(0, 3)
            };
        })
        .filter((p): p is any => p !== null)
        .sort((a, b) => b.acs - a.acs)
        .slice(0, 50); // DEEP SNAPSHOT: Top 50 Players

    // 4. Meta & Leaders
    const as = Array.from(stats.reduce((acc, s) => {
        if (!s.agent) return acc;
        const cur = acc.get(s.agent) || { g: 0, acs: 0 };
        cur.g++; cur.acs += s.acs || 0;
        acc.set(s.agent, cur); return acc;
    }, new Map()).entries()).map(([n, d]: any) => ({
        n, pr: Math.round((d.g / (validMatches.length * 10)) * 100), acs: Math.round(d.acs / d.g)
    })).sort((a, b) => b.pr - a.pr).slice(0, 10); // DEEP SNAPSHOT: Top 10 Agents

    const ld = {
        acs: ps.slice(0, 5).map(p => ({ n: p.n, v: p.acs })),
        kd: [...ps].sort((a, b) => b.kd - a.kd).slice(0, 5).map(p => ({ n: p.n, v: p.kd })),
        ei: [...ps].sort((a, b) => b.ei - a.ei).slice(0, 5).map(p => ({ n: p.n, v: p.ei })),
    };

    // 5. Results (Last 30 matches)
    const res = validMatches.sort((a, b) => b.id - a.id).slice(0, 30).map(m => ({
        w: m.week, t1: teamTag(m.team1_id), t2: teamTag(m.team2_id),
        s: `${m.score_t1}-${m.score_t2}`, win: teamTag(m.winner_id || 0)
    }));

    const snapshot = {
        at: new Date().toISOString(),
        ov: { t: activeTeams.length, p: players.length, m: validMatches.length },
        st, ts, ps, ms: [], as, ld, h2h: [], res,
    };

    return {
        ...snapshot,
        size: JSON.stringify(snapshot).length
    } as any;
}
