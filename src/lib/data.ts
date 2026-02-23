import { supabase, type Team, type Match, type MatchMap } from './supabase';

export type StandingsRow = {
    id: number;
    name: string;
    tag: string;
    group_name: string;
    logo_display: string | null;
    Wins: number;
    Losses: number;
    Played: number;
    Points: number;
    'Points Against': number;
    PD: number;
};

export type GlobalStats = {
    activeTeams: number;
    matchesPlayed: number;
    livePlayers: number;
    totalPoints: number;
};

export type LeaderboardPlayer = {
    id: number;
    name: string;
    riot_id: string;
    team: string;
    matches_played: number;
    avg_acs: number;
    total_kills: number;
    total_deaths: number;
    total_assists: number;
    kd_ratio: number;
    avg_adr: number;
    avg_kast: number;
    avg_hs_pct: number;
    total_fk: number;
};

export type PlayerStats = {
    id: number;
    name: string;
    riot_id: string;
    team: string;
    performance: {
        week: number;
        acs: number;
        kd: number;
    }[];
    agents: {
        name: string;
        count: number;
    }[];
    agentWinRates?: {
        name: string;
        wins: number;
        losses: number;
        wr: number;
    }[];
    mapWinRates?: {
        name: string;
        wins: number;
        losses: number;
        wr: number;
    }[];
    summary: {
        avgAcs: number;
        kd: number;
        kpr: number;
        avgAdr?: number;
        avgKast?: number;
        winRate: number;
        matches: number;
    };
    recentMatches: {
        matchId: number;
        week: number;
        opponent: string;
        map: string;
        acs: number;
        kills: number;
        deaths: number;
        assists: number;
        adr?: number;
        kast?: number;
        hs_pct?: number;
        result: 'win' | 'loss' | 'draw';
        is_sub?: boolean;
        subbed_for_id?: number | null;
        subbed_for_name?: string | null;
    }[];
};

export type PendingMatch = {
    id: number;
    team_a: string;
    team_b: string;
    group_name: string;
    url: string;
    submitted_by: string;
    timestamp: string;
    status: string;
};

export type PendingPlayer = {
    id: number;
    riot_id: string;
    rank: string;
    tracker_link: string;
    submitted_by: string;
    timestamp: string;
    status: string;
    discord_handle: string;
};

/**
 * Parse Tracker JSON into suggestions compatible with admin editor workflow
 * Now extracts detailed stats like ADR, KAST, HS%, and round-by-round data.
 */
export function parseTrackerJson(
    js: any,
    team1_id: number,
    team2_id: number,
    roster1Rids?: string[],
    roster2Rids?: string[],
    mapIndex: number = 0
): {
    suggestions: Record<string, {
        team_num: 1 | 2;
        name?: string;
        agent?: string;
        acs: number; k: number; d: number; a: number;
        adr?: number;
        kast?: number;
        hs_pct?: number;
        fk?: number;
        fd?: number;
        mk?: number;
        dd_delta?: number;
        conf?: string
    }>;
    map_name: string;
    t1_rounds: number;
    t2_rounds: number;
    rounds: any[];
    playerRounds: any[];
} {
    try {
        const suggestions: Record<string, any> = {};
        const rounds: any[] = [];
        const playerRoundsArr: any[] = [];
        const lower = (x: any) => String(x || "").trim().toLowerCase();
        const data = js?.data || {};
        const segments: any[] = Array.isArray(data?.segments) ? data.segments : [];

        // 1. Determine Tracker's Team 1 ID
        let trackerTeam1Id: string | number | null = null;
        const teamSegs = segments.filter(s => s?.type === "team-summary");
        if (teamSegs.length >= 2 && roster1Rids && roster1Rids.length > 0) {
            const candidate = teamSegs[0]?.attributes?.teamId;
            let matchCount = 0;
            segments.filter(s => s?.type === "player-summary" && s?.metadata?.teamId === candidate).forEach(p => {
                const rid = lower(p?.metadata?.platformInfo?.platformUserIdentifier);
                if (rid && roster1Rids.includes(rid)) matchCount += 1;
            });
            trackerTeam1Id = matchCount >= 1 ? candidate : teamSegs[1]?.attributes?.teamId;
        } else {
            trackerTeam1Id = teamSegs[0]?.attributes?.teamId ?? null;
        }

        // 2. Extract Aggregate Player Stats
        segments.filter(s => s?.type === "player-summary").forEach(p => {
            const ridRaw = p?.metadata?.platformInfo?.platformUserIdentifier;
            const rid = lower(ridRaw);
            if (!rid) return;
            const agent = p?.metadata?.agentName;
            const st = p?.stats || {};

            const acs = Number(st?.scorePerRound?.value ?? 0);
            const k = Number(st?.kills?.value ?? 0);
            const d = Number(st?.deaths?.value ?? 0);
            const a = Number(st?.assists?.value ?? 0);

            // Detailed Stats
            const adr = Number(st?.damagePerRound?.value ?? 0);
            const kast = Number(st?.kast?.value ?? 0);
            const hs_pct = Number(st?.hsAccuracy?.value ?? 0);
            const fk = Number(st?.firstKills?.value ?? 0);
            const fd = Number(st?.firstDeaths?.value ?? 0);
            const mk = Number(st?.tripleKills?.value ?? 0) + Number(st?.quadraKills?.value ?? 0) + Number(st?.pentaKills?.value ?? 0);
            const dd_delta = Number(st?.damageDeltaPerRound?.value ?? 0);

            const tId = p?.metadata?.teamId;
            const team_num = tId === trackerTeam1Id ? 1 : 2;

            suggestions[rid] = {
                team_num, agent, acs, k, d, a,
                adr, kast, hs_pct, fk, fd, mk, dd_delta
            };
        });

        // 3. Extract Round Summary & Economy
        const roundSummaries = segments.filter(s => s?.type === "round-summary");
        const playerRounds = segments.filter(s => s?.type === "player-round");

        roundSummaries.forEach(rs => {
            const rNum = Number(rs?.attributes?.round ?? 0);
            const winTeamRaw = rs?.stats?.winningTeam?.value;
            const winning_team_id = winTeamRaw === trackerTeam1Id ? team1_id : team2_id;

            // Calculate economy for this round
            let econT1 = 0;
            let econT2 = 0;
            playerRounds.filter(pr => Number(pr?.attributes?.round) === rNum).forEach(pr => {
                const teamId = pr?.metadata?.teamId;
                const value = Number(pr?.stats?.spentCredits?.value ?? 0);
                if (teamId === trackerTeam1Id) econT1 += value;
                else econT2 += value;
            });

            rounds.push({
                round_number: rNum,
                winning_team_id,
                win_type: rs?.stats?.roundResult?.value || "Elimination",
                plant: rs?.metadata?.plant !== null,
                defuse: rs?.metadata?.defuse !== null,
                economy_t1: econT1,
                economy_t2: econT2
            });
        });

        // 4. Extract Per-Round Player Data
        playerRounds.forEach(pr => {
            const rid = lower(pr?.attributes?.platformUserIdentifier);
            if (!rid) return;
            const rNum = Number(pr?.attributes?.round ?? 0);
            const kills = Number(pr?.stats?.kills?.value ?? 0);
            const damage = Number(pr?.stats?.damage?.value ?? 0);
            const spent = Number(pr?.stats?.spentCredits?.value ?? 0);

            // Find weapon for this round if possible (usually in player-round-weapon or similar)
            // For now, we'll leave weapon as null or attempt to find first kill weapon
            playerRoundsArr.push({
                rid,
                round_number: rNum,
                kills,
                damage,
                spent,
                weapon: null
            });
        });

        let map_name = lower(data?.metadata?.mapName || data?.metadata?.map || "");
        if (!map_name) {
            map_name = lower(teamSegs[0]?.metadata?.mapName || "");
        }
        if (!map_name) map_name = "unknown";
        map_name = map_name.charAt(0).toUpperCase() + map_name.slice(1);

        // Extract rounds per team if available
        let t1_rounds = 0;
        let t2_rounds = 0;
        const r1 = teamSegs.find(s => s?.attributes?.teamId === trackerTeam1Id);
        const r2 = teamSegs.find(s => s?.attributes?.teamId !== trackerTeam1Id);
        t1_rounds = Number(r1?.stats?.roundsWon?.value ?? 0);
        t2_rounds = Number(r2?.stats?.roundsWon?.value ?? 0);

        return { suggestions, map_name, t1_rounds, t2_rounds, rounds, playerRounds: playerRoundsArr };
    } catch {
        return { suggestions: {}, map_name: "Unknown", t1_rounds: 0, t2_rounds: 0, rounds: [], playerRounds: [] };
    }
}

export type MatchEntry = {
    id: number;
    week: number;
    group_name: string;
    team1: {
        id: number;
        name: string;
        tag: string;
        logo: string | null;
        score: number;
    };
    team2: {
        id: number;
        name: string;
        tag: string;
        logo: string | null;
        score: number;
    };
    winner_id: number | null;
    status: 'scheduled' | 'completed' | 'live';
    format: 'BO1' | 'BO3' | 'BO5';
    maps_played: number;
    timestamp?: string;
    match_type?: 'regular' | 'playoff';
    playoff_round?: number;
    bracket_pos?: number;
    bracket_label?: string | null;
};

