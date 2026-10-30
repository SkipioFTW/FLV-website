'use client';

import { useEffect, useState } from 'react';
import {
    getMatchMapPositions, getMatchPlayerDamage, getMatchMapDuels, getRoundAttackTeam,
    type PositionSnapshotRow, type PlayerDamageCount, type DuelCount,
} from '@/lib/data';
import { inferAttackingTeam } from '@/lib/matchSides';
import PlayerAvatar from './PlayerAvatar';

type PlayerStat = {
    player_id: number; player_name: string; team_id: number; agent: string;
    acs: number; kills: number; deaths: number; assists: number; adr: number; kast: number; hs_pct: number;
};

interface Props {
    matchId: number;
    map: { index: number; name: string; stats: PlayerStat[]; rounds: { round_number: number; winning_team_id: number }[] };
    team1: { id: number; name: string };
    team2: { id: number; name: string };
}

function StatTile({ label, value }: { label: string; value: string | number }) {
    return (
        <div className="glass p-3 border border-white/5 rounded text-center">
            <div className="text-[9px] font-black uppercase tracking-widest text-foreground/40 mb-1">{label}</div>
            <div className="font-display text-xl font-black">{value}</div>
        </div>
    );
}

export default function PerformanceTab({ matchId, map, team1, team2 }: Props) {
    const [positions, setPositions] = useState<PositionSnapshotRow[]>([]);
    const [damage, setDamage] = useState<PlayerDamageCount[]>([]);
    const [duels, setDuels] = useState<DuelCount[]>([]);
    const [anchors, setAnchors] = useState<Record<number, number>>({});
    const [loading, setLoading] = useState(true);
    const [selectedId, setSelectedId] = useState<number | null>(map.stats[0]?.player_id ?? null);

    useEffect(() => {
        setLoading(true);
        Promise.all([
            getMatchMapPositions(matchId, map.index),
            getMatchPlayerDamage(matchId, map.index),
            getMatchMapDuels(matchId, map.index),
            getRoundAttackTeam(matchId, map.index),
        ]).then(([pos, dmg, dls, anc]) => {
            setPositions(pos);
            setDamage(dmg);
            setDuels(dls);
            setAnchors(anc);
            setLoading(false);
        });
    }, [matchId, map.index]);

    const team1Players = map.stats.filter(s => s.team_id === team1.id);
    const team2Players = map.stats.filter(s => s.team_id === team2.id);
    const selected = map.stats.find(s => s.player_id === selectedId);

    if (loading) {
        return <div className="glass p-6 border border-white/5 rounded h-64 flex items-center justify-center text-foreground/40">Loading performance...</div>;
    }

    if (!selected) {
        return (
            <div className="glass p-6 border border-white/5 rounded">
                <p className="text-foreground/40 text-sm">No player data for this map.</p>
            </div>
        );
    }

    const opponents = map.stats.filter(s => s.team_id !== selected.team_id);

    const myKillRows = positions.filter(p => p.role === 'killer' && p.player_id === selectedId);
    const myPositionRows = positions.filter(p => p.player_id === selectedId && p.event_type === 'kill');

    // Per-round kill counts
    const killsByRound = new Map<number, number>();
    myKillRows.forEach(r => killsByRound.set(r.round_number, (killsByRound.get(r.round_number) || 0) + 1));

    // Attack/Defense split, from this player's own kill/victim/assist position rows
    const haveSideData = Object.keys(anchors).length > 0;
    const split = { attack: { k: 0, a: 0, d: 0 }, defense: { k: 0, a: 0, d: 0 } };
    if (haveSideData) {
        myPositionRows.forEach(r => {
            const attackingTeam = inferAttackingTeam(r.round_number, anchors, team1.id, team2.id);
            if (!attackingTeam) return;
            const side = attackingTeam === selected.team_id ? 'attack' : 'defense';
            if (r.role === 'killer') split[side].k += 1;
            else if (r.role === 'victim') split[side].d += 1;
            else if (r.role === 'assist') split[side].a += 1;
        });
    }

    // Weapon kill counts
    const weaponCounts = new Map<string, number>();
    myKillRows.forEach(r => {
        const w = r.weapon || 'Unknown';
        weaponCounts.set(w, (weaponCounts.get(w) || 0) + 1);
    });
    const weaponRows = [...weaponCounts.entries()].sort((a, b) => b[1] - a[1]);

    const duelCount = (killerId: number, victimId: number) =>
        duels.find(d => d.killerId === killerId && d.victimId === victimId)?.count ?? 0;
    const damageOf = (attackerId: number, victimId: number) =>
        damage.find(d => d.attackerId === attackerId && d.victimId === victimId);

    const kd = selected.deaths > 0 ? (selected.kills / selected.deaths).toFixed(2) : selected.kills.toFixed(2);

    return (
        <div className="space-y-6">
            {/* Player selector */}
            <div className="flex items-center justify-center gap-8 flex-wrap">
                <div className="flex gap-2">
                    {team1Players.map(p => (
                        <PlayerAvatar key={p.player_id} p={p} selected={p.player_id === selectedId} onClick={() => setSelectedId(p.player_id)} />
                    ))}
                </div>
                <span className="text-foreground/30 font-bold text-sm">VS</span>
                <div className="flex gap-2">
                    {team2Players.map(p => (
                        <PlayerAvatar key={p.player_id} p={p} selected={p.player_id === selectedId} onClick={() => setSelectedId(p.player_id)} />
                    ))}
                </div>
            </div>

            {/* Summary cards */}
            <div className="flex items-center gap-4 glass p-4 border border-white/5 rounded">
                <PlayerAvatar p={selected} size={44} />
                <div className="flex-1">
                    <div className="font-display text-lg font-black uppercase">{selected.player_name}</div>
                    <div className="text-xs text-foreground/40">{selected.agent}</div>
                </div>
            </div>
            <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
                <StatTile label="K/D/A" value={`${selected.kills}/${selected.deaths}/${selected.assists}`} />
                <StatTile label="K/D" value={kd} />
                <StatTile label="ADR" value={Math.round(selected.adr || 0)} />
                <StatTile label="ACS" value={Math.round(selected.acs || 0)} />
                <StatTile label="HS%" value={`${Math.round(selected.hs_pct || 0)}%`} />
                <StatTile label="KAST" value={`${Math.round(selected.kast || 0)}%`} />
            </div>

            {/* Per-round kills */}
            <div className="glass p-4 border border-white/5 rounded">
                <h5 className="text-[10px] font-black uppercase tracking-widest text-foreground/40 mb-3">Kills Per Round</h5>
                <div className="flex gap-1.5 overflow-x-auto pb-1">
                    {map.rounds.map(r => {
                        const kills = killsByRound.get(r.round_number) || 0;
                        const won = r.winning_team_id === selected.team_id;
                        return (
                            <div key={r.round_number} className="flex flex-col items-center gap-1 w-7 shrink-0">
                                <div className={`text-xs font-black ${kills > 0 ? 'text-val-red' : 'text-foreground/20'}`}>{kills || ''}</div>
                                <div className={`w-full h-1 rounded ${won ? 'bg-val-blue' : 'bg-val-red/40'}`} />
                                <div className="text-[9px] text-foreground/30">{r.round_number}</div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Attack/Defense split */}
            <div className="glass p-4 border border-white/5 rounded">
                <h5 className="text-[10px] font-black uppercase tracking-widest text-foreground/40 mb-3">Attack / Defense Split</h5>
                {!haveSideData ? (
                    <p className="text-foreground/40 text-sm">Not enough data to infer sides for this map (no spike plants recorded).</p>
                ) : (
                    <div className="grid grid-cols-2 gap-4">
                        <div className="text-center">
                            <div className="text-[10px] font-bold uppercase text-foreground/40 mb-1">Attack</div>
                            <div className="font-display text-lg font-bold">{split.attack.k} / {split.attack.d} / {split.attack.a}</div>
                        </div>
                        <div className="text-center">
                            <div className="text-[10px] font-bold uppercase text-foreground/40 mb-1">Defense</div>
                            <div className="font-display text-lg font-bold">{split.defense.k} / {split.defense.d} / {split.defense.a}</div>
                        </div>
                    </div>
                )}
            </div>

            <div className="grid md:grid-cols-2 gap-6">
                {/* Per-opponent table */}
                <div className="glass border border-white/5 rounded overflow-hidden">
                    <h5 className="text-[10px] font-black uppercase tracking-widest text-foreground/40 p-4 pb-2">Vs Opponent</h5>
                    <table className="w-full text-xs">
                        <thead>
                            <tr className="text-foreground/40 text-[10px] uppercase">
                                <th className="text-left pl-4 pb-2">Opponent</th>
                                <th className="pb-2">K</th>
                                <th className="pb-2">D</th>
                                <th className="pb-2">Dealt</th>
                                <th className="pb-2 pr-4">Received</th>
                            </tr>
                        </thead>
                        <tbody>
                            {opponents.map(o => {
                                const dealt = damageOf(selected.player_id, o.player_id);
                                const received = damageOf(o.player_id, selected.player_id);
                                return (
                                    <tr key={o.player_id} className="border-t border-white/5">
                                        <td className="py-2 pl-4 font-bold truncate">{o.player_name}</td>
                                        <td className="text-center text-val-blue font-bold">{duelCount(selected.player_id, o.player_id)}</td>
                                        <td className="text-center text-val-red font-bold">{duelCount(o.player_id, selected.player_id)}</td>
                                        <td className="text-center">{dealt?.damage ?? 0}</td>
                                        <td className="text-center pr-4">{received?.damage ?? 0}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>

                {/* Weapon kills */}
                <div className="glass border border-white/5 rounded overflow-hidden">
                    <h5 className="text-[10px] font-black uppercase tracking-widest text-foreground/40 p-4 pb-2">Kills By Weapon</h5>
                    {weaponRows.length === 0 ? (
                        <p className="text-foreground/40 text-sm px-4 pb-4">No kills recorded for this player on this map.</p>
                    ) : (
                        <table className="w-full text-xs">
                            <thead>
                                <tr className="text-foreground/40 text-[10px] uppercase">
                                    <th className="text-left pl-4 pb-2">Weapon</th>
                                    <th className="pb-2 pr-4">Kills</th>
                                </tr>
                            </thead>
                            <tbody>
                                {weaponRows.map(([weapon, count]) => (
                                    <tr key={weapon} className="border-t border-white/5">
                                        <td className="py-2 pl-4 font-bold">{weapon}</td>
                                        <td className="text-center text-val-blue font-bold pr-4">{count}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>
        </div>
    );
}
