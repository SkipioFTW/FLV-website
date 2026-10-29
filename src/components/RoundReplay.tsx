'use client';

import { useEffect, useMemo, useState } from 'react';
import { getMatchMapPositions, type PositionSnapshotRow } from '@/lib/data';
import { VALORANT_MAP_CALIBRATION, projectToMinimap } from '@/lib/valorantMaps';

interface Props {
    matchId: number;
    mapIndex: number;
    mapName: string;
    team1Id: number;
    roster: Record<number, { name: string; team_id: number }>;
}

type Snapshot = {
    round_number: number;
    event_type: string;
    event_seq: number;
    time_in_round_ms: number | null;
    players: { player_id: number; x: number; y: number; role: string }[];
};

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

export default function RoundReplay({ matchId, mapIndex, mapName, team1Id, roster }: Props) {
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
            snaps.get(key)!.players.push({ player_id: r.player_id, x: r.x, y: r.y, role: r.role });
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

    const label = useMemo(() => {
        if (!current) return '';
        if (current.event_type === 'plant') return 'Spike Planted';
        if (current.event_type === 'defuse') return 'Spike Defused';
        const kills = snapshots.filter(s => s.event_type === 'kill');
        const num = kills.findIndex(s => s === current) + 1;
        const time = formatTime(current.time_in_round_ms);
        return `Kill ${num} of ${kills.length}${time ? ` · ${time} into round` : ''}`;
    }, [current, snapshots]);

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

    return (
        <div className="glass p-6 border border-white/5 rounded">
            <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
                <h5 className="font-display text-lg font-bold uppercase tracking-wider">Round Replay</h5>
                <select
                    value={effectiveRound ?? ''}
                    onChange={e => { setSelectedRound(parseInt(e.target.value)); setSnapshotIdx(0); }}
                    className="bg-white/5 border border-white/10 rounded-md px-3 py-2 text-sm font-bold"
                >
                    {availableRounds.map(r => <option key={r} value={r}>Round {r}</option>)}
                </select>
            </div>

            <div className="relative w-full max-w-xl mx-auto aspect-square rounded-lg overflow-hidden border border-white/10 bg-black/40">
                <img src={cal.displayIcon} alt={mapName} className="absolute inset-0 w-full h-full object-cover" />
                {current?.players.map((p, i) => {
                    const pt = projectToMinimap(p.x, p.y, mapName);
                    if (!pt) return null;
                    const isTeam1 = roster[p.player_id]?.team_id === team1Id;
                    const isActor = p.role !== 'other' && p.role !== 'assist';
                    const color = isTeam1 ? '#0ea5e9' : '#ef4444';
                    return (
                        <div
                            key={i}
                            className="absolute -translate-x-1/2 -translate-y-1/2 flex items-center justify-center"
                            style={{ left: `${pt.left * 100}%`, top: `${pt.top * 100}%` }}
                            title={`${roster[p.player_id]?.name || 'Unknown'}${ROLE_LABEL[p.role] ? ` (${ROLE_LABEL[p.role]})` : ''}`}
                        >
                            <div
                                className="rounded-full"
                                style={{
                                    width: isActor ? 14 : 9,
                                    height: isActor ? 14 : 9,
                                    backgroundColor: color,
                                    border: isActor ? '2px solid white' : '1px solid rgba(255,255,255,0.4)',
                                    boxShadow: isActor ? `0 0 8px ${color}` : undefined,
                                }}
                            />
                        </div>
                    );
                })}
            </div>

            <div className="flex items-center justify-between gap-4 mt-4">
                <button
                    disabled={snapshotIdx === 0}
                    onClick={() => setSnapshotIdx(i => Math.max(0, i - 1))}
                    className="px-4 py-2 bg-white/5 border border-white/10 rounded text-xs font-black uppercase tracking-widest disabled:opacity-30 hover:bg-white/10 transition-colors"
                >
                    ← Prev
                </button>
                <div className="text-sm font-bold uppercase tracking-wider text-foreground/80">{label}</div>
                <button
                    disabled={snapshotIdx >= snapshots.length - 1}
                    onClick={() => setSnapshotIdx(i => Math.min(snapshots.length - 1, i + 1))}
                    className="px-4 py-2 bg-white/5 border border-white/10 rounded text-xs font-black uppercase tracking-widest disabled:opacity-30 hover:bg-white/10 transition-colors"
                >
                    Next →
                </button>
            </div>
        </div>
    );
}