export type TeamPerformance = {
    id: number;
    name: string;
    tag: string;
    group: string;
    progression: {
        week: number;
        points: number;
        rd: number;
    }[];
    playerStats: {
        name: string;
        avgAcs: number;
        kd: number;
        avgAdr?: number;
        avgKast?: number;
        matches: number;
    }[];
    maps: {
        name: string;
        wins: number;
        losses: number;
    }[];
};

/**
 * Fetch and calculate standings with the same logic as production
 * Points system: Winner gets 15, Loser gets min(rounds_scored, 12)
 * Returns grouped standings by group_name
 */
export async function getStandings(): Promise<Map<string, StandingsRow[]>> {
    try {
        // Fetch teams
        const { data: teams, error: teamsError } = await supabase
            .from('teams')
            .select('id, name, tag, group_name, logo_path');

        if (teamsError) throw teamsError;
        if (!teams || teams.length === 0) return new Map();

        // Exclude FAT1 and FAT2
        const filteredTeams = teams.filter(
            (t) => !['FAT1', 'FAT2'].includes(t.name)
        );
        const excludeIds = teams
            .filter((t) => ['FAT1', 'FAT2'].includes(t.name))
            .map((t) => t.id);

        // Fetch completed regular matches
        const { data: matches, error: matchesError } = await supabase
            .from('matches')
            .select('id, team1_id, team2_id, winner_id, status, match_type, format, maps_played, is_forfeit, score_t1, score_t2')
            .eq('status', 'completed')
            .neq('match_type', 'playoff');

        if (matchesError) throw matchesError;

        // Filter out matches involving excluded teams
        const validMatches = (matches || []).filter(
            (m) => !excludeIds.includes(m.team1_id) && !excludeIds.includes(m.team2_id)
        );

        // Fetch match maps for round calculations
        const matchIds = validMatches.map((m) => m.id);
        const { data: matchMaps, error: mapsError } = await supabase
            .from('match_maps')
            .select('match_id, map_index, team1_rounds, team2_rounds, winner_id')
            .in('match_id', matchIds);

        if (mapsError) throw mapsError;

        // Build a map of match_id -> aggregated rounds
        const roundsMap = new Map<number, { t1: number; t2: number }>();
        (matchMaps || []).forEach((map) => {
            const existing = roundsMap.get(map.match_id) || { t1: 0, t2: 0 };
            existing.t1 += map.team1_rounds || 0;
            existing.t2 += map.team2_rounds || 0;
            roundsMap.set(map.match_id, existing);
        });

        // Initialize standings
        const standings = new Map<number, StandingsRow>();
        filteredTeams.forEach((team) => {
            const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
            const safeName = team.name.replace(/[^A-Za-z0-9]+/g, '_').replace(/_+/g, '_').trim().replace(/^_|_$/g, '');

            standings.set(team.id, {
                id: team.id,
                name: team.name,
                tag: team.tag || '',
                group_name: team.group_name || '',
                logo_display: baseUrl ? `${baseUrl}/storage/v1/object/public/teams/${safeName}.png` : null,
                Wins: 0,
                Losses: 0,
                Played: 0,
                Points: 0,
                'Points Against': 0,
                PD: 0,
            });
        });

        // Calculate stats from matches
        validMatches.forEach((match) => {
            const team1 = standings.get(match.team1_id);
            const team2 = standings.get(match.team2_id);
            if (!team1 || !team2) return;

            const rounds = roundsMap.get(match.id) || { t1: 0, t2: 0 };
            const t1Rounds = rounds.t1;
            const t2Rounds = rounds.t2;

            // Determine winner
            let winnerId = match.winner_id;
            if (!winnerId && t1Rounds !== t2Rounds) {
                winnerId = t1Rounds > t2Rounds ? match.team1_id : match.team2_id;
            }

            // Points system: Winner = 15, Loser = min(rounds, 12)
            let t1Points = 0;
            let t2Points = 0;

            if (winnerId === match.team1_id) {
                t1Points = 15;
                t2Points = Math.min(t2Rounds, 12);
                team1.Wins += 1;
                team2.Losses += 1;
            } else if (winnerId === match.team2_id) {
                t2Points = 15;
                t1Points = Math.min(t1Rounds, 12);
                team2.Wins += 1;
                team1.Losses += 1;
            } else {
                // Draw (rare)
                t1Points = Math.min(t1Rounds, 12);
                t2Points = Math.min(t2Rounds, 12);
            }

            team1.Points += t1Points;
            team1['Points Against'] += t2Points;
            team1.Played += 1;

            team2.Points += t2Points;
            team2['Points Against'] += t1Points;
            team2.Played += 1;
        });

        // Calculate PD (Point Differential)
        standings.forEach((team) => {
            team.PD = team.Points - team['Points Against'];
        });

        // Group by group_name and sort within each group
        const groupedStandings = new Map<string, StandingsRow[]>();

        standings.forEach((team) => {
            const groupName = team.group_name || 'Ungrouped';
            if (!groupedStandings.has(groupName)) {
                groupedStandings.set(groupName, []);
            }
            groupedStandings.get(groupName)!.push(team);
        });

        // Sort teams within each group by Points DESC, then PD DESC
        groupedStandings.forEach((teams) => {
            teams.sort((a, b) => {
                if (b.Points !== a.Points) return b.Points - a.Points;
                return b.PD - a.PD;
            });
        });

        return groupedStandings;
    } catch (error) {
        console.error('Error fetching standings:', error);
        return new Map();
    }
}

/**
 * Fetch player leaderboard stats
 * Replicates production SQL logic: includes unique matches where status is 'completed'
 */
export async function getLeaderboard(minGames: number = 0): Promise<LeaderboardPlayer[]> {
    try {
        // 1. Fetch all players and teams for lookup
        const [playersRes, teamsRes] = await Promise.all([
            supabase.from('players').select('id, name, riot_id, default_team_id'),
            supabase.from('teams').select('id, tag')
        ]);

        if (playersRes.error) throw playersRes.error;
        if (teamsRes.error) throw teamsRes.error;

        const players = playersRes.data || [];
        const teams = teamsRes.data || [];

        const teamMap = new Map<number, string>();
        teams.forEach(t => teamMap.set(t.id, t.tag));

        // 2. Fetch all completed match IDs with pagination
        const completedMatchIds = new Set<number>();
        let mFrom = 0;
        const mLimit = 1000;
        while (true) {
            const { data, error } = await supabase
                .from('matches')
                .select('id')
                .eq('status', 'completed')
                .range(mFrom, mFrom + mLimit - 1);

            if (error) throw error;
            if (!data || data.length === 0) break;
            data.forEach(m => completedMatchIds.add(m.id));
            if (data.length < mLimit) break;
            mFrom += mLimit;
        }

        // 3. Fetch all match stats with pagination
        let allStats: any[] = [];
        let sFrom = 0;
        const sLimit = 1000;
        while (true) {
            const { data, error } = await supabase
                .from('match_stats_map')
                .select('player_id, acs, kills, deaths, assists, match_id, adr, kast, hs_pct, fk')
                .range(sFrom, sFrom + sLimit - 1);

            if (error) throw error;
            if (!data || data.length === 0) break;

            allStats = allStats.concat(data);
            if (data.length < sLimit) break;
            sFrom += sLimit;
        }

        // 4. Aggregate stats per player
        const playerStatsMap = new Map<number, {
            totalAcs: number;
            totalKills: number;
            totalDeaths: number;
            totalAssists: number;
            totalAdr: number;
            totalKast: number;
            totalHsPct: number;
            totalFk: number;
            matchIds: Set<number>;
            mapCount: number;
            enhancedMapCount: number; // for adr/kast/hs which might be null for some old matches
        }>();

        allStats.forEach((stat) => {
            // Replicate JOIN matches m ON msm.match_id = m.id WHERE m.status = 'completed'
            if (!completedMatchIds.has(stat.match_id)) return;

            const existing = playerStatsMap.get(stat.player_id) || {
                totalAcs: 0,
                totalKills: 0,
                totalDeaths: 0,
                totalAssists: 0,
                totalAdr: 0,
                totalKast: 0,
                totalHsPct: 0,
                totalFk: 0,
                matchIds: new Set<number>(),
                mapCount: 0,
                enhancedMapCount: 0,
            };

            existing.totalAcs += stat.acs || 0;
            existing.totalKills += stat.kills || 0;
            existing.totalDeaths += stat.deaths || 0;
            existing.totalAssists += stat.assists || 0;
            existing.totalFk += stat.fk || 0;
            existing.matchIds.add(stat.match_id);
            existing.mapCount += 1;

            if (stat.adr !== null && stat.adr !== undefined) {
                existing.totalAdr += stat.adr;
                existing.totalKast += stat.kast || 0;
                existing.totalHsPct += stat.hs_pct || 0;
                existing.enhancedMapCount += 1;
            }

            playerStatsMap.set(stat.player_id, existing);
        });

        // 5. Build leaderboard
        const leaderboard: LeaderboardPlayer[] = players
            .map((player) => {
                const pStats = playerStatsMap.get(player.id);
                const matchCount = pStats?.matchIds.size || 0;

                if (!pStats || matchCount < minGames) return null;

                const teamTag = player.default_team_id ? teamMap.get(player.default_team_id) || 'N/A' : 'N/A';

                return {
                    id: player.id,
                    name: player.name,
                    riot_id: player.riot_id,
                    team: teamTag,
                    matches_played: matchCount,
                    avg_acs: Math.round(pStats.totalAcs / pStats.mapCount),
                    total_kills: pStats.totalKills,
                    total_deaths: pStats.totalDeaths,
                    total_assists: pStats.totalAssists,
                    kd_ratio: pStats.totalDeaths > 0 ? parseFloat((pStats.totalKills / pStats.totalDeaths).toFixed(2)) : pStats.totalKills,
                    avg_adr: pStats.enhancedMapCount > 0 ? Math.round(pStats.totalAdr / pStats.enhancedMapCount) : 0,
                    avg_kast: pStats.enhancedMapCount > 0 ? Math.round(pStats.totalKast / pStats.enhancedMapCount) : 0,
                    avg_hs_pct: pStats.enhancedMapCount > 0 ? Math.round(pStats.totalHsPct / pStats.enhancedMapCount) : 0,
                    total_fk: pStats.totalFk,
                };
            })
            .filter((p): p is LeaderboardPlayer => p !== null)
            .sort((a, b) => b.avg_acs - a.avg_acs);

        return leaderboard;
    } catch (error) {
        console.error('Error fetching leaderboard:', error);
        return [];
    }
}
/**
 * Fetch detailed stats for a specific player
 */
