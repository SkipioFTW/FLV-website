'use client';

import { useEffect, useMemo, useState } from 'react';
import { getMatchMapPositions, type PositionSnapshotRow } from '@/lib/data';
import { VALORANT_MAP_CALIBRATION, projectToMinimap } from '@/lib/valorantMaps';
import { VALORANT_AGENT_PORTRAITS, viewDirection } from '@/lib/valorantAgents';
import RoundStrip from './RoundStrip';

interface Props {
    matchId: number;
    mapIndex: number;
    mapName: string;
    team1Id: number;
    roster: Record<number, { name: string; team_id: number; agent: string }>;
    rounds: { round_number: number; winning_team_id: number; win_type: string }[];
}

type Snapshot = {
    round_number: number;
    event_type: string;
    event_seq: number;
    time_in_round_ms: number | null;
    players: { player_id: number; x: number; y: number; role: string; view_radians: number | null; weapon: string | null }[];
};

// Stylized horizontal FOV for the facing cone -- Valorant's real FOV is ~103deg,
// this just needs to read clearly on a small minimap, not be exact.
const FOV_RADIANS = (95 * Math.PI) / 180;
const CONE_LENGTH_PCT = 13;

const ROLE_LABEL: Record<string, string> = {
    killer: 'Killer', victim: 'Victim', assist: 'Assist', planter: 'Planter', defuser: 'Defuser',
};

