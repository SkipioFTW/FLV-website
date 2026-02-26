'use client';

import { useState, useMemo } from 'react';
import { StandingsRow } from '@/lib/data';

interface Match {
    id: number;
    team1_id: number;
    team2_id: number;
    week: number;
    group_name: string;
}

interface Props {
    initialStandings: StandingsRow[];
    remainingMatches: Match[];
}

export default function ScenarioGenerator({ initialStandings, remainingMatches }: Props) {
    const [picks, setPicks] = useState<Record<number, number>>({}); // matchId -> winnerId

    const simulatedStandings = useMemo(() => {
        const standings = new Map<number, StandingsRow>(initialStandings.map(s => [s.id, { ...s }]));

        remainingMatches.forEach(m => {
            const winnerId = picks[m.id];
            const t1 = standings.get(m.team1_id);
            const t2 = standings.get(m.team2_id);
            if (!t1 || !t2) return;

            t1.Played += 1;
            t2.Played += 1;

            if (winnerId === m.team1_id) {
                t1.Wins += 1;
                t1.Points += 15;
                t2.Losses += 1;
                t2.Points += 8; // Assumed points for loss
            } else if (winnerId === m.team2_id) {
                t2.Wins += 1;
                t2.Points += 15;
                t1.Losses += 1;
                t1.Points += 8;
            }
            // If no winner picked, we don't update wins/losses but we don't update played either?
            // Actually, let's only update if a winner is picked.
            else {
                t1.Played -= 1;
                t2.Played -= 1;
            }
        });

        // Group and sort
        const grouped = new Map<string, StandingsRow[]>();
        standings.forEach(s => {
            const arr = grouped.get(s.group_name) || [];
            arr.push(s);
            grouped.set(s.group_name, arr);
        });

        grouped.forEach(teams => {
            teams.sort((a, b) => b.Points - a.Points || b.PD - a.PD);
        });

        return grouped;
    }, [initialStandings, remainingMatches, picks]);

    return (
        <div className="space-y-8">
            <div className="grid lg:grid-cols-2 gap-8">
                {/* Match Picks */}
                <div className="glass p-8 border border-white/5 rounded-xl">
                    <h3 className="font-display text-xl font-black uppercase tracking-tight mb-6 text-val-red">Remaining Matches</h3>
                    <div className="space-y-4 max-h-[600px] overflow-y-auto pr-4 custom-scrollbar">
                        {remainingMatches.map((m) => {
                            const t1Name = initialStandings.find(s => s.id === m.team1_id)?.name || 'TBD';
                            const t2Name = initialStandings.find(s => s.id === m.team2_id)?.name || 'TBD';
                            return (
                                <div key={m.id} className="bg-white/5 p-4 rounded border border-white/5 flex items-center justify-between gap-4">
                                    <div className="text-[10px] font-black uppercase tracking-widest text-foreground/40 w-12">W{m.week}</div>
                                    <div className="flex-1 flex items-center justify-center gap-4">
                                        <button
                                            onClick={() => setPicks(prev => ({ ...prev, [m.id]: m.team1_id }))}
                                            className={`flex-1 p-2 rounded text-xs font-bold uppercase tracking-widest transition-all ${picks[m.id] === m.team1_id ? 'bg-val-blue text-white shadow-lg shadow-val-blue/20' : 'bg-white/5 text-foreground/60 hover:text-foreground'}`}
                                        >
                                            {t1Name}
                                        </button>
                                        <span className="text-[10px] font-black text-foreground/20 italic">VS</span>
                                        <button
                                            onClick={() => setPicks(prev => ({ ...prev, [m.id]: m.team2_id }))}
                                            className={`flex-1 p-2 rounded text-xs font-bold uppercase tracking-widest transition-all ${picks[m.id] === m.team2_id ? 'bg-val-red text-white shadow-lg shadow-val-red/20' : 'bg-white/5 text-foreground/60 hover:text-foreground'}`}
                                        >
                                            {t2Name}
                                        </button>
                                    </div>
                                    <button
                                        onClick={() => setPicks(prev => {
                                            const newPicks = { ...prev };
                                            delete newPicks[m.id];
                                            return newPicks;
                                        })}
                                        className="text-xs text-foreground/20 hover:text-val-red transition-colors font-black"
                                    >
                                        RESET
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Simulated Standings */}
                <div className="space-y-8">
                    {Array.from(simulatedStandings.entries()).map(([groupName, teams]) => (
                        <div key={groupName} className="glass border border-white/5 rounded-xl overflow-hidden">
                            <div className="bg-white/5 px-6 py-4 border-b border-white/10">
                                <h3 className="font-display text-lg font-black uppercase tracking-tight text-val-blue italic">Simulated {groupName}</h3>
                            </div>
                            <div className="p-4">
                                <table className="w-full">
                                    <thead>
                                        <tr className="text-[10px] font-black uppercase tracking-widest text-foreground/40 text-left border-b border-white/5">
                                            <th className="pb-2">#</th>
                                            <th className="pb-2">Team</th>
                                            <th className="pb-2 text-center">Pts</th>
                                            <th className="pb-2 text-center">W-L</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {teams.map((t, idx) => (
                                            <tr key={t.id} className={`text-sm border-b border-white/5 last:border-0 ${idx < 6 ? 'bg-val-blue/5' : ''}`}>
                                                <td className="py-3 font-display font-bold text-foreground/40">{idx + 1}</td>
                                                <td className="py-3 font-bold">{t.name}</td>
                                                <td className="py-3 text-center font-display font-black text-val-red">{t.Points}</td>
                                                <td className="py-3 text-center text-xs font-medium text-foreground/60">{t.Wins}-{t.Losses}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