export async function getPlayerStats(playerId: number): Promise<PlayerStats | null> {
    try {
        // 1. Fetch player info
        const { data: player, error: playerError } = await supabase
            .from('players')
            .select('id, name, riot_id, default_team_id')
            .eq('id', playerId)
            .single();

        if (playerError || !player) throw playerError || new Error('Player not found');

        // 2. Fetch team info
        let teamTag = 'N/A';
        if (player.default_team_id) {
            const { data: team } = await supabase
                .from('teams')
                .select('tag')
                .eq('id', player.default_team_id)
                .single();
            if (team) teamTag = team.tag;
        }

        // 3. Fetch all match stats for this player
        const { data: stats, error: statsError } = await supabase
            .from('match_stats_map')
            .select('*')
            .eq('player_id', playerId);

        if (statsError) throw statsError;

        const matchIds = [...new Set((stats || []).map(s => s.match_id))];
        if (matchIds.length === 0) {
            return {
                id: player.id,
                name: player.name,
                riot_id: player.riot_id,
                team: teamTag,
                performance: [],
                agents: [],
                summary: {
                    avgAcs: 0,
                    kd: 0,
                    kpr: 0,
                    avgAdr: 0,
                    avgKast: 0,
                    winRate: 0,
                    matches: 0
                },
                recentMatches: []
            };
        }

        // 4. Fetch matches and maps metadata
        const [matchesRes, mapsRes] = await Promise.all([
            supabase.from('matches').select('*').in('id', matchIds),
            supabase.from('match_maps').select('*').in('match_id', matchIds)
        ]);

        if (matchesRes.error) throw matchesRes.error;
        if (mapsRes.error) throw mapsRes.error;

        const matchMap = new Map(matchesRes.data.map(m => [m.id, m]));
        const mapMetadataMap = new Map(); // match_id-map_index -> map_name
        mapsRes.data.forEach(m => {
            mapMetadataMap.set(`${m.match_id}-${m.map_index}`, m);
        });

        // 5. Fetch all teams for opponent names
        const { data: allTeams } = await supabase.from('teams').select('id, name');
        const teamNameMap = new Map(allTeams?.map(t => [t.id, t.name]) || []);
        // Fetch names for any subbed_for_id we might need to display
        const subForIds = Array.from(new Set((stats || []).map((s: any) => s.subbed_for_id).filter((v: any) => v)));
        const { data: subForPlayers } = subForIds.length > 0
            ? await supabase.from('players').select('id,name').in('id', subForIds)
            : { data: [] as any[] } as any;
        const subForNameMap = new Map((subForPlayers || []).map((p: any) => [p.id, p.name]));

        // 6. Process Performance over time (by week)
        const weekStats = new Map<number, { acs: number[]; adr: number[]; kast: number[]; kills: number; deaths: number; rounds: number }>();
        const agentCounts = new Map<string, number>();
        let totalWins = 0;
        const winsByMatch = new Set<number>();
        let totalRounds = 0;
        let totalStatsKills = 0;
        let totalStatsDeaths = 0;
        const recentMatches: any[] = [];

        (stats || []).forEach(s => {
            const match = matchMap.get(s.match_id);
            if (!match || match.status !== 'completed') return;

            // Performance
            const week = match.week || 0;
            const mapInfo = mapMetadataMap.get(`${s.match_id}-${s.map_index || 0}`);
            const rounds = (mapInfo?.team1_rounds || 0) + (mapInfo?.team2_rounds || 0);

            const w = weekStats.get(week) || { acs: [] as number[], kills: 0, deaths: 0, rounds: 0, adr: [] as number[], kast: [] as number[] };
            w.acs.push(s.acs || 0);
            w.adr.push(s.adr || 0);
            w.kast.push(s.kast || 0);
            w.kills += s.kills || 0;
            w.deaths += s.deaths || 0;
            w.rounds += rounds;
            weekStats.set(week, w);

            totalStatsKills += s.kills || 0;
            totalStatsDeaths += s.deaths || 0;
            totalRounds += rounds;

            // Agents
            if (s.agent) {
                agentCounts.set(s.agent, (agentCounts.get(s.agent) || 0) + 1);
            }

            // Recent Match — determine team actually played for
            let playedFor = s.team_id || null;
            if (!playedFor) {
                if (player.default_team_id === match.team1_id) playedFor = match.team1_id;
                else if (player.default_team_id === match.team2_id) playedFor = match.team2_id;
            }
            const opponentId = playedFor === match.team1_id ? match.team2_id : match.team1_id;

            let result: 'win' | 'loss' | 'draw' = 'draw';
            if (match.winner_id && playedFor) {
                const won = match.winner_id === playedFor;
                result = won ? 'win' : 'loss';
                if (won) winsByMatch.add(s.match_id);
            }

            recentMatches.push({
                matchId: s.match_id,
                week: match.week,
                opponent: teamNameMap.get(opponentId) || 'Unknown',
                map: mapInfo?.map_name || 'Unknown',
                acs: s.acs,
                kills: s.kills,
                deaths: s.deaths,
                assists: s.assists,
                adr: s.adr,
                kast: s.kast,
                hs_pct: s.hs_pct,
                result,
                is_sub: Boolean(s.is_sub),
                subbed_for_id: s.subbed_for_id || null,
                subbed_for_name: s.subbed_for_id ? (subForNameMap.get(s.subbed_for_id) || 'Unknown') : null
            });
        });

        const performance = Array.from(weekStats.entries())
            .map(([week, data]) => ({
                week,
                acs: Math.round(data.acs.reduce((a, b) => a + b, 0) / data.acs.length),
                kd: data.deaths > 0 ? parseFloat((data.kills / data.deaths).toFixed(2)) : data.kills
            }))
            .sort((a, b) => a.week - b.week);

        const agents = Array.from(agentCounts.entries())
            .map(([name, count]) => ({ name, count }))
            .sort((a, b) => b.count - a.count);

        // 7. Agent-specific Win Rates
        const agentWrMap = new Map<string, { wins: number; losses: number }>();
        (stats || []).forEach(s => {
            const match = matchMap.get(s.match_id);
            if (!match || match.status !== 'completed' || !s.agent) return;
            let playedFor = s.team_id || null;
            if (!playedFor) {
                if (player.default_team_id === match.team1_id) playedFor = match.team1_id;
                else if (player.default_team_id === match.team2_id) playedFor = match.team2_id;
            }
            const isWin = Boolean(match.winner_id && playedFor && match.winner_id === playedFor);
            const curr = agentWrMap.get(s.agent) || { wins: 0, losses: 0 };
            if (isWin) curr.wins += 1; else curr.losses += 1;
            agentWrMap.set(s.agent, curr);
        });
        const agentWinRates = Array.from(agentWrMap.entries())
            .map(([name, wl]) => {
                const total = wl.wins + wl.losses;
                const wr = total > 0 ? Math.round((wl.wins / total) * 100) : 0;
                return { name, wins: wl.wins, losses: wl.losses, wr };
            })
            .sort((a, b) => b.wr - a.wr || b.wins - a.wins);

        // 8. Map-specific Win Rates
        const mapWrMap = new Map<string, { wins: number; losses: number }>();
        (stats || []).forEach(s => {
            const match = matchMap.get(s.match_id);
            const mapInfo = mapMetadataMap.get(`${s.match_id}-${s.map_index || 0}`);
            if (!match || match.status !== 'completed' || !mapInfo?.map_name) return;
            let playedFor = s.team_id || null;
            if (!playedFor) {
                if (player.default_team_id === match.team1_id) playedFor = match.team1_id;
                else if (player.default_team_id === match.team2_id) playedFor = match.team2_id;
            }
            const isWin = Boolean(match.winner_id && playedFor && match.winner_id === playedFor);
            const curr = mapWrMap.get(mapInfo.map_name) || { wins: 0, losses: 0 };
            if (isWin) curr.wins += 1; else curr.losses += 1;
            mapWrMap.set(mapInfo.map_name, curr);
        });
        const mapWinRates = Array.from(mapWrMap.entries())
            .map(([name, wl]) => {
                const total = wl.wins + wl.losses;
                const wr = total > 0 ? Math.round((wl.wins / total) * 100) : 0;
                return { name, wins: wl.wins, losses: wl.losses, wr };
            })
            .sort((a, b) => b.wr - a.wr || b.wins - a.wins);

        return {
            id: player.id,
            name: player.name,
            riot_id: player.riot_id,
            team: teamTag,
            performance,
            agents,
            agentWinRates,
            mapWinRates,
            summary: {
                avgAcs: performance.length > 0 ? Math.round(performance.reduce((acc, curr) => acc + curr.acs, 0) / performance.length) : 0,
                kd: totalStatsDeaths > 0 ? Number((totalStatsKills / totalStatsDeaths).toFixed(2)) : totalStatsKills,
                kpr: totalRounds > 0 ? Number((totalStatsKills / totalRounds).toFixed(2)) : 0,
                avgAdr: stats && stats.length > 0 ? Math.round(stats.reduce((acc: number, curr: any) => acc + (curr.adr || 0), 0) / stats.length) : 0,
                avgKast: stats && stats.length > 0 ? Math.round(stats.reduce((acc: number, curr: any) => acc + (curr.kast || 0), 0) / stats.length) : 0,
                winRate: matchIds.length > 0 ? Math.round((winsByMatch.size / matchIds.length) * 100) : 0,
                matches: matchIds.length
            },
            recentMatches: recentMatches.sort((a, b) => b.week - a.week).slice(0, 10)
        };
    } catch (error) {
        console.error('Error fetching player stats:', error);
        return null;
    }
}

