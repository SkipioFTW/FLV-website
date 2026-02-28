/**
 * League Snapshot Generator
 *
 * Aggregates all league data into a compact, structured JSON object
 * designed for injection into an LLM prompt. Admin-triggered only.
 *
 * Safety:
 *  - Read-only queries (SELECT only)
 *  - No raw schema exposure
 *  - No user-supplied SQL
 */

import { supabase } from '../supabase';

// ─── Types ───────────────────────────────────────────────────────────

export interface LeagueSnapshot {
    generated_at: string;
    overview: {
        total_teams: number;
        total_players: number;
        matches_played: number;
    };
    standings: GroupStandings[];
    team_stats: TeamSnapshot[];
    player_stats: PlayerSnapshot[];
    map_stats: MapSnapshot[];
    agent_stats: AgentSnapshot[];
    leaders: {
        top_acs: LeaderEntry[];
        top_kd: LeaderEntry[];
        top_entry: LeaderEntry[];
        top_clutches: LeaderEntry[];
        top_adr: LeaderEntry[];
    };
    head_to_head: H2HRecord[];
    match_results: MatchResult[];
}

interface GroupStandings {
    group: string;
    teams: {
        rank: number;
        name: string;
        tag: string;
        wins: number;
        losses: number;
        points: number;
        points_against: number;
        point_diff: number;
    }[];
}

interface TeamSnapshot {
    name: string;
    tag: string;
    group: string;
    wins: number;
    losses: number;
    round_diff: number;
    map_record: { map: string; wins: number; losses: number; wr: number }[];
    pistol_wr: number;
    round_wr: number;
    roster: {
        name: string;
        avg_acs: number;
        kd: number;
        avg_adr: number;
        avg_kast: number;
        matches: number;
    }[];
}

interface PlayerSnapshot {
    name: string;
    team: string;
    matches: number;
    avg_acs: number;
    total_kills: number;
    total_deaths: number;
    total_assists: number;
    kd: number;
    avg_adr: number;
    avg_kast: number;
    avg_hs_pct: number;
    total_fk: number;
    total_fd: number;
    entry_impact: number;
    total_clutches: number;
    agents: { name: string; games: number; wr: number }[];
    map_wr: { map: string; wins: number; losses: number; wr: number }[];
}

interface MapSnapshot {
    name: string;
    times_played: number;
    avg_rounds: number;
}

interface AgentSnapshot {
    name: string;
    pick_rate: number;
    win_rate: number;
    avg_acs: number;
    avg_kd: number;
}

interface LeaderEntry {
    name: string;
    team: string;
    value: number;
}

interface H2HRecord {
    team_a: string;
    team_b: string;
    a_wins: number;
    b_wins: number;
}

interface MatchResult {
    week: number;
    team1: string;
    team2: string;
    score: string;
    winner: string;
    match_type: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────

/** Paginated SELECT — Supabase caps at 1000 rows per request */
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
    // 1. Fetch raw data in parallel
    const [teams, players, matches, matchMaps, statsRaw, roundsRaw] = await Promise.all([
        fetchAll('teams', 'id,name,tag,group_name'),
        fetchAll('players', 'id,name,riot_id,default_team_id'),
        fetchAll('matches', 'id,week,team1_id,team2_id,winner_id,status,match_type,format,score_t1,score_t2,is_forfeit'),
        fetchAll('match_maps', 'match_id,map_index,map_name,team1_rounds,team2_rounds,winner_id'),
        fetchAll('match_stats_map', 'player_id,team_id,match_id,map_index,agent,acs,kills,deaths,assists,adr,kast,hs_pct,fk,fd,clutches,is_sub'),
        fetchAll('match_rounds', 'match_id,map_index,round_number,winning_team_id'),
    ]);

    // Exclude placeholder/test teams
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

    // Filter stats to completed matches only
    const stats = statsRaw.filter((s: any) => completedIds.has(s.match_id));
    const rounds = roundsRaw.filter((r: any) => completedIds.has(r.match_id));

    // Helpers
    const mapsByMatch = new Map<number, any[]>();
    matchMaps.filter((m: any) => completedIds.has(m.match_id)).forEach((m: any) => {
        const arr = mapsByMatch.get(m.match_id) || [];
        arr.push(m);
        mapsByMatch.set(m.match_id, arr);
    });

