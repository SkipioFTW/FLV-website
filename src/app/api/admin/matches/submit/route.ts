import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { supabaseServer } from '@/lib/supabaseServer';
import { parseHenrikDevJson } from '@/lib/data';

function isAuthorized(req: NextRequest) {
  const botSecret = req.headers.get('x-bot-secret');
  if (botSecret && botSecret === process.env.BOT_SECRET) return true;
  const cookie = req.cookies.get('admin_session')?.value;
  const token = process.env.ADMIN_TOKEN;
  if (!cookie || !token) return false;
  const [ts, sig] = cookie.split('.');
  const msg = `admin:${ts}`;
  const expected = crypto.createHmac('sha256', token).update(msg).digest('hex');
  const fresh = Math.abs(Date.now() - Number(ts)) < 12 * 60 * 60 * 1000;
  return expected === sig && fresh;
}

function computeExtraStats(kills: any[], rounds: any[], allPlayers: any[]) {
  const allRoundNums = new Set<number>();
  for (const k of kills) if (k.round != null) allRoundNums.add(k.round);
  for (const r of rounds) {
    const rn = r.id ?? r.round_number;
    if (rn != null) allRoundNums.add(rn);
  }

  const killsPerRound: Record<number, Record<string, number>> = {};
  const deathsPerRound: Record<number, Set<string>> = {};
  const tradedPerRound: Record<number, Set<string>> = {};
  const roundWinner: Record<number, string> = {};
  const playerTeam: Record<string, string> = {};

  for (const rn of allRoundNums) {
    killsPerRound[rn] = {};
    deathsPerRound[rn] = new Set();
    tradedPerRound[rn] = new Set();

    const roundKills = kills.filter((k: any) => k.round === rn);
    const victimSet = new Set<string>();

    for (const k of roundKills) {
      const kt = `${k.killer?.name ?? ''}#${k.killer?.tag ?? ''}`.toLowerCase();
      const vt = `${k.victim?.name ?? ''}#${k.victim?.tag ?? ''}`.toLowerCase();
      if (kt && kt !== '#') killsPerRound[rn][kt] = (killsPerRound[rn][kt] || 0) + 1;
      if (vt && vt !== '#') victimSet.add(vt);
    }

    deathsPerRound[rn] = victimSet;

    for (const k of roundKills) {
      const vt = `${k.victim?.name ?? ''}#${k.victim?.tag ?? ''}`.toLowerCase();
      const kt = `${k.killer?.name ?? ''}#${k.killer?.tag ?? ''}`.toLowerCase();
      if (vt !== '#' && victimSet.has(kt)) tradedPerRound[rn].add(vt);
    }
  }

  for (const r of rounds) {
    const rn = r.id ?? r.round_number;
    if (rn != null) roundWinner[rn] = (r.winning_team ?? '').toLowerCase();
  }

  for (const p of allPlayers) {
    const rid = `${p.name ?? ''}#${p.tag ?? ''}`.toLowerCase();
    if (rid && rid !== '#') playerTeam[rid] = (p.team_id ?? p.team ?? '').toLowerCase();
  }

  const stats: Record<string, { kast: number; survived: number; traded: number; clutches: number }> = {};
  const total = allRoundNums.size || 1;

  for (const p of allPlayers) {
    const rid = `${p.name ?? ''}#${p.tag ?? ''}`.toLowerCase();
    if (!rid || rid === '#') continue;

    let kastCount = 0, survivedCount = 0, tradedCount = 0, clutchCount = 0;
    const pTeam = playerTeam[rid] ?? '';

    for (const rn of [...allRoundNums].sort((a, b) => a - b)) {
      const hadKill = (killsPerRound[rn]?.[rid] ?? 0) >= 1;
      const died = deathsPerRound[rn]?.has(rid) ?? false;
      const traded = tradedPerRound[rn]?.has(rid) ?? false;

      if (hadKill || !died || traded) kastCount++;
      if (!died) survivedCount++;
      if (traded) tradedCount++;
      if (!died && roundWinner[rn] === pTeam) clutchCount++;
    }

    stats[rid] = {
      kast: Math.round((kastCount / total) * 100),
      survived: survivedCount,
      traded: tradedCount,
      clutches: clutchCount,
    };
  }

  return stats;
}