/**
 * Fetch all teams
 */
export async function getTeams(): Promise<{ id: number; name: string; tag: string }[]> {
    const { data, error } = await supabase
        .from('teams')
        .select('id, name, tag')
        .order('name');
    if (error) {
        console.error('Error fetching teams:', error);
        return [];
    }
    return data || [];
}

/**
 * Fetch all players
 */
export async function getPlayers(): Promise<{ id: number; name: string; riot_id: string }[]> {
    const { data, error } = await supabase
        .from('players')
        .select('id, name, riot_id')
        .order('name');
    if (error) {
        console.error('Error fetching players:', error);
        return [];
    }
    return data || [];
}

/**
 * Fetch detailed performance stats for a specific team
 */
export async function getTeamPerformance(teamId: number): Promise<TeamPerformance | null> {
    try {
        // 1. Fetch team info
        const { data: team, error: teamError } = await supabase
            .from('teams')
            .select('*')
            .eq('id', teamId)
            .single();

        if (teamError || !team) throw teamError || new Error('Team not found');

        // 2. Fetch matches for this team
        const { data: matches, error: matchesError } = await supabase
            .from('matches')
            .select('*')
            .or(`team1_id.eq.${teamId},team2_id.eq.${teamId}`);

        if (matchesError) throw matchesError;

        const matchIds = (matches || []).map(m => m.id);
        if (matchIds.length === 0) {
            return {
                id: team.id,
                name: team.name,
                tag: team.tag,
                group: team.group_name || 'N/A',
                progression: [],
                playerStats: [],
                maps: []
            };
        }

        // 3. Fetch match maps, stats and players
        const [mapsRes, statsRes, playersRes] = await Promise.all([
            supabase.from('match_maps').select('*').in('match_id', matchIds),
            supabase
                .from('match_stats_map')
                .select('match_id,map_index,team_id,player_id,acs,kills,deaths,assists,agent,is_sub,subbed_for_id,adr,kast')
                .in('match_id', matchIds),
            supabase.from('players').select('id,name,default_team_id')
        ]);

        if (mapsRes.error) throw mapsRes.error;
        if (statsRes.error) throw statsRes.error;
        if (playersRes.error) throw playersRes.error;

        // 4. Calculate Progression (Week vs Points/RD), with map-based fallback when match scores missing
        const progression: { week: number, points: number, rd: number }[] = [];
        const weekMap = new Map<number, { points: number, rd: number }>();

        // Build rounds aggregate per match for fallback
        const roundsByMatch = new Map<number, { t1: number; t2: number }>();
        (mapsRes.data || []).forEach((map: any) => {
            const agg = roundsByMatch.get(map.match_id) || { t1: 0, t2: 0 };
            agg.t1 += map.team1_rounds || 0;
            agg.t2 += map.team2_rounds || 0;
            roundsByMatch.set(map.match_id, agg);
        });

        (matches || []).forEach(m => {
            const week = m.week || 0;
            const current = weekMap.get(week) || { points: 0, rd: 0 };

            const isT1 = m.team1_id === teamId;
            const fallbackRounds = roundsByMatch.get(m.id) || { t1: 0, t2: 0 };
            // Points should be based on total rounds, not map wins
            const myRounds = (isT1 ? fallbackRounds.t1 : fallbackRounds.t2) || 0;
            const opRounds = (isT1 ? fallbackRounds.t2 : fallbackRounds.t1) || 0;

            let pts = 0;
            let winnerId = m.winner_id;

            // If match winner not set, infer from per-map winners
            if (!winnerId) {
                const mMaps = (mapsRes.data || []).filter((mm: any) => mm.match_id === m.id);
                if (mMaps.length > 0) {
                    let t1Wins = 0, t2Wins = 0;
                    mMaps.forEach((mm: any) => {
                        if (mm.winner_id === m.team1_id) t1Wins += 1;
                        else if (mm.winner_id === m.team2_id) t2Wins += 1;
                    });
                    if (t1Wins !== t2Wins) {
                        winnerId = t1Wins > t2Wins ? m.team1_id : m.team2_id;
                    }
                }
            }

            // If still no winner, fall back to rounds comparison
            if (!winnerId && myRounds !== opRounds) {
                winnerId = myRounds > opRounds ? (isT1 ? m.team1_id : m.team2_id) : (isT1 ? m.team2_id : m.team1_id);
            }

            if (winnerId === teamId) {
                pts = 15;
            } else {
                pts = Math.min(myRounds || 0, 12);
            }

            current.points += pts;
            current.rd += (myRounds || 0) - (opRounds || 0);
            weekMap.set(week, current);
        });

        Array.from(weekMap.entries())
            .sort((a, b) => a[0] - b[0])
            .forEach(([week, data]) => {
                progression.push({ week, points: data.points, rd: data.rd });
            });

        // 5. Map Win Rates
        const mapStats = new Map<string, { wins: number, losses: number }>();
        (mapsRes.data || []).forEach((mapData: any) => {
            const stats = mapStats.get(mapData.map_name) || { wins: 0, losses: 0 };

            // Determine winner by comparing rounds
            const t1Rounds = mapData.team1_rounds || 0;
            const t2Rounds = mapData.team2_rounds || 0;

            // Find the match to determine which team is team1/team2
            const match = matches?.find(m => m.id === mapData.match_id);
            if (!match) return;

            const isTeam1 = match.team1_id === teamId;
            const myRounds = isTeam1 ? t1Rounds : t2Rounds;
            const oppRounds = isTeam1 ? t2Rounds : t1Rounds;

            if (myRounds > oppRounds) {
                stats.wins += 1;
            } else if (oppRounds > myRounds) {
                stats.losses += 1;
            }
            // Ties are ignored

            mapStats.set(mapData.map_name, stats);
        });

        const maps = Array.from(mapStats.entries())
            .map(([name, s]) => ({ name, ...s }))
            .sort((a, b) => (b.wins / (b.wins + b.losses || 1)) - (a.wins / (a.wins + a.losses || 1)));

        // 6. Player Performance within team
        const playerLookup = new Map<number, { name: string; default_team_id: number | null }>();
        (playersRes.data || []).forEach((p: any) => {
            playerLookup.set(p.id, { name: p.name, default_team_id: p.default_team_id ?? null });
        });

        const pStats = new Map<number, { name: string, acs: number[], adr: number[], kast: number[], kills: number, deaths: number, matches: Set<number> }>();
        (statsRes.data || []).forEach((s: any) => {
            const pInfo = playerLookup.get(s.player_id);
            const playerName = pInfo?.name || 'Unknown';

            const current = pStats.get(s.player_id) || { name: playerName, acs: [] as number[], adr: [] as number[], kast: [] as number[], kills: 0, deaths: 0, matches: new Set<number>() };
            current.acs.push(s.acs || 0);
            current.adr.push(s.adr || 0);
            current.kast.push(s.kast || 0);
            current.kills += s.kills || 0;
            current.deaths += s.deaths || 0;
            current.matches.add(s.match_id);
            pStats.set(s.player_id, current);
        });
        // Filter by roster
        const rosterIds = new Set((playersRes.data || []).filter((p: any) => p.default_team_id === teamId).map((p: any) => p.id));

        const playerStats = Array.from(pStats.entries())
            .filter(([id]) => rosterIds.has(id))
            .map(([id, data]) => {
                const acsAvg = data.acs.length > 0 ? Math.round(data.acs.reduce((a, b) => a + b, 0) / data.acs.length) : 0;
                const kdVal = data.deaths > 0 ? parseFloat((data.kills / data.deaths).toFixed(2)) : data.kills;
                return {
                    name: data.name,
                    avgAcs: acsAvg,
                    kd: kdVal,
                    avgAdr: data.adr.length > 0 ? Math.round(data.adr.reduce((a: number, b: number) => a + b, 0) / data.adr.length) : 0,
                    avgKast: data.kast.length > 0 ? Math.round(data.kast.reduce((a: number, b: number) => a + b, 0) / data.kast.length) : 0,
                    matches: data.matches.size
                };
            })
            .sort((a, b) => b.avgAcs - a.avgAcs);

        return {
            id: team.id,
            name: team.name,
            tag: team.tag,
            group: team.group_name || 'N/A',
            progression,
            playerStats,
            maps
        };
    } catch (error) {
        console.error('Error fetching team performance:', error);
        return {
            id: teamId,
            name: 'Unknown',
            tag: 'N/A',
            group: 'N/A',
            progression: [],
            playerStats: [],
            maps: []
        };
    }
}