    // ── 2. Standings ────────────────────────────────────────────────────
    const standingsMap = new Map<number, {
        wins: number; losses: number; points: number; pa: number;
        roundsFor: number; roundsAgainst: number;
    }>();

    activeTeams.forEach((t: any) => standingsMap.set(t.id, {
        wins: 0, losses: 0, points: 0, pa: 0, roundsFor: 0, roundsAgainst: 0,
    }));

    // Only regular season for standings
    const regularMatches = validMatches.filter((m: any) => m.match_type !== 'playoff');

    regularMatches.forEach((m: any) => {
        const t1 = standingsMap.get(m.team1_id);
        const t2 = standingsMap.get(m.team2_id);
        if (!t1 || !t2) return;

        const maps = mapsByMatch.get(m.id) || [];
        let t1Rounds = 0, t2Rounds = 0;
        maps.forEach((mm: any) => {
            t1Rounds += mm.team1_rounds || 0;
            t2Rounds += mm.team2_rounds || 0;
        });

        let winnerId = m.winner_id;
        if (!winnerId && t1Rounds !== t2Rounds) {
            winnerId = t1Rounds > t2Rounds ? m.team1_id : m.team2_id;
        }

        if (winnerId === m.team1_id) {
            t1.wins++; t2.losses++;
            t1.points += 15;
            t2.pa += 15;
            const loserPts = Math.min(t2Rounds, 12);
            t2.points += loserPts;
            t1.pa += loserPts;
        } else if (winnerId === m.team2_id) {
            t2.wins++; t1.losses++;
            t2.points += 15;
            t1.pa += 15;
            const loserPts = Math.min(t1Rounds, 12);
            t1.points += loserPts;
            t2.pa += loserPts;
        }

        t1.roundsFor += t1Rounds;
        t1.roundsAgainst += t2Rounds;
        t2.roundsFor += t2Rounds;
        t2.roundsAgainst += t1Rounds;
    });

    // Group standings
    const groupMap = new Map<string, any[]>();
    activeTeams.forEach((t: any) => {
        const g = t.group_name || 'Ungrouped';
        const arr = groupMap.get(g) || [];
        const s = standingsMap.get(t.id)!;
        arr.push({
            name: t.name, tag: t.tag,
            wins: s.wins, losses: s.losses,
            points: s.points, pa: s.pa,
            pd: s.points - s.pa,
        });
        groupMap.set(g, arr);
    });

    const standings: GroupStandings[] = Array.from(groupMap.entries()).map(([group, teams]) => {
        teams.sort((a: any, b: any) => b.points - a.points || b.pd - a.pd);
        return {
            group,
            teams: teams.map((t: any, i: number) => ({
                rank: i + 1,
                name: t.name, tag: t.tag,
                wins: t.wins, losses: t.losses,
                points: t.points, points_against: t.pa, point_diff: t.pd,
            })),
        };
    });

    // ── 3. Team Stats ───────────────────────────────────────────────────
    const teamRounds = new Map<number, { total: number; won: number; pistolTotal: number; pistolWon: number }>();
    rounds.forEach((r: any) => {
        // Find the match to figure out teams
        const match = validMatches.find((m: any) => m.id === r.match_id);
        if (!match) return;
        [match.team1_id, match.team2_id].forEach((tid: number) => {
            const c = teamRounds.get(tid) || { total: 0, won: 0, pistolTotal: 0, pistolWon: 0 };
            c.total++;
            if (r.winning_team_id === tid) c.won++;
            if (r.round_number === 1 || r.round_number === 13) {
                c.pistolTotal++;
                if (r.winning_team_id === tid) c.pistolWon++;
            }
            teamRounds.set(tid, c);
        });
    });

    const teamMapWr = new Map<number, Map<string, { wins: number; losses: number }>>();
    matchMaps.filter((mm: any) => completedIds.has(mm.match_id)).forEach((mm: any) => {
        const match = validMatches.find((m: any) => m.id === mm.match_id);
        if (!match) return;
        [match.team1_id, match.team2_id].forEach((tid: number) => {
            const isT1 = tid === match.team1_id;
            const myRounds = isT1 ? (mm.team1_rounds || 0) : (mm.team2_rounds || 0);
            const opRounds = isT1 ? (mm.team2_rounds || 0) : (mm.team1_rounds || 0);
            if (myRounds === opRounds) return; // tie – skip

            const maps = teamMapWr.get(tid) || new Map();
            const cur = maps.get(mm.map_name) || { wins: 0, losses: 0 };
            if (myRounds > opRounds) cur.wins++; else cur.losses++;
            maps.set(mm.map_name, cur);
            teamMapWr.set(tid, maps);
        });
    });

