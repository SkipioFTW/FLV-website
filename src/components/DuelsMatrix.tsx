'use client';

import { useEffect, useState } from 'react';
import { getMatchMapDuels, type DuelCount } from '@/lib/data';
import PlayerAvatar from './PlayerAvatar';

type PlayerStat = { player_id: number; player_name: string; team_id: number; agent: string };

interface Props {
    matchId: number;
    mapIndex: number;
    map: { stats: PlayerStat[] };
    team1: { id: number; name: string };
    team2: { id: number; name: string };
}

export default function DuelsMatrix({ matchId, mapIndex, map, team1, team2 }: Props) {
    const [duels, setDuels] = useState<DuelCount[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        setLoading(true);
        getMatchMapDuels(matchId, mapIndex).then(data => {
            setDuels(data);
            setLoading(false);
        });
    }, [matchId, mapIndex]);

    const team1Players = map.stats.filter(s => s.team_id === team1.id);
    const team2Players = map.stats.filter(s => s.team_id === team2.id);

    const countOf = (killerId: number, victimId: number) =>
        duels.find(d => d.killerId === killerId && d.victimId === victimId)?.count ?? 0;

    const rivalries = team1Players.flatMap(a =>
        team2Players.map(b => ({ a, b, total: countOf(a.player_id, b.player_id) + countOf(b.player_id, a.player_id) }))
    ).filter(r => r.total > 0);
    const topRivalry = rivalries.length > 0
        ? rivalries.reduce((best, r) => r.total > best.total ? r : best, rivalries[0])
        : null;

    if (loading) {
        return <div className="glass p-6 border border-white/5 rounded h-64 flex items-center justify-center text-foreground/40">Loading duels...</div>;
    }

    if (duels.length === 0) {
        return (
            <div className="glass p-6 border border-white/5 rounded">
                <h5 className="font-display text-lg font-bold uppercase tracking-wider mb-2">Duels</h5>
                <p className="text-foreground/40 text-sm">No kill data recorded for this map.</p>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {topRivalry && (
                <div className="glass p-5 border border-white/5 rounded flex items-center justify-center gap-6">
                    <div className="text-center">
                        <div className="text-[10px] font-black uppercase tracking-widest text-foreground/40 mb-2">Top Rivalry</div>
                        <div className="flex items-center gap-4">
                            <PlayerAvatar p={topRivalry.a} />
                            <span className="text-foreground/30 font-bold">vs</span>
                            <PlayerAvatar p={topRivalry.b} />
                        </div>
                    </div>
                </div>
            )}

            <div className="glass border border-white/5 rounded overflow-x-auto">
                <table className="w-full text-xs">
                    <thead>
                        <tr>
                            <th className="p-3"></th>
                            {team2Players.map(p => (
                                <th key={p.player_id} className="p-2"><PlayerAvatar p={p} /></th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {team1Players.map(row => (
                            <tr key={row.player_id} className="border-t border-white/5">
                                <td className="p-2"><PlayerAvatar p={row} /></td>
                                {team2Players.map(col => {
                                    const rowKills = countOf(row.player_id, col.player_id);
                                    const colKills = countOf(col.player_id, row.player_id);
                                    return (
                                        <td key={col.player_id} className="p-2 text-center">
                                            <div className="flex items-center justify-center gap-1 font-display font-bold">
                                                <span className={rowKills > colKills ? 'text-val-blue' : rowKills === colKills && rowKills > 0 ? 'text-foreground/60' : 'text-foreground/30'}>{rowKills}</span>
                                                <span className="text-foreground/20">-</span>
                                                <span className={colKills > rowKills ? 'text-val-red' : colKills === rowKills && colKills > 0 ? 'text-foreground/60' : 'text-foreground/30'}>{colKills}</span>
                                            </div>
                                        </td>
                                    );
                                })}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