export type SubstitutionAnalytics = {
    teamStats: {
        teamId: number;
        teamName: string;
        subCount: number;
        winRateWithSub: number;
        winRateWithoutSub: number;
    }[];
    topSubs: {
        name: string;
        team: string;
        matches: number;
        avgAcs: number;
    }[];
    logs: {
        playerName: string;
        teamName: string;
        opponentName: string;
        week: number;
        acs: number;
        result: string;
    }[];
};

/**
 * Fetch substitution analytics
 */
export async function getSubstitutionAnalytics(): Promise<SubstitutionAnalytics> {
    try {
        // 1. Fetch data
        const [teams, players, matches, stats, mapData] = await Promise.all([
            supabase.from('teams').select('id, name').order('name'),
            supabase.from('players').select('id, name, default_team_id'),
            supabase.from('matches').select('*').eq('status', 'completed'),
            supabase.from('match_stats_map').select('*').eq('is_sub', 1),
            supabase.from('match_maps').select('*')
        ]);

        if (teams.error) throw teams.error;
        if (players.error) throw players.error;
        if (matches.error) throw matches.error;
        if (stats.error) throw stats.error;

        const teamMap = new Map(teams.data.map(t => [t.id, t.name]));
        const playerMap = new Map((players.data as any[]).map(p => [p.id, p]));

        // 2. Identify matches with subs and build logs
        const teamMatchesWithSubs = new Map<number, Set<number>>();
        const logs: any[] = [];
        const matchMap = new Map((matches.data as any[]).map(m => [m.id, m]));
        const mapMetadataMap = new Map((mapData.data as any[]).map(m => [`${m.match_id}-${m.map_index || 0}`, m]));

        (stats.data || []).forEach((s: any) => {
            const match = matchMap.get(s.match_id);
            const player = playerMap.get(s.player_id);
            if (!match || !player) return;

            // Prefer team_id from stats row to determine representing team
            let playedFor = s.team_id || 0;
            if (!playedFor) {
                if (player.default_team_id === match.team1_id) {
                    playedFor = match.team1_id;
                } else if (player.default_team_id === match.team2_id) {
                    playedFor = match.team2_id;
                } else {
                    // If we still can't resolve, skip
                    return;
                }
            }

            const current = teamMatchesWithSubs.get(playedFor) || new Set<number>();
            current.add(s.match_id);
            teamMatchesWithSubs.set(playedFor, current);

            const opponentId = match.team1_id === playedFor ? match.team2_id : match.team1_id;
            const result = match.winner_id === playedFor ? 'win' : 'loss';

            logs.push({
                playerName: player.name,
                teamName: teamMap.get(playedFor) || 'Unknown',
                opponentName: teamMap.get(opponentId) || 'Unknown',
                week: match.week || 0,
                acs: s.acs || 0,
                result
            });
        });

        // 3. Calculate Team Stats
        const teamStats = teams.data.map(team => {
            const matchesWithSub = teamMatchesWithSubs.get(team.id) || new Set<number>();
            const teamMatches = (matches.data as any[]).filter(m => m.team1_id === team.id || m.team2_id === team.id);

            const withSubMatches = teamMatches.filter(m => matchesWithSub.has(m.id));
            const withoutSubMatches = teamMatches.filter(m => !matchesWithSub.has(m.id));

            const calcWinRate = (ms: any[]) => {
                if (ms.length === 0) return 0;
                const wins = ms.filter(m => m.winner_id === team.id).length;
                return Math.round((wins / ms.length) * 100);
            };

            return {
                teamId: team.id,
                teamName: team.name,
                subCount: matchesWithSub.size,
                winRateWithSub: calcWinRate(withSubMatches),
                winRateWithoutSub: calcWinRate(withoutSubMatches)
            };
        }).sort((a, b) => b.subCount - a.subCount);

        // 4. Top Subs
        const subPerformance = new Map<number, { name: string, team: string, acs: number[], matches: Set<number> }>();
        (stats.data || []).forEach((s: any) => {
            const player = playerMap.get(s.player_id);
            if (!player) return;

            const current = subPerformance.get(s.player_id) || {
                name: player.name,
                team: teamMap.get(player.default_team_id || 0) || 'Free Agent',
                acs: [] as number[],
                matches: new Set<number>()
            };
            current.acs.push(s.acs || 0);
            current.matches.add(s.match_id);
            subPerformance.set(s.player_id, current);
        });

        const topSubs = Array.from(subPerformance.values())
            .map(s => ({
                name: s.name,
                team: s.team,
                matches: s.matches.size,
                avgAcs: Math.round(s.acs.reduce((a, b) => a + b, 0) / s.acs.length)
            }))
            .sort((a, b) => b.matches - a.matches || b.avgAcs - a.avgAcs)
            .slice(0, 10);

        return {
            teamStats,
            topSubs,
            logs: logs.sort((a, b) => b.week - a.week)
        };
    } catch (error) {
        console.error('Error fetching substitution analytics:', error);
        return { teamStats: [], topSubs: [], logs: [] };
    }
}

/**
 * Fetch global tournament statistics for the homepage
 */
export async function getGlobalStats(): Promise<GlobalStats> {
    try {
        // 1. Fetch counts in parallel
        const [teamsRes, matchesRes, playersRes] = await Promise.all([
            supabase.from('teams').select('*', { count: 'exact', head: true }),
            supabase.from('matches').select('*', { count: 'exact', head: true }).eq('status', 'completed'),
            supabase.from('players').select('*', { count: 'exact', head: true })
        ]);

        // 2. Fetch standings to calculate total points
        const standings = await getStandings();
        let totalPoints = 0;
        standings.forEach(group => {
            group.forEach(team => {
                totalPoints += team.Points;
            });
        });

        return {
            activeTeams: teamsRes.count || 0,
            matchesPlayed: matchesRes.count || 0,
            livePlayers: playersRes.count || 0,
            totalPoints: totalPoints
        };
    } catch (error) {
        console.error('Error fetching global stats:', error);
        return {
            activeTeams: 0,
            matchesPlayed: 0,
            livePlayers: 0,
            totalPoints: 0
        };
    }
}

/**
 * Fetch all matches for the match ledger
 */
export async function getAllMatches(): Promise<MatchEntry[]> {
    try {
        const { data: matches, error } = await supabase
            .from('matches')
            .select(`
                id,
                week,
                group_name,
                status,
                format,
                maps_played,
                winner_id,
                score_t1,
                score_t2,
                match_type,
                playoff_round,
                bracket_pos,
                bracket_label,
                team1:teams!team1_id(id, name, tag, logo_path),
                team2:teams!team2_id(id, name, tag, logo_path)
            `)
            .order('week', { ascending: false })
            .order('playoff_round', { ascending: false })
            .order('id', { ascending: false });

        if (error) throw error;

        const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
        const toLogoUrl = (path: string | null) => {
            if (!path) return null;
            if (path.startsWith('http://') || path.startsWith('https://')) return path;
            return baseUrl ? `${baseUrl}/storage/v1/object/public/${path.replace(/^\/+/, '')}` : null;
        };

        return (matches || []).map((m: any) => {
            const t1 = m.team1 || null;
            const t2 = m.team2 || null;
            const team1 = {
                id: t1?.id || 0,
                name: t1?.name || 'TBD',
                tag: t1?.tag || 'TBD',
                logo: toLogoUrl(t1?.logo_path || null),
                score: m.score_t1 ?? null
            };
            const team2 = {
                id: t2?.id || 0,
                name: t2?.name || 'TBD',
                tag: t2?.tag || 'TBD',
                logo: toLogoUrl(t2?.logo_path || null),
                score: m.score_t2 ?? null
            };
            return {
                id: m.id,
                week: m.week,
                group_name: m.group_name || 'N/A',
                status: m.status,
                format: m.format,
                maps_played: m.maps_played,
                winner_id: m.winner_id ?? null,
                match_type: m.match_type,
                playoff_round: m.playoff_round,
                bracket_pos: m.bracket_pos,
                team1,
                team2,
            };
        });
    } catch (error) {
        console.error('Error fetching all matches:', error);
        return [];
    }
}
export type PlayoffMatch = MatchEntry & {
    playoff_round: number;
    bracket_pos: number;
    bracket_label: string | null;
};

/**
 * Fetch all playoff matches for the bracket view
 */