    // Team roster stats from match_stats_map
    const teamPlayerStats = new Map<number, Map<number, { acs: number[]; kills: number; deaths: number; adr: number[]; kast: number[]; matchIds: Set<number> }>>();
    stats.forEach((s: any) => {
        const match = validMatches.find((m: any) => m.id === s.match_id);
        if (!match) return;

        const tid = s.team_id || 0;
        if (!tid) return;
        const tps = teamPlayerStats.get(tid) || new Map();
        const cur = tps.get(s.player_id) || { acs: [], kills: 0, deaths: 0, adr: [], kast: [], matchIds: new Set() };
        cur.acs.push(s.acs || 0);
        cur.kills += s.kills || 0;
        cur.deaths += s.deaths || 0;
        if (s.adr != null) cur.adr.push(s.adr);
        if (s.kast != null) cur.kast.push(s.kast);
        cur.matchIds.add(s.match_id);
        tps.set(s.player_id, cur);
        teamPlayerStats.set(tid, tps);
    });

    const team_stats: TeamSnapshot[] = activeTeams.map((t: any) => {
        const s = standingsMap.get(t.id)!;
        const rd = teamRounds.get(t.id);
        const maps = teamMapWr.get(t.id);

        const mapRecord = maps
            ? Array.from(maps.entries()).map(([map, wl]) => ({
                map,
                wins: wl.wins,
                losses: wl.losses,
                wr: wl.wins + wl.losses > 0 ? Math.round((wl.wins / (wl.wins + wl.losses)) * 100) : 0,
            })).sort((a, b) => b.wr - a.wr)
            : [];

        // Roster: only players whose default_team_id matches
        const tps = teamPlayerStats.get(t.id);
        const rosterPlayerIds = players.filter((p: any) => p.default_team_id === t.id).map((p: any) => p.id);
        const roster = rosterPlayerIds.map((pid: number) => {
            const ps = tps?.get(pid);
            const p = playerById.get(pid);
            if (!ps || !p) return null;
            const avg = (arr: number[]) => arr.length > 0 ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : 0;
            return {
                name: p.name,
                avg_acs: avg(ps.acs),
                kd: ps.deaths > 0 ? Number((ps.kills / ps.deaths).toFixed(2)) : ps.kills,
                avg_adr: avg(ps.adr),
                avg_kast: avg(ps.kast),
                matches: ps.matchIds.size,
            };
        }).filter(Boolean).sort((a: any, b: any) => b.avg_acs - a.avg_acs);

        return {
            name: t.name,
            tag: t.tag,
            group: t.group_name || 'N/A',
            wins: s.wins,
            losses: s.losses,
            round_diff: s.roundsFor - s.roundsAgainst,
            map_record: mapRecord,
            pistol_wr: rd && rd.pistolTotal > 0 ? Math.round((rd.pistolWon / rd.pistolTotal) * 100) : 0,
            round_wr: rd && rd.total > 0 ? Math.round((rd.won / rd.total) * 100) : 0,
            roster: roster as any[],
        };
    });

    // ── 4. Player Stats ─────────────────────────────────────────────────
    const playerAgg = new Map<number, {
        acs: number[]; kills: number; deaths: number; assists: number;
        adr: number[]; kast: number[]; hs_pct: number[]; fk: number; fd: number;
        clutches: number; matchIds: Set<number>;
        agentMaps: Map<string, { games: number; wins: number }>;
        mapMaps: Map<string, { wins: number; losses: number }>;
    }>();

    // Build a quick lookup for map metadata
    const mapInfoLookup = new Map<string, any>();
    matchMaps.forEach((mm: any) => mapInfoLookup.set(`${mm.match_id}-${mm.map_index}`, mm));