function extractMatchUuid(link: string): string | null {
  const clean = link.replace(/\/+$/, '').trim();
  const m = clean.match(/\/([a-f0-9\-]{36})$/i);
  return m ? m[1] : null;
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const body = await req.json();
  const { matchId, team1Id, team2Id, captainTeamId, roster1Rids, roster2Rids, maps } = body || {};

  if (!matchId || !maps || !Array.isArray(maps) || maps.length === 0) {
    return NextResponse.json({ error: 'bad request: matchId and maps required' }, { status: 400 });
  }

  const apiKey = process.env.HENDRIK_API_KEY;

  // Build riot_id → player_id map
  const { data: playerRows } = await supabaseServer.from('players').select('id, riot_id');
  const playerMap: Record<string, number | null> = {};
  if (playerRows) {
    for (const p of playerRows) {
      if (p.riot_id) playerMap[p.riot_id.trim().toLowerCase()] = p.id;
    }
  }

  const results: any[] = [];

  for (const entry of maps) {
    const mapIndex = entry.index;
    const isForfeit = !!entry.isForfeit;
    const rawLinkOrUuid = entry.trackerLink ?? entry.trackerUuid ?? '';

    try {
      // Delete old data for this match+map
      await Promise.all([
        supabaseServer.from('match_maps').delete().eq('match_id', matchId).eq('map_index', mapIndex),
        supabaseServer.from('match_stats_map').delete().eq('match_id', matchId).eq('map_index', mapIndex),
        supabaseServer.from('match_rounds').delete().eq('match_id', matchId).eq('map_index', mapIndex),
        supabaseServer.from('match_player_rounds').delete().eq('match_id', matchId).eq('map_index', mapIndex),
      ]);

      if (isForfeit) {
        const winnerId = captainTeamId === team1Id ? team1Id : team2Id;
        const t1r = captainTeamId === team1Id ? 13 : 0;
        const t2r = captainTeamId === team1Id ? 0 : 13;

        await supabaseServer.from('match_maps').insert({
          match_id: matchId, map_index: mapIndex, map_name: '',
          team1_rounds: t1r, team2_rounds: t2r, winner_id: winnerId, is_forfeit: 1,
        });

        results.push({ index: mapIndex, map_name: '', t1_rounds: t1r, t2_rounds: t2r, winner_id: winnerId, is_forfeit: true });
        continue;
      }

      // Resolve UUID from tracker link or direct UUID
      let uuid = rawLinkOrUuid;
      if (uuid.includes('tracker.gg') || uuid.includes('/')) {
        const extracted = extractMatchUuid(uuid);
        if (!extracted) {
          results.push({ index: mapIndex, error: `invalid tracker link: ${uuid}` });
          continue;
        }
        uuid = extracted;
      }

      if (!apiKey) {
        results.push({ index: mapIndex, error: 'HENDRIK_API_KEY not configured' });
        continue;
      }

      const cleanId = uuid.replace(/[^A-Za-z0-9\-]/g, '');
      if (!cleanId) {
        results.push({ index: mapIndex, error: 'invalid match UUID' });
        continue;
      }

      const url = `https://api.henrikdev.xyz/valorant/v4/match/na/${cleanId}`;
      const henrikRes = await fetch(url, { headers: { Authorization: apiKey }, cache: 'no-store' });

      if (!henrikRes.ok) {
        const txt = await henrikRes.text();
        results.push({ index: mapIndex, error: `HenrikDev API returned ${henrikRes.status}: ${txt}` });
        continue;
      }

      const rawData = await henrikRes.json();

      // Parse with website's function
      const parsed = parseHenrikDevJson(rawData, team1Id, team2Id, roster1Rids, roster2Rids, mapIndex);

      const mapName = parsed.map_name || 'Unknown';

      // Compute KAST & extra stats from raw kill/round data
      const data = rawData?.data || {};
      const kills = data?.kills || [];
      const rounds = data?.rounds || [];
      const playersRaw = data?.players || {};
      const allPlayers = Array.isArray(playersRaw) ? playersRaw : (playersRaw?.all_players || []);
      const extraStats = computeExtraStats(kills, rounds, allPlayers);

      const suggestions = parsed.suggestions || {};

      // Determine winner and scores from parse result
      const t1Rounds = parsed.t1_rounds || 0;
      const t2Rounds = parsed.t2_rounds || 0;
      const winnerId = t1Rounds > t2Rounds ? team1Id : t2Rounds > t1Rounds ? team2Id : null;

      // Insert match_maps
      await supabaseServer.from('match_maps').insert({
        match_id: matchId, map_index: mapIndex, map_name: mapName,
        team1_rounds: t1Rounds, team2_rounds: t2Rounds, winner_id: winnerId, is_forfeit: 0,
      });

      // Insert player stats
      const playerStats: any[] = [];
      for (const [rid, sug] of Object.entries(suggestions) as any) {
        if (!rid || rid === '#') continue;
        const pid = playerMap[rid] ?? null;
        const teamId = sug.team_num === 1 ? team1Id : team2Id;
        const extra = extraStats[rid] || {};

        playerStats.push({
          match_id: matchId, map_index: mapIndex, team_id: teamId, player_id: pid,
          is_sub: 0, subbed_for_id: null,
          agent: sug.agent || 'Unknown',
          acs: sug.acs || 0, kills: sug.k || 0, deaths: sug.d || 0, assists: sug.a || 0,
          adr: sug.adr || 0, kast: extra.kast ?? 0, hs_pct: sug.hs_pct || 0,
          fk: sug.fk || 0, fd: sug.fd || 0, mk: sug.mk || 0, dd_delta: sug.dd_delta || 0,
          plants: sug.plants || 0, defuses: sug.defuses || 0,
          survived: extra.survived ?? 0, traded: extra.traded ?? 0, clutches: extra.clutches ?? 0,
          clutches_details: JSON.stringify(sug.clutches_details || { v1: 0, v2: 0, v3: 0, v4: 0, v5: 0 }),
          ability_casts: JSON.stringify(sug.ability_casts || { grenade: 0, ability1: 0, ability2: 0, ultimate: 0 }),
        });
      }

      if (playerStats.length > 0) {
        await supabaseServer.from('match_stats_map').insert(playerStats);
      }

      // Insert rounds
      const parsedRounds = parsed.rounds || [];
      if (parsedRounds.length > 0) {
        const roundRows = parsedRounds.map((r: any) => ({
          match_id: matchId, map_index: mapIndex, round_number: r.round_number,
          winning_team_id: r.winning_team_id, win_type: r.win_type,
          plant: r.plant, defuse: r.defuse,
          economy_t1: r.economy_t1 ?? null, economy_t2: r.economy_t2 ?? null,
        }));
        await supabaseServer.from('match_rounds').insert(roundRows);
      }

      // Insert player rounds
      const parsedPlayerRounds = parsed.playerRounds || [];
      if (parsedPlayerRounds.length > 0) {
        const prRows = parsedPlayerRounds.map((pr: any) => ({
          match_id: matchId, map_index: mapIndex, round_number: pr.round_number,
          player_id: pr.player_id, kills: pr.kills, damage: pr.damage,
          weapon: pr.weapon, spent: pr.spent,
        }));
        await supabaseServer.from('match_player_rounds').insert(prRows);
      }

      results.push({
        index: mapIndex, map_name: mapName,
        t1_rounds: t1Rounds, t2_rounds: t2Rounds,
        winner_id: winnerId, is_forfeit: false,
      });
    } catch (e: any) {
      results.push({ index: mapIndex, error: e?.message || 'unknown error' });
    }
  }

  // Recalculate match totals
  const [{ data: allMaps }, { data: matchInfo }] = await Promise.all([
    supabaseServer.from('match_maps').select('winner_id').eq('match_id', matchId),
    supabaseServer.from('matches').select('team1_id, team2_id, tracker_ids').eq('id', matchId).single(),
  ]);

  if (allMaps && matchInfo) {
    const t1Wins = allMaps.filter((m: any) => m.winner_id === matchInfo.team1_id).length;
    const t2Wins = allMaps.filter((m: any) => m.winner_id === matchInfo.team2_id).length;
    const finalWinner = t1Wins > t2Wins ? matchInfo.team1_id : t2Wins > t1Wins ? matchInfo.team2_id : null;
    const payload: any = {
      score_t1: t1Wins, score_t2: t2Wins,
      maps_played: allMaps.length, winner_id: finalWinner, status: 'completed',
    };

    const tIds: (string | null)[] = matchInfo.tracker_ids || [];
    for (const r of results) {
      if (!r.error) {
        while (tIds.length <= r.index) tIds.push(null);
        tIds[r.index] = null;
      }
    }
    if (tIds.length > 0) payload.tracker_ids = tIds;

    await supabaseServer.from('matches').update(payload).eq('id', matchId);

    if (matchInfo.team1_id && matchInfo.team2_id && finalWinner) {
      const [{ data: matchFull }] = await Promise.all([
        supabaseServer.from('matches').select('match_type, playoff_round, bracket_pos, week').eq('id', matchId).single(),
      ]);
      if (matchFull?.match_type === 'playoff' && finalWinner) {
        const round: number = matchFull.playoff_round || 1;
        const pos: number = matchFull.bracket_pos || 0;
        if (pos) {
          let targetPos = pos;
          let isTeam1 = false;
          if (round >= 2) {
            const siblingPos = pos % 2 === 1 ? pos + 1 : pos - 1;
            targetPos = Math.ceil(Math.min(pos, siblingPos) / 2);
            isTeam1 = pos < siblingPos;
          } else {
            targetPos = pos;
          }
          const { data: nextMatch } = await supabaseServer
            .from('matches')
            .select('*')
            .eq('match_type', 'playoff')
            .eq('playoff_round', round + 1)
            .eq('bracket_pos', targetPos)
            .limit(1);
          if (nextMatch && nextMatch.length > 0) {
            const nm = nextMatch[0];
            const updates: any = {};
            if (isTeam1) updates.team1_id = finalWinner;
            else updates.team2_id = finalWinner;
            await supabaseServer.from('matches').update(updates).eq('id', nm.id);
          } else {
            await supabaseServer.from('matches').insert({
              week: matchFull.week || 0,
              group_name: 'Playoffs',
              team1_id: isTeam1 ? finalWinner : null,
              team2_id: isTeam1 ? null : finalWinner,
              status: 'scheduled', format: 'BO3', maps_played: 0,
              match_type: 'playoff',
              playoff_round: round + 1, bracket_pos: targetPos,
              bracket_label: `R${round + 1} #${targetPos}`,
            });
          }
        }
      }
    }
  }

  const success = results.every((r: any) => !r.error);
  return NextResponse.json({ success, maps: results });
}
