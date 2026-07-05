import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { parseTrackerJson, parseHenrikDevJson } from '@/lib/data';

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

type PlayerLite = { id: number; name: string; riot_id: string | null; default_team_id: number | null };

const AGENTS = [
  'Jett', 'Viper', 'Sage', 'Sova', 'Killjoy', 'Cypher', 'Omen', 'Brimstone',
  'Raze', 'Reyna', 'Skye', 'Astra', 'Yoru', 'Neon', 'Harbor', 'Fade', 'Iso',
  'Clove', 'KAY/O', 'Breach', 'Chamber', 'Deadlock', 'Gekko', 'Phoenix',
  'Waylay', 'Tejo', 'Vyse'
];

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'bad request' }, { status: 400 });

  const {
    team1_id, team2_id, mapIndex = 0,
    allPlayers, source, trackerUrl, json: jsonText,
    useApi, apiRegion,
  } = body as {
    team1_id: number; team2_id: number; mapIndex: number;
    allPlayers: PlayerLite[];
    source: 'url' | 'json';
    trackerUrl?: string; json?: string;
    useApi?: boolean; apiRegion?: string;
  };

  if (!team1_id || !team2_id || !Array.isArray(allPlayers)) {
    return NextResponse.json({ error: 'Missing team1_id, team2_id, or allPlayers' }, { status: 400 });
  }

  let json: any;
  try {
    if (source === 'json') {
      if (!jsonText) return NextResponse.json({ error: 'Missing json' }, { status: 400 });
      json = JSON.parse(jsonText);
    } else if (source === 'url') {
      if (!trackerUrl) return NextResponse.json({ error: 'Missing trackerUrl' }, { status: 400 });
      const cleaned = trackerUrl.includes('tracker.gg')
        ? trackerUrl.match(/match\/([A-Za-z0-9\-]+)/)?.[1] || trackerUrl
        : trackerUrl.replace(/[^A-Za-z0-9\-]/g, '');

      if (useApi) {
        const apiKey = process.env.HENDRIK_API_KEY;
        if (!apiKey) return NextResponse.json({ error: 'HenrikDev API key not configured' }, { status: 500 });
        const validRegions = ['na', 'eu', 'ap', 'kr', 'latam', 'br'];
        const region = validRegions.includes(apiRegion || '') ? apiRegion : 'na';
        const r = await fetch(`https://api.henrikdev.xyz/valorant/v4/match/${region}/${cleaned}`, {
          headers: { Authorization: apiKey },
          cache: 'no-store',
        });
        if (!r.ok) {
          return NextResponse.json({ error: `HenrikDev API returned ${r.status}: ${await r.text()}` }, { status: r.status });
        }
        json = await r.json();
      } else {
        const resolveUrl = new URL('/api/github/matches/resolve', req.url);
        resolveUrl.searchParams.set('mid', cleaned);
        const r = await fetch(resolveUrl.toString(), { cache: 'no-store' });
        if (!r.ok) {
          return NextResponse.json({ error: `Failed to resolve match: ${await r.text()}` }, { status: r.status });
        }
        json = await r.json();
      }
    } else {
      return NextResponse.json({ error: 'Invalid source' }, { status: 400 });
    }
  } catch (e: any) {
    return NextResponse.json({ error: `Failed to load match data: ${e.message}` }, { status: 400 });
  }

  const roster1 = allPlayers.filter(p => p.default_team_id === team1_id);
  const roster2 = allPlayers.filter(p => p.default_team_id === team2_id);
  const roster1Rids = roster1.map(p => String(p.riot_id || '').trim().toLowerCase()).filter(Boolean);
  const roster2Rids = roster2.map(p => String(p.riot_id || '').trim().toLowerCase()).filter(Boolean);

  let out: ReturnType<typeof parseTrackerJson>;
  try {
    out = useApi
      ? parseHenrikDevJson(json, team1_id, team2_id, roster1Rids, roster2Rids, mapIndex)
      : parseTrackerJson(json, team1_id, team2_id, roster1Rids, roster2Rids, mapIndex);
  } catch (e: any) {
    return NextResponse.json({ error: `Failed to parse match data: ${e.message}` }, { status: 400 });
  }

  let suggestedFormat: 'BO1' | 'BO3' | 'BO5' | null = null;
  const mapsArr = json?.maps || json?.data?.maps || [];
  if (Array.isArray(mapsArr)) {
    suggestedFormat = mapsArr.length <= 1 ? 'BO1' : mapsArr.length <= 3 ? 'BO3' : 'BO5';
  }

  const labToId = new Map(allPlayers.map(p => [String(p.riot_id || '').trim().toLowerCase(), p.id]));
  const riotToLabel = new Map(allPlayers.map(p => [String(p.riot_id || '').trim().toLowerCase(), `${p.name} (${p.riot_id || ''})`]));

  const resolvedPlayerRounds = (out.playerRounds || []).map((pr: any) => ({
    ...pr,
    player_id: labToId.get(pr.rid),
  })).filter((pr: any) => pr.player_id);

  const processTeam = (teamNum: 1 | 2, roster: PlayerLite[]) => {
    const teamSugRids = Object.keys(out.suggestions).filter(k => out.suggestions[k].team_num === teamNum);
    const rosterLabels = roster.map(p => `${p.name} (${p.riot_id || ''})`);
    const rosterMap = new Map(roster.map(p => [`${p.name} (${p.riot_id || ''})`, p.id]));
    const jsonRosterMatches: any[] = [];
    const jsonSubs: any[] = [];

    teamSugRids.forEach(rid => {
      const s = out.suggestions[rid];
      const label = riotToLabel.get(rid);
      if (label && rosterLabels.includes(label)) {
        jsonRosterMatches.push({ rid, label, s });
      } else {
        jsonSubs.push({ rid, label, s });
      }
    });

    const rows: any[] = [];
    const usedRoster = new Set(jsonRosterMatches.map(m => m.label));
    const missingRoster = rosterLabels.filter(l => !usedRoster.has(l));

    const pushRow = (m: any, isSub: boolean, subForLabel?: string) => {
      rows.push({
        rid: m.rid,
        player_id: labToId.get(m.rid) ?? null,
        is_sub: isSub,
        subbed_for_id: isSub ? (rosterMap.get(subForLabel || '') ?? null) : (labToId.get(m.rid) ?? null),
        agent: m.s.agent,
        acs: Math.round(m.s.acs ?? 0),
        kills: m.s.k ?? 0,
        deaths: m.s.d ?? 0,
        assists: m.s.a ?? 0,
        adr: m.s.adr ?? null,
        kast: m.s.kast ?? null,
        hs_pct: m.s.hs_pct ?? null,
        fk: m.s.fk ?? null,
        fd: m.s.fd ?? null,
        mk: m.s.mk ?? null,
        dd_delta: m.s.dd_delta ?? null,
        plants: m.s.plants ?? null,
        defuses: m.s.defuses ?? null,
        survived: m.s.survived ?? null,
        traded: m.s.traded ?? null,
        clutches: m.s.clutches ?? null,
        clutches_details: m.s.clutches_details ?? null,
        ability_casts: m.s.ability_casts ?? null,
      });
    };

    jsonRosterMatches.forEach(m => pushRow(m, false));
    jsonSubs.forEach(m => {
      if (rows.length >= 5) return;
      const subForLabel = missingRoster.shift() || (rosterLabels[0] || '');
      pushRow(m, true, subForLabel);
    });

    while (rows.length < 5) {
      const label = missingRoster.shift() || (rosterLabels[0] || '');
      const pid = rosterMap.get(label) ?? null;
      rows.push({
        rid: null,
        player_id: pid,
        is_sub: false,
        is_filler: true,
        subbed_for_id: pid,
        agent: AGENTS[0],
        acs: 0, kills: 0, deaths: 0, assists: 0,
        adr: null, kast: null, hs_pct: null,
        fk: null, fd: null, mk: null, dd_delta: null, plants: null,
        defuses: null, survived: null, traded: null, clutches: null,
        clutches_details: null, ability_casts: null,
      });
    }
    // Riot IDs present in the match JSON but with no matching player in the DB
    const unmatched = teamSugRids.filter(rid => !labToId.has(rid));
    return { rows: rows.slice(0, 5), unmatched };
  };

  const team1 = processTeam(1, roster1);
  const team2 = processTeam(2, roster2);

  return NextResponse.json({
    map_name: out.map_name,
    t1_rounds: Math.round(out.t1_rounds),
    t2_rounds: Math.round(out.t2_rounds),
    suggestedFormat,
    team1Rows: team1.rows,
    team2Rows: team2.rows,
    unmatched: { team1: team1.unmatched, team2: team2.unmatched },
    rounds: out.rounds || [],
    playerRounds: resolvedPlayerRounds,
  });
}