    stats.forEach((s: any) => {
        const match = validMatches.find((m: any) => m.id === s.match_id);
        if (!match) return;

        const cur = playerAgg.get(s.player_id) || {
            acs: [] as number[], kills: 0, deaths: 0, assists: 0,
            adr: [] as number[], kast: [] as number[], hs_pct: [] as number[], fk: 0, fd: 0,
            clutches: 0, matchIds: new Set<number>(),
            agentMaps: new Map<string, { games: number; wins: number }>(), mapMaps: new Map<string, { wins: number; losses: number }>(),
        };

        cur.acs.push(s.acs || 0);
        cur.kills += s.kills || 0;
        cur.deaths += s.deaths || 0;
        cur.assists += s.assists || 0;
        cur.fk += s.fk || 0;
        cur.fd += s.fd || 0;
        cur.clutches += s.clutches || 0;
        if (s.adr != null) cur.adr.push(s.adr);
        if (s.kast != null) cur.kast.push(s.kast);
        if (s.hs_pct != null) cur.hs_pct.push(s.hs_pct);
        cur.matchIds.add(s.match_id);

        // Agent stats
        if (s.agent) {
            const ag = cur.agentMaps.get(s.agent) || { games: 0, wins: 0 };
            ag.games++;
            const mapInfo = mapInfoLookup.get(`${s.match_id}-${s.map_index}`);
            if (mapInfo && mapInfo.winner_id === s.team_id) ag.wins++;
            cur.agentMaps.set(s.agent, ag);
        }

        // Map WR
        const mapInfo = mapInfoLookup.get(`${s.match_id}-${s.map_index || 0}`);
        if (mapInfo?.map_name) {
            const mwr = cur.mapMaps.get(mapInfo.map_name) || { wins: 0, losses: 0 };
            if (mapInfo.winner_id === s.team_id) mwr.wins++; else mwr.losses++;
            cur.mapMaps.set(mapInfo.map_name, mwr);
        }

        playerAgg.set(s.player_id, cur);
    });

    const avg = (arr: number[]) => arr.length > 0 ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : 0;

    const player_stats: PlayerSnapshot[] = Array.from(playerAgg.entries())
        .map(([pid, d]) => {
            const p = playerById.get(pid);
            if (!p) return null;
            return {
                name: p.name,
                team: teamTag(p.default_team_id || 0),
                matches: d.matchIds.size,
                avg_acs: avg(d.acs),
                total_kills: d.kills,
                total_deaths: d.deaths,
                total_assists: d.assists,
                kd: d.deaths > 0 ? Number((d.kills / d.deaths).toFixed(2)) : d.kills,
                avg_adr: avg(d.adr),
                avg_kast: avg(d.kast),
                avg_hs_pct: avg(d.hs_pct),
                total_fk: d.fk,
                total_fd: d.fd,
                entry_impact: d.fk - d.fd,
                total_clutches: d.clutches,
                agents: Array.from(d.agentMaps.entries()).map(([name, ag]) => ({
                    name,
                    games: ag.games,
                    wr: ag.games > 0 ? Math.round((ag.wins / ag.games) * 100) : 0,
                })).sort((a, b) => b.games - a.games),
                map_wr: Array.from(d.mapMaps.entries()).map(([map, wl]) => ({
                    map,
                    wins: wl.wins,
                    losses: wl.losses,
                    wr: wl.wins + wl.losses > 0 ? Math.round((wl.wins / (wl.wins + wl.losses)) * 100) : 0,
                })).sort((a, b) => b.wr - a.wr),
            };
        })
        .filter(Boolean) as PlayerSnapshot[];

    // Sort by avg_acs DESC
    player_stats.sort((a, b) => b.avg_acs - a.avg_acs);

    // ── 5. Map & Agent Stats ────────────────────────────────────────────
    const mapAgg = new Map<string, { count: number; totalRounds: number }>();
    matchMaps.filter((mm: any) => completedIds.has(mm.match_id)).forEach((mm: any) => {
        const cur = mapAgg.get(mm.map_name) || { count: 0, totalRounds: 0 };
        cur.count++;
        cur.totalRounds += (mm.team1_rounds || 0) + (mm.team2_rounds || 0);
        mapAgg.set(mm.map_name, cur);
    });

    const map_stats: MapSnapshot[] = Array.from(mapAgg.entries())
        .map(([name, d]) => ({
            name,
            times_played: d.count,
            avg_rounds: d.count > 0 ? Number((d.totalRounds / d.count).toFixed(1)) : 0,
        }))
        .sort((a, b) => b.times_played - a.times_played);

