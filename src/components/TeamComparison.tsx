'use client';

import { useState, useMemo, useEffect } from 'react';
import { TeamPerformance, getTeamPerformance } from '@/lib/data';
import TeamSearch from './TeamSearch';
import {
    LineChart,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
} from 'recharts';

export default function TeamComparison({ teams }: { teams: { id: number, name: string, tag: string }[] }) {
    const [id1, setId1] = useState<number | null>(null);
    const [id2, setId2] = useState<number | null>(null);
    const [stats1, setStats1] = useState<TeamPerformance | null>(null);
    const [stats2, setStats2] = useState<TeamPerformance | null>(null);
    const [loading, setLoading] = useState(false);
    const [matchType, setMatchType] = useState<'regular' | 'playoff' | undefined>(undefined);

    useEffect(() => {
        if (id1 || id2) {
            setLoading(true);
            Promise.all([
                id1 ? getTeamPerformance(id1, matchType) : Promise.resolve(null),
                id2 ? getTeamPerformance(id2, matchType) : Promise.resolve(null)
            ]).then(([t1, t2]) => {
                if (id1) setStats1(t1);
                if (id2) setStats2(t2);
                setLoading(false);
            });
        }
    }, [id1, id2, matchType]);

    const progressionData = useMemo(() => {
        if (!stats1 || !stats2) return [];
        const maxWeek = Math.max(
            ...stats1.progression.map(p => p.week),
            ...stats2.progression.map(p => p.week),
            0
        );

        const data = [];
        for (let w = 1; w <= maxWeek; w++) {
            const p1 = stats1.progression.find(p => p.week === w);
            const p2 = stats2.progression.find(p => p.week === w);
            data.push({
                week: `W${w}`,
                [stats1.name]: p1?.points || 0,
                [stats2.name]: p2?.points || 0,
            });
        }
        return data;
    }, [stats1, stats2]);

    return (
        <div className="space-y-8">
            <div className="glass p-8 border border-white/5 rounded-xl">
                <div className="flex flex-col md:flex-row gap-8 items-center justify-between mb-8">
                    <div className="w-full max-w-sm">
                        <label className="text-[10px] font-black uppercase tracking-widest text-foreground/40 block mb-2">Team 1</label>
                        <TeamSearch teams={teams} onSelect={setId1} currentId={id1} />
                    </div>
                    <div className="text-xl font-display font-black text-white/10 italic">VS</div>
                    <div className="w-full max-w-sm">
                        <label className="text-[10px] font-black uppercase tracking-widest text-foreground/40 block mb-2">Team 2</label>
                        <TeamSearch teams={teams} onSelect={setId2} currentId={id2} />
                    </div>
                </div>

                <div className="flex justify-center">
                    <div className="flex bg-white/5 p-1 rounded-lg border border-white/10">
                        <button
                            onClick={() => setMatchType(undefined)}
                            className={`px-6 py-2 rounded-md text-xs font-bold uppercase tracking-widest transition-all ${matchType === undefined ? 'bg-val-blue text-white shadow-lg shadow-val-blue/20' : 'text-foreground/40 hover:text-foreground'}`}
                        >
                            All Stats
                        </button>
                        <button
                            onClick={() => setMatchType('regular')}
                            className={`px-6 py-2 rounded-md text-xs font-bold uppercase tracking-widest transition-all ${matchType === 'regular' ? 'bg-val-blue text-white shadow-lg shadow-val-blue/20' : 'text-foreground/40 hover:text-foreground'}`}
                        >
                            Regular Season
                        </button>
                        <button
                            onClick={() => setMatchType('playoff')}
                            className={`px-6 py-2 rounded-md text-xs font-bold uppercase tracking-widest transition-all ${matchType === 'playoff' ? 'bg-val-blue text-white shadow-lg shadow-val-blue/20' : 'text-foreground/40 hover:text-foreground'}`}
                        >
                            Playoffs Only
                        </button>
                    </div>
                </div>
            </div>

            {stats1 && stats2 && (
                <div className="space-y-8 animate-in fade-in zoom-in-95 duration-500">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                        {/* Summary Comparison */}
                        <div className="glass p-8 border border-white/5 rounded-xl">
                            <h3 className="font-display text-xl font-black uppercase tracking-tight mb-8">Season Summary</h3>
                            <div className="space-y-6">
                                {[
                                    { label: 'Pistol Win Rate', val1: `${stats1.summary?.pistolWinRate}%`, val2: `${stats2.summary?.pistolWinRate}%` },
                                    { label: 'Round Win Rate', val1: `${stats1.summary?.roundWinRate}%`, val2: `${stats2.summary?.roundWinRate}%` },
                                    { label: 'Avg Rounds / Map', val1: stats1.summary?.avgRoundsPerMap, val2: stats2.summary?.avgRoundsPerMap },
                                    { label: 'Total Points', val1: stats1.progression.reduce((acc, p) => acc + p.points, 0), val2: stats2.progression.reduce((acc, p) => acc + p.points, 0) },
                                ].map((stat) => (
                                    <div key={stat.label}>
                                        <div className="flex justify-between text-[10px] font-black uppercase tracking-widest text-foreground/40 mb-2">
                                            <span>{stats1.name}</span>
                                            <span>{stat.label}</span>
                                            <span>{stats2.name}</span>
                                        </div>
                                        <div className="flex justify-between font-display text-2xl font-black italic uppercase tracking-tighter">
                                            <span className="text-val-blue">{stat.val1}</span>
                                            <span className="text-val-red">{stat.val2}</span>
                                        </div>
                                        <div className="flex items-center gap-4 mt-2">
                                            <div className="flex-1 h-1 bg-white/5 rounded-full overflow-hidden flex justify-end">
                                                <div
                                                    className="h-full bg-val-blue transition-all duration-1000"
                                                    style={{ width: `${(parseFloat(String(stat.val1)) / (parseFloat(String(stat.val1)) + parseFloat(String(stat.val2)) || 1)) * 100}%` }}
                                                />
                                            </div>
                                            <div className="flex-1 h-1 bg-white/5 rounded-full overflow-hidden">
                                                <div
                                                    className="h-full bg-val-red transition-all duration-1000"
                                                    style={{ width: `${(parseFloat(String(stat.val2)) / (parseFloat(String(stat.val1)) + parseFloat(String(stat.val2)) || 1)) * 100}%` }}
                                                />
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Progression Chart */}
                        <div className="glass p-8 border border-white/5 rounded-xl">
                            <h3 className="font-display text-xl font-black uppercase tracking-tight mb-8">Points Progression</h3>
                            <div className="h-[300px] w-full">
                                <ResponsiveContainer width="100%" height="100%">
                                    <LineChart data={progressionData}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                                        <XAxis
                                            dataKey="week"
                                            axisLine={false}
                                            tickLine={false}
                                            tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 10, fontWeight: 900 }}
                                        />
                                        <YAxis
                                            axisLine={false}
                                            tickLine={false}
                                            tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 10, fontWeight: 900 }}
                                        />
                                        <Tooltip
                                            contentStyle={{ backgroundColor: '#0f1923', border: '1px solid rgba(255,255,255,0.1)' }}
                                            itemStyle={{ fontWeight: 900, textTransform: 'uppercase', fontSize: '10px' }}
                                        />
                                        <Line
                                            type="monotone"
                                            dataKey={stats1.name}
                                            stroke="#3fd1ff"
                                            strokeWidth={3}
                                            dot={{ r: 4, fill: '#3fd1ff' }}
                                            activeDot={{ r: 6 }}
                                        />
                                        <Line
                                            type="monotone"
                                            dataKey={stats2.name}
                                            stroke="#ff4655"
                                            strokeWidth={3}
                                            dot={{ r: 4, fill: '#ff4655' }}
                                            activeDot={{ r: 6 }}
                                        />
                                    </LineChart>
                                </ResponsiveContainer>
                            </div>
                        </div>
                    </div>

                    {/* Roster Comparison */}
                    <div className="glass p-8 border border-white/5 rounded-xl">
                        <h3 className="font-display text-xl font-black uppercase tracking-tight mb-8 text-center">Roster Comparison</h3>
                        <div className="grid md:grid-cols-2 gap-8">
                            {[stats1, stats2].map((team, idx) => (
                                <div key={team.id} className={`space-y-4 ${idx === 0 ? 'text-right' : 'text-left'}`}>
                                    <h4 className={`text-sm font-black uppercase tracking-[0.2em] mb-4 ${idx === 0 ? 'text-val-blue' : 'text-val-red'}`}>
                                        {team.name}
                                    </h4>
                                    <div className="space-y-2">
                                        {team.playerStats.slice(0, 5).map((player) => (
                                            <div key={player.name} className={`flex ${idx === 0 ? 'flex-row-reverse' : 'flex-row'} items-center gap-4 group`}>
                                                <div className={`w-10 h-10 rounded border ${idx === 0 ? 'border-val-blue/20 bg-val-blue/5' : 'border-val-red/20 bg-val-red/5'} flex items-center justify-center font-display font-black`}>
                                                    {player.name[0]}
                                                </div>
                                                <div>
                                                    <div className="text-sm font-bold group-hover:text-white transition-colors">{player.name}</div>
                                                    <div className="text-[10px] font-black uppercase tracking-widest text-foreground/40">
                                                        ACS: {player.avgAcs} • KD: {player.kd}
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