export async function getPlayoffMatches(): Promise<PlayoffMatch[]> {
    try {
        const { data: matches, error } = await supabase
            .from('matches')
            .select(`
                id,
                week,
                group_name,
                status,
                format,
                maps_played,
                winner_id,
                score_t1,
                score_t2,
                match_type,
                playoff_round,
                bracket_pos,
                bracket_label,
                team1:teams!team1_id(id, name, tag, logo_path),
                team2:teams!team2_id(id, name, tag, logo_path)
            `)
            .eq('match_type', 'playoff')
            .order('playoff_round', { ascending: true })
            .order('bracket_pos', { ascending: true });

        if (error) throw error;

        const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
        const toLogoUrl = (path: string | null) => {
            if (!path) return null;
            if (path.startsWith('http://') || path.startsWith('https://')) return path;
            return baseUrl ? `${baseUrl}/storage/v1/object/public/${path.replace(/^\/+/, '')}` : null;
        };

        return (matches || []).map((m: any) => ({
            id: m.id,
            week: m.week,
            group_name: m.group_name || 'Playoffs',
            status: m.status,
            format: m.format,
            maps_played: m.maps_played,
            winner_id: m.winner_id,
            playoff_round: m.playoff_round,
            bracket_pos: m.bracket_pos,
            bracket_label: m.bracket_label,
            team1: {
                id: m.team1?.id || 0,
                name: m.team1?.name || (m.bracket_label?.split('vs')[0]?.trim() || 'TBD'),
                tag: m.team1?.tag || 'TBD',
                logo: toLogoUrl(m.team1?.logo_path || null),
                score: m.score_t1
            },
            team2: {
                id: m.team2?.id || 0,
                name: m.team2?.name || (m.bracket_label?.split('vs')[1]?.trim() || 'TBD'),
                tag: m.team2?.tag || 'TBD',
                logo: toLogoUrl(m.team2?.logo_path || null),
                score: m.score_t2
            }
        }));
    } catch (error) {
        console.error('Error fetching playoff matches:', error);
        return [];
    }
}

export async function generateNextPlayoffRound(currentRound: number): Promise<boolean> {
    try {
        const { data: matches } = await supabase
            .from('matches')
            .select('*')
            .eq('match_type', 'playoff')
            .eq('playoff_round', currentRound);
        if (!matches || matches.length === 0) return true;
        // Pair winners by bracket_pos
        const winners = matches
            .filter(m => m.status === 'completed' && m.winner_id)
            .sort((a: any, b: any) => (a.bracket_pos || 0) - (b.bracket_pos || 0));
        const nextRound = currentRound + 1;
        const { data: nextMatches } = await supabase
            .from('matches')
            .select('*')
            .eq('match_type', 'playoff')
            .eq('playoff_round', nextRound);
        const nextMap = new Map((nextMatches || []).map((m: any) => [m.bracket_pos, m]));
        // Map each winner from current round position directly into next round slot with same bracket_pos.
        for (let i = 0; i < winners.length; i++) {
            const w = winners[i];
            const winnerTeam = w.winner_id;
            if (!winnerTeam) continue;
            const targetPos = w.bracket_pos || ((i % winners.length) + 1);
            const existing = nextMap.get(targetPos);
            if (existing) {
                const payload: any = {};
                if (!existing.team1_id) payload.team1_id = winnerTeam;
                else if (!existing.team2_id) payload.team2_id = winnerTeam;
                if (!payload.team1_id && !payload.team2_id) {
                    // both filled; skip or update based on status
                }
                await updateMatch(existing.id, payload);
            } else {
                await supabase.from('matches').insert({
                    week: w.week || 0,
                    group_name: 'Playoffs',
                    team1_id: null,
                    team2_id: winnerTeam,
                    status: 'scheduled',
                    format: 'BO3',
                    maps_played: 0,
                    match_type: 'playoff',
                    playoff_round: nextRound,
                    bracket_pos: targetPos,
                    bracket_label: `R${nextRound} #${targetPos}`
                } as any);
            }
        }
        return true;
    } catch (e) {
        console.error('Error generating next playoff round:', e);
        return false;
    }
}
/**
 * Fetch all pending bot requests
 */
export async function getPendingRequests(): Promise<{ matches: PendingMatch[], players: PendingPlayer[] }> {
    try {
        const [mRes, pRes] = await Promise.all([
            supabase.from('pending_matches').select('*').order('timestamp', { ascending: false }),
            supabase.from('pending_players').select('*').order('timestamp', { ascending: false })
        ]);

        return {
            matches: (mRes.data || []) as PendingMatch[],
            players: (pRes.data || []) as PendingPlayer[]
        };
    } catch (error) {
        console.error('Error fetching pending requests:', error);
        return { matches: [], players: [] };
    }
}

/**
 * Update the status of a pending request (e.g., accepted, rejected)
 */
export async function updatePendingRequestStatus(type: 'match' | 'player', id: number, status: string): Promise<boolean> {
    try {
        const table = type === 'match' ? 'pending_matches' : 'pending_players';
        const { error } = await supabase
            .from(table)
            .update({ status })
            .eq('id', id);

        if (error) throw error;
        return true;
    } catch (error) {
        console.error(`Error updating pending ${type} status:`, error);
        return false;
    }
}

/**
 * Create a new match
 */
export async function createMatch(match: Omit<MatchEntry, 'id' | 'team1' | 'team2'> & { team1_id: number, team2_id: number }): Promise<number | null> {
    try {
        const res = await fetch('/api/admin/matches/create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                week: match.week,
                group_name: match.group_name,
                team1_id: match.team1_id,
                team2_id: match.team2_id,
                status: match.status,
                format: match.format,
                maps_played: match.maps_played,
                match_type: match.match_type || (match.group_name === 'Playoffs' ? 'playoff' : 'regular'),
                playoff_round: match.playoff_round,
                bracket_pos: match.bracket_pos,
                bracket_label: match.bracket_label
            })
        } as any);
        if (!res.ok) throw new Error(await res.text());
        const j = await res.json();
        return j?.id || null;
    } catch (error) {
        console.error('Error creating match:', error);
        return null;
    }
}

/**
 * Update an existing match
 */
type MatchUpdate = {
    team1_id?: number;
    team2_id?: number;
    winner_id?: number | null;
    score_t1?: number;
    score_t2?: number;
    status?: 'scheduled' | 'completed' | 'live';
    format?: 'BO1' | 'BO3' | 'BO5';
    maps_played?: number;
    is_forfeit?: boolean;
    match_type?: 'regular' | 'playoff';
    playoff_round?: number;
    bracket_pos?: number;
    bracket_label?: string;
};
export async function updateMatch(id: number, match: MatchUpdate): Promise<boolean> {
    try {
        const updateData: any = { ...match };
        if (typeof updateData.is_forfeit === 'boolean') {
            updateData.is_forfeit = updateData.is_forfeit ? 1 : 0;
        }
        delete updateData.team1;
        delete updateData.team2;
        delete updateData.id;
        const res = await fetch('/api/admin/matches/update', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id, update: updateData })
        } as any);
        if (!res.ok) throw new Error(await res.text());
        return true;
    } catch (error) {
        console.error('Error updating match:', error);
        return false;
    }
}

/**
 * Bulk create matches (for the Bulk Add parser)
 */
export async function bulkCreateMatches(matches: (Omit<MatchEntry, 'id' | 'team1' | 'team2'> & { team1_id: number, team2_id: number })[]): Promise<boolean> {
    try {
        const payload = matches.map(m => ({
            week: m.week,
            group_name: m.group_name,
            team1_id: m.team1_id,
            team2_id: m.team2_id,
            status: m.status,
            format: m.format,
            maps_played: m.maps_played,
            match_type: m.match_type || (m.group_name === 'Playoffs' ? 'playoff' : 'regular'),
            playoff_round: m.playoff_round,
            bracket_pos: m.bracket_pos,
            bracket_label: m.bracket_label
        }));
        const res = await fetch('/api/admin/matches/bulk', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        } as any);
        if (!res.ok) throw new Error(await res.text());
        return true;
    } catch (error) {
        console.error('Error bulk creating matches:', error);
        return false;
    }
}