function formatTime(ms: number | null) {
    if (ms == null) return null;
    const totalSec = Math.round(ms / 1000);
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function RoundReplay({ matchId, mapIndex, mapName, team1Id, roster, rounds }: Props) {
    const [rows, setRows] = useState<PositionSnapshotRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedRound, setSelectedRound] = useState<number | null>(null);
    const [snapshotIdx, setSnapshotIdx] = useState(0);

    useEffect(() => {
        setLoading(true);
        setSelectedRound(null);
        setSnapshotIdx(0);
        getMatchMapPositions(matchId, mapIndex).then(data => {
            setRows(data);
            setLoading(false);
        });
    }, [matchId, mapIndex]);

    // Group rows into snapshots per round. Kills are ordered by their real
    // in-round timestamp; plant/defuse carry no timestamp from the source data,
    // so they're pinned after all kills in the round rather than guessed at --
    // this is an honest approximation, not a precise chronological interleave.
    const roundsMap = useMemo(() => {
        const byRound = new Map<number, Map<string, Snapshot>>();
        rows.forEach(r => {
            if (!byRound.has(r.round_number)) byRound.set(r.round_number, new Map());
            const snaps = byRound.get(r.round_number)!;
            const key = `${r.event_type}-${r.event_seq}`;
            if (!snaps.has(key)) {
                snaps.set(key, { round_number: r.round_number, event_type: r.event_type, event_seq: r.event_seq, time_in_round_ms: r.time_in_round_ms, players: [] });
            }
            snaps.get(key)!.players.push({ player_id: r.player_id, x: r.x, y: r.y, role: r.role, view_radians: r.view_radians, weapon: r.weapon });
        });
        const result = new Map<number, Snapshot[]>();
        byRound.forEach((snaps, roundNum) => {
            const list = [...snaps.values()].sort((a, b) => {
                const order = (s: Snapshot) => s.event_type === 'plant' ? 1_000_000 : s.event_type === 'defuse' ? 2_000_000 : (s.time_in_round_ms ?? s.event_seq);
                return order(a) - order(b);
            });
            result.set(roundNum, list);
        });
        return result;
    }, [rows]);

    const availableRounds = useMemo(() => [...roundsMap.keys()].sort((a, b) => a - b), [roundsMap]);
    const effectiveRound = (selectedRound !== null && availableRounds.includes(selectedRound)) ? selectedRound : (availableRounds[0] ?? null);

    const snapshots = useMemo(
        () => (effectiveRound !== null ? roundsMap.get(effectiveRound) : null) || [],
        [effectiveRound, roundsMap]
    );
    const current = snapshots[snapshotIdx];
    const cal = VALORANT_MAP_CALIBRATION[mapName];

    const nameOf = (playerId: number) => roster[playerId]?.name || 'Unknown';

    const labelFor = (snap: Snapshot, snaps: Snapshot[]) => {
        if (snap.event_type === 'plant') return 'Spike Planted';
        if (snap.event_type === 'defuse') return 'Spike Defused';
        const kills = snaps.filter(s => s.event_type === 'kill');
        const num = kills.findIndex(s => s === snap) + 1;
        const time = formatTime(snap.time_in_round_ms);
        return `Kill ${num} of ${kills.length}${time ? ` · ${time} into round` : ''}`;
    };

    const detailFor = (snap: Snapshot) => {
        if (snap.event_type === 'plant') {
            const planter = snap.players.find(p => p.role === 'planter');
            return planter ? `${nameOf(planter.player_id)} planted the Spike` : 'Spike planted';
        }
        if (snap.event_type === 'defuse') {
            const defuser = snap.players.find(p => p.role === 'defuser');
            return defuser ? `${nameOf(defuser.player_id)} defused the Spike` : 'Spike defused';
        }
        const killer = snap.players.find(p => p.role === 'killer');
        const victim = snap.players.find(p => p.role === 'victim');
        const assists = snap.players.filter(p => p.role === 'assist');
        if (!killer || !victim) return '';
        let text = `${nameOf(killer.player_id)} eliminated ${nameOf(victim.player_id)}`;
        if (killer.weapon) text += ` (${killer.weapon})`;
        if (assists.length > 0) {
            text += ` — assist: ${assists.map(a => nameOf(a.player_id)).join(', ')}`;
        }
        return text;
    };

    const label = current ? labelFor(current, snapshots) : '';
    const detail = current ? detailFor(current) : '';

    if (loading) {
        return <div className="glass p-6 border border-white/5 rounded h-64 flex items-center justify-center text-foreground/40">Loading replay...</div>;
    }

    if (!cal) {
        return (
            <div className="glass p-6 border border-white/5 rounded">
                <h5 className="font-display text-lg font-bold uppercase tracking-wider mb-2">Round Replay</h5>
                <p className="text-foreground/40 text-sm">No minimap available for {mapName}.</p>
            </div>
        );
    }

    if (availableRounds.length === 0) {
        return (
            <div className="glass p-6 border border-white/5 rounded">
                <h5 className="font-display text-lg font-bold uppercase tracking-wider mb-2">Round Replay</h5>
                <p className="text-foreground/40 text-sm">No position data recorded for this map.</p>
            </div>
        );
    }

    const roundTiles = rounds.filter(r => availableRounds.includes(r.round_number));

    return (
        <div className="glass p-6 border border-white/5 rounded">
            <div className="flex items-center justify-between gap-4 mb-2">
                <h5 className="font-display text-lg font-bold uppercase tracking-wider">Round {effectiveRound}</h5>
            </div>
            <RoundStrip
                rounds={roundTiles}
                team1Id={team1Id}
                selected={effectiveRound}
                onSelect={r => { setSelectedRound(r); setSnapshotIdx(0); }}
            />

            <div className="grid lg:grid-cols-2 gap-6 mt-4">
                {/* Event Log */}
                <div className="border border-white/10 rounded-lg overflow-hidden flex flex-col max-h-[480px]">
                    <div className="px-4 py-2 bg-white/5 text-[10px] font-black uppercase tracking-widest text-foreground/40">Event Log</div>
                    <div className="overflow-y-auto divide-y divide-white/5">
                        {snapshots.map((snap, i) => {
                            const actor = snap.players.find(p => p.role === 'killer' || p.role === 'planter' || p.role === 'defuser');
                            const agent = actor ? roster[actor.player_id]?.agent : undefined;
                            const portrait = agent ? VALORANT_AGENT_PORTRAITS[agent] : undefined;
                            const isTeam1 = actor ? roster[actor.player_id]?.team_id === team1Id : false;
                            return (
                                <button
                                    key={i}
                                    onClick={() => setSnapshotIdx(i)}
                                    className={`w-full flex items-center gap-3 px-4 py-3 text-left text-xs transition-colors ${i === snapshotIdx ? 'bg-white/10' : 'hover:bg-white/5'}`}
                                >
                                    {portrait ? (
                                        <img src={portrait} alt={agent} className="w-7 h-7 rounded-full object-cover shrink-0" style={{ border: `1.5px solid ${isTeam1 ? '#0ea5e9' : '#ef4444'}` }} />
                                    ) : (
                                        <div className="w-7 h-7 rounded-full bg-white/10 shrink-0" />
                                    )}
                                    <div className="min-w-0 flex-1">
                                        <div className="font-bold truncate">{detailFor(snap) || labelFor(snap, snapshots)}</div>
                                        <div className="text-foreground/40">{formatTime(snap.time_in_round_ms) || labelFor(snap, snapshots)}</div>
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                </div>

            <div>
            <div className="relative w-full max-w-xl mx-auto aspect-square rounded-lg overflow-hidden border border-white/10 bg-black/40">
                <img src={cal.displayIcon} alt={mapName} className="absolute inset-0 w-full h-full object-cover" />

                {/* Facing cone -- only for the player whose action this snapshot is about */}
                <svg className="absolute inset-0 w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
                    {current?.players.filter(p => p.role !== 'other' && p.role !== 'assist').map((p, i) => {
                        const pt = projectToMinimap(p.x, p.y, mapName);
                        if (!pt || p.view_radians == null) return null;
                        const dir = viewDirection(p.view_radians);
                        const rotate = (v: { x: number; y: number }, ang: number) => ({
                            x: v.x * Math.cos(ang) - v.y * Math.sin(ang),
                            y: v.x * Math.sin(ang) + v.y * Math.cos(ang),
                        });
                        const left = rotate(dir, -FOV_RADIANS / 2);
                        const right = rotate(dir, FOV_RADIANS / 2);
                        const cx = pt.left * 100, cy = pt.top * 100;
                        const points = [
                            `${cx},${cy}`,
                            `${cx + left.x * CONE_LENGTH_PCT},${cy + left.y * CONE_LENGTH_PCT}`,
                            `${cx + right.x * CONE_LENGTH_PCT},${cy + right.y * CONE_LENGTH_PCT}`,
                        ].join(' ');
                        return (
                            <polygon
                                key={i}
                                points={points}
                                fill="white"
                                fillOpacity={0.22}
                                stroke="white"
                                strokeOpacity={0.55}
                                strokeWidth={0.4}
                                strokeLinejoin="round"
                            />
                        );
                    })}
                </svg>

                {current?.players.map((p, i) => {
                    const pt = projectToMinimap(p.x, p.y, mapName);
                    if (!pt) return null;
                    const isTeam1 = roster[p.player_id]?.team_id === team1Id;
                    const isActor = p.role !== 'other' && p.role !== 'assist';
                    const color = isTeam1 ? '#0ea5e9' : '#ef4444';
                    const agent = roster[p.player_id]?.agent;
                    const portrait = agent ? VALORANT_AGENT_PORTRAITS[agent] : undefined;
                    const size = isActor ? 34 : 26;
                    return (
                        <div
                            key={i}
                            className="absolute -translate-x-1/2 -translate-y-1/2"
                            style={{ left: `${pt.left * 100}%`, top: `${pt.top * 100}%` }}
                            title={`${roster[p.player_id]?.name || 'Unknown'}${ROLE_LABEL[p.role] ? ` (${ROLE_LABEL[p.role]})` : ''}`}
                        >
                            {portrait ? (
                                <img
                                    src={portrait}
                                    alt={agent}
                                    className="rounded-full object-cover"
                                    style={{
                                        width: size, height: size,
                                        border: `2px solid ${color}`,
                                        boxShadow: isActor ? `0 0 10px ${color}` : undefined,
                                    }}
                                />
                            ) : (
                                <div
                                    className="rounded-full"
                                    style={{ width: size, height: size, backgroundColor: color, border: '2px solid white' }}
                                />
                            )}
                        </div>
                    );
                })}
            </div>

            {detail && (
                <div className="text-center mt-4 font-display text-base font-bold uppercase tracking-wide">
                    {detail}
                </div>
            )}

            <div className="flex items-center justify-between gap-4 mt-3">
                <button
                    disabled={snapshotIdx === 0}
                    onClick={() => setSnapshotIdx(i => Math.max(0, i - 1))}
                    className="px-4 py-2 bg-white/5 border border-white/10 rounded text-xs font-black uppercase tracking-widest disabled:opacity-30 hover:bg-white/10 transition-colors"
                >
                    ← Prev
                </button>
                <div className="text-xs font-bold uppercase tracking-wider text-foreground/50">{label}</div>
                <button
                    disabled={snapshotIdx >= snapshots.length - 1}
                    onClick={() => setSnapshotIdx(i => Math.min(snapshots.length - 1, i + 1))}
                    className="px-4 py-2 bg-white/5 border border-white/10 rounded text-xs font-black uppercase tracking-widest disabled:opacity-30 hover:bg-white/10 transition-colors"
                >
                    Next →
                </button>
            </div>
            </div>
            </div>
        </div>
    );
}