    const agentAgg = new Map<string, { picks: number; wins: number; totalAcs: number; totalKills: number; totalDeaths: number }>();
    stats.forEach((s: any) => {
        if (!s.agent) return;
        const cur = agentAgg.get(s.agent) || { picks: 0, wins: 0, totalAcs: 0, totalKills: 0, totalDeaths: 0 };
        cur.picks++;
        cur.totalAcs += s.acs || 0;
        cur.totalKills += s.kills || 0;
        cur.totalDeaths += s.deaths || 0;
        const mapInfo = mapInfoLookup.get(`${s.match_id}-${s.map_index}`);
        if (mapInfo && mapInfo.winner_id === s.team_id) cur.wins++;
        agentAgg.set(s.agent, cur);
    });

    const totalMapPlays = matchMaps.filter((mm: any) => completedIds.has(mm.match_id)).length || 1;
    const agent_stats: AgentSnapshot[] = Array.from(agentAgg.entries())
        .map(([name, d]) => ({
            name,
            pick_rate: Math.round((d.picks / (totalMapPlays * 10)) * 100), // 10 players per map
            win_rate: d.picks > 0 ? Math.round((d.wins / d.picks) * 100) : 0,
            avg_acs: d.picks > 0 ? Math.round(d.totalAcs / d.picks) : 0,
            avg_kd: d.totalDeaths > 0 ? Number((d.totalKills / d.totalDeaths).toFixed(2)) : d.totalKills,
        }))
        .sort((a, b) => b.pick_rate - a.pick_rate);

    // ── 6. Leaders ──────────────────────────────────────────────────────
    const qualified = player_stats.filter(p => p.matches >= 2); // min 2 matches
    const topN = 5;

    const toLeader = (p: PlayerSnapshot, val: number): LeaderEntry => ({ name: p.name, team: p.team, value: val });

    const leaders = {
        top_acs: [...qualified].sort((a, b) => b.avg_acs - a.avg_acs).slice(0, topN).map(p => toLeader(p, p.avg_acs)),
        top_kd: [...qualified].sort((a, b) => b.kd - a.kd).slice(0, topN).map(p => toLeader(p, p.kd)),
        top_entry: [...qualified].sort((a, b) => b.entry_impact - a.entry_impact).slice(0, topN).map(p => toLeader(p, p.entry_impact)),
        top_clutches: [...qualified].sort((a, b) => b.total_clutches - a.total_clutches).slice(0, topN).map(p => toLeader(p, p.total_clutches)),
        top_adr: [...qualified].sort((a, b) => b.avg_adr - a.avg_adr).slice(0, topN).map(p => toLeader(p, p.avg_adr)),
    };

    // ── 7. Head-to-Head Records ─────────────────────────────────────────
    const h2hMap = new Map<string, { a: string; b: string; aWins: number; bWins: number }>();
    validMatches.forEach((m: any) => {
        if (!m.winner_id) return;
        const ids = [m.team1_id, m.team2_id].sort((a, b) => a - b);
        const key = `${ids[0]}-${ids[1]}`;
        const nameA = teamName(ids[0]);
        const nameB = teamName(ids[1]);
        const cur = h2hMap.get(key) || { a: nameA, b: nameB, aWins: 0, bWins: 0 };
        if (m.winner_id === ids[0]) cur.aWins++; else cur.bWins++;
        h2hMap.set(key, cur);
    });

    const head_to_head: H2HRecord[] = Array.from(h2hMap.values()).map(h => ({
        team_a: h.a,
        team_b: h.b,
        a_wins: h.aWins,
        b_wins: h.bWins,
    }));

    // ── 8. Match Results Summary ────────────────────────────────────────
    const match_results: MatchResult[] = validMatches
        .sort((a: any, b: any) => (b.week || 0) - (a.week || 0))
        .map((m: any) => ({
            week: m.week || 0,
            team1: teamName(m.team1_id),
            team2: teamName(m.team2_id),
            score: `${m.score_t1 ?? 0}-${m.score_t2 ?? 0}`,
            winner: m.winner_id ? teamName(m.winner_id) : 'N/A',
            match_type: m.match_type || 'regular',
        }));

    return {
        generated_at: new Date().toISOString(),
        overview: {
            total_teams: activeTeams.length,
            total_players: players.length,
            matches_played: validMatches.length,
        },
        standings,
        team_stats,
        player_stats,
        map_stats,
        agent_stats,
        leaders,
        head_to_head,
        match_results,
    };
}
