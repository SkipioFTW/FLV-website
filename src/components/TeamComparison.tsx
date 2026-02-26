'use client';

import { useState, useMemo } from 'react';
import { TeamPerformance } from '@/lib/data';
import {
    LineChart,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
} from 'recharts';

export default function TeamComparison({ teams }: { teams: { id: number, name: string }[] }) {
    const [id1, setId1] = useState<number | null>(null);
    const [id2, setId2] = useState<number | null>(null);
    const [stats1, setStats1] = useState<TeamPerformance | null>(null);
    const [stats2, setStats2] = useState<TeamPerformance | null>(null);
    const [loading, setLoading] = useState(false);

    const handleCompare = async () => {
        if (!id1 || !id2) return;
        setLoading(true);
        try {
            const { getTeamPerformance } = await import('@/lib/data');
            const [t1, t2] = await Promise.all([
                getTeamPerformance(id1),
                getTeamPerformance(id2)
            ]);
            setStats1(t1);
            setStats2(t2);
        } finally {
            setLoading(false);
        }
    };

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
                <div className="grid md:grid-cols-3 gap-6 items-end">
                    <div>
                        <label className="text-[10px] font-black uppercase tracking-widest text-foreground/40 block mb-2">Team 1</label>
                        <select
                            value={id1 || ''}
                            onChange={(e) => setId1(Number(e.target.value))}
                            className="w-full bg-white/5 border border-white/10 rounded p-3 text-sm"
                        >
                            <option value="">Select team</option>
                            {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="text-[10px] font-black uppercase tracking-widest text-foreground/40 block mb-2">Team 2</label>
                        <select
                            value={id2 || ''}
                            onChange={(e) => setId2(Number(e.target.value))}
                            className="w-full bg-white/5 border border-white/10 rounded p-3 text-sm"
                        >
                            <option value="">Select team</option>
                            {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                        </select>
                    </div>
                    <button
                        onClick={handleCompare}
                        disabled={!id1 || !id2 || id1 === id2 || loading}
                        className="h-[48px] bg-val-blue text-white font-bold uppercase tracking-widest rounded transition-all hover:bg-val-blue/90 disabled:opacity-50"
                    >
                        {loading ? 'Loading...' : 'Compare Teams'}
                    </button>
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