export async function getMatchDetails(matchId: number): Promise<{
    match: {
        id: number;
        week: number;
        group_name: string;
        status: string;
        format: string;
        score_t1: number | null;
        score_t2: number | null;
        team1: { id: number; name: string; tag: string };
        team2: { id: number; name: string; tag: string };
    } | null;
    maps: Array<{
        index: number;
        name: string;
        t1_rounds: number;
        t2_rounds: number;
        winner_id: number | null;
        is_forfeit: number;
        stats: Array<{
            team_id: number;
            player_id: number;
            player_name: string;
            is_sub: number;
            subbed_for_id: number | null;
            agent: string;
            acs: number;
            kills: number;
            deaths: number;
            assists: number;
            adr?: number;
            kast?: number;
            hs_pct?: number;
            fk?: number;
            fd?: number;
            mk?: number;
            dd_delta?: number;
        }>;
        rounds: Array<{
            round_number: number;
            winning_team_id: number;
            win_type: string;
            plant: boolean;
            defuse: boolean;
            economy_t1: number;
            economy_t2: number;
        }>;
    }>;
}> {
    try {
        const { data: m, error } = await supabase
            .from('matches')
            .select('id, week, group_name, status, format, score_t1, score_t2, team1_id, team2_id')
            .eq('id', matchId)
            .single();
        if (error) throw error;
        if (!m) return { match: null, maps: [] };

        const { data: tdata } = await supabase.from('teams').select('id,name,tag').in('id', [m.team1_id, m.team2_id]);
        const tMap = new Map((tdata || []).map((t: any) => [t.id, t]));

        const { data: maps, error: mapsErr } = await supabase
            .from('match_maps')
            .select('*')
            .eq('match_id', matchId)
            .order('map_index', { ascending: true });
        if (mapsErr) throw mapsErr;

        const { data: stats, error: statsErr } = await supabase
            .from('match_stats_map')
            .select('match_id,map_index,team_id,player_id,is_sub,subbed_for_id,agent,acs,kills,deaths,assists,adr,kast,hs_pct,fk,fd,mk,dd_delta')
            .eq('match_id', matchId)
            .order('map_index', { ascending: true });
        if (statsErr) throw new Error(statsErr.message || JSON.stringify(statsErr));

        const { data: roundsData, error: roundsErr } = await supabase
            .from('match_rounds')
            .select('*')
            .eq('match_id', matchId)
            .order('round_number', { ascending: true });
        if (roundsErr) throw new Error(roundsErr.message || JSON.stringify(roundsErr));

        const playerIds = Array.from(new Set((stats || []).map((s: any) => s.player_id)));
        const { data: pinfo, error: pErr } = await supabase
            .from('players')
            .select('id,name')
            .in('id', playerIds.length > 0 ? playerIds : [-1]);
        if (pErr) throw new Error(pErr.message || JSON.stringify(pErr));
        const pMap = new Map((pinfo || []).map((p: any) => [p.id, p.name]));

        const mapsOut = (maps || []).map((mm: any) => {
            const mapStats = (stats || []).filter((s: any) => s.map_index === mm.map_index);
            const mapRounds = (roundsData || []).filter((r: any) => r.map_index === mm.map_index);
            return {
                index: mm.map_index,
                name: mm.map_name,
                t1_rounds: mm.team1_rounds || 0,
                t2_rounds: mm.team2_rounds || 0,
                winner_id: mm.winner_id || null,
                is_forfeit: mm.is_forfeit || 0,
                stats: mapStats.map((s: any) => ({
                    team_id: s.team_id,
                    player_id: s.player_id,
                    player_name: pMap.get(s.player_id) || 'Unknown',
                    is_sub: s.is_sub || 0,
                    subbed_for_id: s.subbed_for_id || null,
                    agent: s.agent || 'Unknown',
                    acs: s.acs || 0,
                    kills: s.kills || 0,
                    deaths: s.deaths || 0,
                    assists: s.assists || 0,
                    adr: s.adr || 0,
                    kast: s.kast || 0,
                    hs_pct: s.hs_pct || 0,
                    fk: s.fk || 0,
                    fd: s.fd || 0,
                    mk: s.mk || 0,
                    dd_delta: s.dd_delta || 0
                })),
                rounds: mapRounds.map((r: any) => ({
                    round_number: r.round_number,
                    winning_team_id: r.winning_team_id,
                    win_type: r.win_type,
                    plant: r.plant,
                    defuse: r.defuse,
                    economy_t1: r.economy_t1,
                    economy_t2: r.economy_t2
                }))
            };
        });

        return {
            match: {
                id: m.id,
                week: m.week,
                group_name: m.group_name || 'N/A',
                status: m.status,
                format: m.format,
                score_t1: m.score_t1 ?? null,
                score_t2: m.score_t2 ?? null,
                team1: { id: m.team1_id, name: tMap.get(m.team1_id)?.name || 'TBD', tag: tMap.get(m.team1_id)?.tag || 'TBD' },
                team2: { id: m.team2_id, name: tMap.get(m.team2_id)?.name || 'TBD', tag: tMap.get(m.team2_id)?.tag || 'TBD' }
            },
            maps: mapsOut
        };
    } catch (e) {
        console.error('Error fetching match details:', e);
        return { match: null, maps: [] };
    }
}
/**
 * Save per-map results and player statistics (Unified Map/Stats Editor)
 */
export async function saveMapResults(
    matchId: number,
    mapData: {
        index: number,
        name: string,
        t1_rounds: number,
        t2_rounds: number,
        winner_id: number | null,
        is_forfeit: boolean
    },
    playerStats: {
        team_id: number,
        player_id: number,
        is_sub: boolean,
        subbed_for_id: number | null,
        agent: string,
        acs: number,
        kills: number,
        deaths: number,
        assists: number,
        adr?: number,
        kast?: number,
        hs_pct?: number,
        fk?: number,
        fd?: number,
        mk?: number,
        dd_delta?: number
    }[],
    meta?: { pendingId?: number, url?: string },
    rounds?: any[],
    playerRounds?: any[]
): Promise<boolean> {
    try {
        const res = await fetch('/api/admin/maps/save', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ matchId, mapData, playerStats, meta, rounds, playerRounds })
        } as any);
        if (!res.ok) throw new Error(await res.text());
        return true;
    } catch (error) {
        console.error('Error saving map results:', error);
        return false;
    }
}

/**
 * Advance playoff bracket when a match updates to completed.
 *
 * 24-team bracket format:
 *   Round 1 (Play-ins, 8 matches): winners advance 1-to-1 to R2 same bracket_pos
 *   Round 2+ (16→QF→SF→F): winners pair as siblings (pos 1&2→1, 3&4→2, etc.)
 */
export async function advanceBracketOnMatchUpdate(matchId: number): Promise<void> {
    try {
        const { data: m } = await supabase
            .from('matches')
            .select('id, week, group_name, status, match_type, winner_id, playoff_round, bracket_pos')
            .eq('id', matchId)
            .single();
        if (!m || m.match_type !== 'playoff' || m.status !== 'completed') return;
        const winnerTeam: number | null = m.winner_id ?? null;
        if (!winnerTeam) return;
        const round: number = m.playoff_round || 1;
        const pos: number = m.bracket_pos || 0;
        if (!pos) return;

        if (round === 1) {
            // ── R1 → R2: 1-to-1 mapping (play-in winner fills the empty slot at same bracket_pos in R2)
            const { data: r2Match } = await supabase
                .from('matches')
                .select('*')
                .eq('match_type', 'playoff')
                .eq('playoff_round', 2)
                .eq('bracket_pos', pos)
                .limit(1);
            if (r2Match && r2Match.length > 0) {
                const nm = r2Match[0];
                const updates: any = {};
                if (!nm.team2_id) updates.team2_id = winnerTeam;       // BYE seed is team1, play-in winner is team2
                else if (!nm.team1_id) updates.team1_id = winnerTeam;  // fallback
                if (updates.team1_id || updates.team2_id) {
                    await updateMatch(nm.id, updates);
                }
            } else {
                // Create R2 match if it doesn't exist (winner waits for BYE seed)
                await supabase.from('matches').insert({
                    week: m.week || 0,
                    group_name: 'Playoffs',
                    team1_id: null,
                    team2_id: winnerTeam,
                    status: 'scheduled',
                    format: 'BO3',
                    maps_played: 0,
                    match_type: 'playoff',
                    playoff_round: 2,
                    bracket_pos: pos,
                    bracket_label: `R2 #${pos}`
                } as any);
            }
        } else {
            // ── R2+ → next round: sibling pairing (pos 1&2 → 1, 3&4 → 2, etc.)
            const siblingPos = pos % 2 === 1 ? pos + 1 : pos - 1;
            const targetPos = Math.ceil(Math.min(pos, siblingPos) / 2);
            const nextRound = round + 1;

            const { data: sibling } = await supabase
                .from('matches')
                .select('id, winner_id, status, playoff_round, bracket_pos, week')
                .eq('match_type', 'playoff')
                .eq('playoff_round', round)
                .eq('bracket_pos', siblingPos)
                .limit(1);

            if (sibling && sibling.length > 0 && sibling[0].status === 'completed' && sibling[0].winner_id) {
                // Both siblings completed — pair winners into next round
                const lowerPosWinner = pos < siblingPos ? winnerTeam : sibling[0].winner_id as number;
                const upperPosWinner = pos < siblingPos ? sibling[0].winner_id as number : winnerTeam;

                const { data: nextMatch } = await supabase
                    .from('matches')
                    .select('*')
                    .eq('match_type', 'playoff')
                    .eq('playoff_round', nextRound)
                    .eq('bracket_pos', targetPos)
                    .limit(1);

                if (nextMatch && nextMatch.length > 0) {
                    const nm = nextMatch[0];
                    const upd: any = {};
                    if (!nm.team1_id) upd.team1_id = lowerPosWinner;
                    if (!nm.team2_id) upd.team2_id = upperPosWinner;
                    if (upd.team1_id || upd.team2_id) await updateMatch(nm.id, upd);
                } else {
                    await supabase.from('matches').insert({
                        week: m.week || 0,
                        group_name: 'Playoffs',
                        team1_id: lowerPosWinner,
                        team2_id: upperPosWinner,
                        status: 'scheduled',
                        format: 'BO3',
                        maps_played: 0,
                        match_type: 'playoff',
                        playoff_round: nextRound,
                        bracket_pos: targetPos,
                        bracket_label: `R${nextRound} #${targetPos}`
                    } as any);
                }
            }
            // else: sibling not yet completed, nothing to do — wait for the other match
        }
    } catch (e) {
        console.error('Error advancing bracket:', e);
    }
}

export type BracketAction = {
    kind: 'fill' | 'create';
    target_round: number;
    bracket_pos: number;
    match_id?: number;
    team1_id?: number | null;
    team2_id?: number | null;
    title: string;
    reason: string;
};

export async function computeBracketAdvancements(): Promise<BracketAction[]> {
    const actions: BracketAction[] = [];
    try {
        const [{ data: matches }, { data: teams }, { data: maps }] = await Promise.all([
            supabase.from('matches').select('*').eq('match_type', 'playoff'),
            supabase.from('teams').select('id,name,tag'),
            supabase.from('match_maps').select('match_id, team1_rounds, team2_rounds')
        ]);
        const teamMap = new Map((teams || []).map((t: any) => [t.id, t.name]));
        const roundsByMatch = new Map<number, { t1: number; t2: number }>();
        (maps || []).forEach((mm: any) => {
            const agg = roundsByMatch.get(mm.match_id) || { t1: 0, t2: 0 };
            agg.t1 += mm.team1_rounds || 0;
            agg.t2 += mm.team2_rounds || 0;
            roundsByMatch.set(mm.match_id, agg);
        });
        const deriveWinner = (m: any): number | null => {
            if (m?.winner_id) return m.winner_id;
            const s1 = m?.score_t1;
            const s2 = m?.score_t2;
            if (typeof s1 === 'number' && typeof s2 === 'number' && s1 !== s2) {
                return s1 > s2 ? m.team1_id : m.team2_id;
            }
            const rr = roundsByMatch.get(m.id);
            if (rr && rr.t1 !== rr.t2) return rr.t1 > rr.t2 ? m.team1_id : m.team2_id;
            return null;
        };
        const byRoundPos = new Map<string, any>();
        (matches || []).forEach((m: any) => {
            const key = `${m.playoff_round || 0}:${m.bracket_pos || 0}`;
            byRoundPos.set(key, m);
        });

        // 1) R1 → R2: play-in winner fills the empty slot at same bracket_pos in R2
        (matches || []).filter((m: any) => m.status === 'completed' && (m.playoff_round || 0) === 1).forEach((m: any) => {
            const winId = deriveWinner(m);
            if (!winId) return;
            const pos = m.bracket_pos || 0;
            if (!pos) return;
            const nextKey = `2:${pos}`;
            const nm = byRoundPos.get(nextKey);
            const winnerName = teamMap.get(winId) || `Team ${winId}`;
            if (nm) {
                const t1 = nm.team1_id;
                const t2 = nm.team2_id;
                // Only fill if exactly one slot is empty (BYE seed occupies one side)
                if ((t1 && !t2) || (!t1 && t2)) {
                    actions.push({
                        kind: 'fill',
                        target_round: 2,
                        bracket_pos: pos,
                        match_id: nm.id,
                        team1_id: t1 ? t1 : winId,
                        team2_id: t1 ? winId : t2,
                        title: `R2 #${pos}: ${teamMap.get(t1) || 'TBD'} vs ${teamMap.get(t2) || 'TBD'}`,
                        reason: `Fill BYE slot with play-in winner ${winnerName}`
                    });
                }
            }
        });

        // 2) R2+ → next round: sibling pairing (pos 1&2 → 1, 3&4 → 2, etc.)
        const perRound = new Map<number, any[]>();
        (matches || []).forEach(m => {
            const r = m.playoff_round || 0;
            if (r < 2) return; // skip R1
            const arr = perRound.get(r) || [];
            arr.push(m);
            perRound.set(r, arr);
        });
        perRound.forEach((arr, round) => {
            const byPos = new Map<number, any>();
            arr.forEach(m => byPos.set(m.bracket_pos || 0, m));
            for (let p = 1; p <= 16; p += 2) { // support up to 16 slots per round
                const a = byPos.get(p);
                const b = byPos.get(p + 1);
                if (!a || !b) continue;
                if (a.status === 'completed' && b.status === 'completed') {
                    const w1 = deriveWinner(a);
                    const w2 = deriveWinner(b);
                    if (!w1 || !w2) continue;
                    const targetPos = Math.ceil(p / 2);
                    const nextKey = `${round + 1}:${targetPos}`;
                    const nm = byRoundPos.get(nextKey);
                    const t1Name = teamMap.get(w1) || `Team ${w1}`;
                    const t2Name = teamMap.get(w2) || `Team ${w2}`;
                    if (nm) {
                        // Only propose if slots are still empty
                        if (!nm.team1_id || !nm.team2_id) {
                            actions.push({
                                kind: 'fill',
                                target_round: round + 1,
                                bracket_pos: targetPos,
                                match_id: nm.id,
                                team1_id: nm.team1_id || w1,
                                team2_id: nm.team2_id || w2,
                                title: `R${round + 1} #${targetPos}: ${t1Name} vs ${t2Name}`,
                                reason: `Pair sibling winners ${t1Name} vs ${t2Name}`
                            });
                        }
                    } else {
                        actions.push({
                            kind: 'create',
                            target_round: round + 1,
                            bracket_pos: targetPos,
                            team1_id: w1,
                            team2_id: w2,
                            title: `R${round + 1} #${targetPos}: ${t1Name} vs ${t2Name}`,
                            reason: `Create match for sibling winners`
                        });
                    }
                }
            }
        });
    } catch (e) {
        console.error('Error computing bracket advancements:', e);
    }
    return actions;
}

export async function applyBracketAdvancements(actions: BracketAction[]): Promise<boolean> {
    try {
        for (const act of actions) {
            if (act.kind === 'fill' && act.match_id) {
                const payload: any = {};
                if (act.team1_id !== undefined) payload.team1_id = act.team1_id;
                if (act.team2_id !== undefined) payload.team2_id = act.team2_id;
                await updateMatch(act.match_id, payload);
            } else if (act.kind === 'create') {
                await supabase.from('matches').insert({
                    week: 0,
                    group_name: 'Playoffs',
                    team1_id: act.team1_id ?? null,
                    team2_id: act.team2_id ?? null,
                    status: 'scheduled',
                    format: 'BO3',
                    maps_played: 0,
                    match_type: 'playoff',
                    playoff_round: act.target_round,
                    bracket_pos: act.bracket_pos,
                    bracket_label: `R${act.target_round} #${act.bracket_pos}`
                } as any);
            }
        }
        return true;
    } catch (e) {
        console.error('Error applying bracket advancements:', e);
        return false;
    }
}
export async function clearMatchDetails(matchId: number): Promise<boolean> {
    try {
        await Promise.all([
            supabase.from('match_maps').delete().eq('match_id', matchId),
            supabase.from('match_stats_map').delete().eq('match_id', matchId)
        ]);
        return true;
    } catch (e) {
        console.error('Error clearing match details:', e);
        return false;
    }
}
/**
 * Basic team list for admin dropdowns
 */
export async function getTeamsBasic(): Promise<{ id: number, name: string, tag: string, group_name: string }[]> {
    try {
        const { data, error } = await supabase
            .from('teams')
            .select('id, name, tag, group_name')
            .order('name');

        if (error) throw error;
        return data || [];
    } catch (error) {
        console.error('Error fetching basic teams:', error);
        return [];
    }
}

/**
 * Get count of remaining (scheduled) matches for each team
 */
export async function getRemainingMatchesCounts(): Promise<Map<number, number>> {
    try {
        const { data: matches, error } = await supabase
            .from('matches')
            .select('team1_id, team2_id')
            .eq('status', 'scheduled');

        if (error) throw error;
        const counts = new Map<number, number>();
        (matches || []).forEach(m => {
            if (m.team1_id) counts.set(m.team1_id, (counts.get(m.team1_id) || 0) + 1);
            if (m.team2_id) counts.set(m.team2_id, (counts.get(m.team2_id) || 0) + 1);
        });
        return counts;
    } catch (e) {
        console.error('Error fetching remaining counts:', e);
        return new Map();
    }
}

/**
 * Annotate teams with elimination status based on current standings
 */
export async function annotateElimination(standings: StandingsRow[]): Promise<(StandingsRow & { eliminated: boolean, remaining: number })[]> {
    const remainingMap = await getRemainingMatchesCounts();
    const grouped = new Map<string, StandingsRow[]>();
    standings.forEach(s => {
        const arr = grouped.get(s.group_name) || [];
        arr.push(s);
        grouped.set(s.group_name, arr);
    });

    const out: (StandingsRow & { eliminated: boolean, remaining: number })[] = [];
    for (const [groupName, groupTeams] of grouped.entries()) {
        const sorted = [...groupTeams].sort((a, b) => {
            if (b.Points !== a.Points) return b.Points - a.Points;
            return b.PD - a.PD;
        });

        const sixthPts = sorted.length >= 6 ? sorted[5].Points : 0;
        sorted.forEach(t => {
            const rem = remainingMap.get(t.id) || 0;
            const maxPts = t.Points + (rem * 15);
            out.push({
                ...t,
                remaining: rem,
                eliminated: maxPts < sixthPts
            });
        });
    }
    return out;
}
/**
 * Get dashboard stats for the admin panel
 */
export async function getDashboardStats(): Promise<GlobalStats> {
    try {
        const fiveMinsAgo = Math.floor(Date.now() / 1000) - 300;

        const [teamsRes, matchesRes, activityRes] = await Promise.all([
            supabase.from('teams').select('id', { count: 'exact', head: true }),
            supabase.from('matches').select('id', { count: 'exact', head: true }).eq('status', 'completed'),
            supabase.from('session_activity').select('ip_address', { count: 'exact', head: true }).gt('last_activity', fiveMinsAgo)
        ]);

        return {
            activeTeams: teamsRes.count || 0,
            matchesPlayed: matchesRes.count || 0,
            livePlayers: activityRes.count || 0,
            totalPoints: 0 // Not strictly needed for dashboard top card
        };
    } catch (e) {
        console.error('Error fetching dashboard stats:', e);
        return { activeTeams: 0, matchesPlayed: 0, livePlayers: 1, totalPoints: 0 };
    }
}

/**
 * Update session activity for live user count
 */
export async function updateSessionActivity(ip: string) {
    try {
        const now = Math.floor(Date.now() / 1000);
        await supabase.from('session_activity').upsert(
            { ip_address: ip, last_activity: now },
            { onConflict: 'ip_address' }
        );
    } catch (e) {
        // Silently fail if table doesn't exist or other issues
    }
}
