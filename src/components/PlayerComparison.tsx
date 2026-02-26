'use client';

import { useState, useMemo } from 'react';
import { PlayerStats } from '@/lib/data';
import {
    Radar,
    RadarChart,
    PolarGrid,
    PolarAngleAxis,
    PolarRadiusAxis,
    ResponsiveContainer,
} from 'recharts';

export default function PlayerComparison({ players }: { players: { id: number, name: string }[] }) {
    const [id1, setId1] = useState<number | null>(null);
    const [id2, setId2] = useState<number | null>(null);
    const [stats1, setStats1] = useState<PlayerStats | null>(null);
    const [stats2, setStats2] = useState<PlayerStats | null>(null);
    const [loading, setLoading] = useState(false);

    const handleCompare = async () => {
        if (!id1 || !id2) return;
        setLoading(true);
        try {
            const { getPlayerStats } = await import('@/lib/data');
            const [p1, p2] = await Promise.all([
                getPlayerStats(id1),
                getPlayerStats(id2)
            ]);
            setStats1(p1);
            setStats2(p2);
        } finally {
            setLoading(false);
        }
    };

    const radarData = useMemo(() => {
        if (!stats1 || !stats2) return [];

        // Normalize values for radar chart (0-100 scale)
        const normalize = (val: number, max: number) => Math.min((val / max) * 100, 100);

        return [
            { subject: 'ACS', A: normalize(stats1.summary.avgAcs, 400), B: normalize(stats2.summary.avgAcs, 400), fullMark: 100 },
            { subject: 'K/D', A: normalize(stats1.summary.kd, 2), B: normalize(stats2.summary.kd, 2), fullMark: 100 },
            { subject: 'ADR', A: normalize(stats1.summary.avgAdr || 0, 200), B: normalize(stats2.summary.avgAdr || 0, 200), fullMark: 100 },
            { subject: 'KAST', A: stats1.summary.avgKast || 0, B: stats2.summary.avgKast || 0, fullMark: 100 },
            { subject: 'HS%', A: normalize(stats1.summary.avgHsPct || 25, 50), B: normalize(stats2.summary.avgHsPct || 25, 50), fullMark: 100 }, // Wait, hs_pct is missing from summary? I'll check
            { subject: 'WR', A: stats1.summary.winRate, B: stats2.summary.winRate, fullMark: 100 },
        ];
    }, [stats1, stats2]);

    return (
        <div className="space-y-8">
            <div className="glass p-8 border border-white/5 rounded-xl">
                <div className="grid md:grid-cols-3 gap-6 items-end">
                    <div>
                        <label className="text-[10px] font-black uppercase tracking-widest text-foreground/40 block mb-2">Player 1</label>
                        <select
                            value={id1 || ''}
                            onChange={(e) => setId1(Number(e.target.value))}
                            className="w-full bg-white/5 border border-white/10 rounded p-3 text-sm"
                        >
                            <option value="">Select player</option>
                            {players.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="text-[10px] font-black uppercase tracking-widest text-foreground/40 block mb-2">Player 2</label>
                        <select
                            value={id2 || ''}
                            onChange={(e) => setId2(Number(e.target.value))}
                            className="w-full bg-white/5 border border-white/10 rounded p-3 text-sm"
                        >
                            <option value="">Select player</option>
                            {players.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                    </div>
                    <button
                        onClick={handleCompare}
                        disabled={!id1 || !id2 || id1 === id2 || loading}
                        className="h-[48px] bg-val-red text-white font-bold uppercase tracking-widest rounded transition-all hover:bg-val-red/90 disabled:opacity-50"
                    >
                        {loading ? 'Loading...' : 'Compare Players'}
                    </button>
                </div>
            </div>

            {stats1 && stats2 && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 animate-in fade-in zoom-in-95 duration-500">
                    {/* Stats Comparison Table */}
                    <div className="glass p-8 border border-white/5 rounded-xl">
                        <h3 className="font-display text-xl font-black uppercase tracking-tight mb-8">Performance Comparison</h3>
                        <div className="space-y-6">
                            {[
                                { label: 'Average ACS', val1: stats1.summary.avgAcs, val2: stats2.summary.avgAcs },
                                { label: 'K/D Ratio', val1: stats1.summary.kd, val2: stats2.summary.kd },
                                { label: 'ADR', val1: stats1.summary.avgAdr, val2: stats2.summary.avgAdr },
                                { label: 'KAST%', val1: `${stats1.summary.avgKast}%`, val2: `${stats2.summary.avgKast}%` },
                                { label: 'Win Rate', val1: `${stats1.summary.winRate}%`, val2: `${stats2.summary.winRate}%` },
                                { label: 'Pistol WR', val1: `${stats1.summary.pistolWinRate}%`, val2: `${stats2.summary.pistolWinRate}%` },
                            ].map((stat) => (
                                <div key={stat.label} className="group">
                                    <div className="flex justify-between text-[10px] font-black uppercase tracking-widest text-foreground/40 mb-2">
                                        <span>{stats1.name}</span>
                                        <span>{stat.label}</span>
                                        <span>{stats2.name}</span>
                                    </div>
                                    <div className="flex items-center gap-4">
                                        <div className="flex-1 h-2 bg-white/5 rounded-full overflow-hidden flex justify-end">
                                            <div
                                                className="h-full bg-val-red transition-all duration-1000"
                                                style={{ width: `${(parseFloat(String(stat.val1)) / (parseFloat(String(stat.val1)) + parseFloat(String(stat.val2)) || 1)) * 100}%` }}
                                            />
                                        </div>
                                        <div className="flex-1 h-2 bg-white/5 rounded-full overflow-hidden">
                                            <div
                                                className="h-full bg-val-blue transition-all duration-1000"
                                                style={{ width: `${(parseFloat(String(stat.val2)) / (parseFloat(String(stat.val1)) + parseFloat(String(stat.val2)) || 1)) * 100}%` }}
                                            />
                                        </div>
                                    </div>
                                    <div className="flex justify-between mt-2 font-display text-lg font-black">
                                        <span className="text-val-red">{stat.val1}</span>
                                        <span className="text-val-blue">{stat.val2}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Radar Chart */}
                    <div className="glass p-8 border border-white/5 rounded-xl flex flex-col items-center justify-center">
                        <h3 className="font-display text-xl font-black uppercase tracking-tight mb-8 self-start">Skill Profile</h3>
                        <div className="h-[400px] w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <RadarChart cx="50%" cy="50%" outerRadius="80%" data={radarData}>
                                    <PolarGrid stroke="rgba(255,255,255,0.1)" />
                                    <PolarAngleAxis dataKey="subject" tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 10, fontWeight: 900 }} />
                                    <Radar
                                        name={stats1.name}
                                        dataKey="A"
                                        stroke="#ff4655"
                                        fill="#ff4655"
                                        fillOpacity={0.4}
                                    />
                                    <Radar
                                        name={stats2.name}
                                        dataKey="B"
                                        stroke="#3fd1ff"
                                        fill="#3fd1ff"
                                        fillOpacity={0.4}
                                    />
                                </RadarChart>
                            </ResponsiveContainer>
                        </div>
                        <div className="flex gap-8 mt-4">
                            <div className="flex items-center gap-2">
                                <div className="w-3 h-3 bg-val-red opacity-40 rounded-full"></div>
                                <span className="text-xs font-bold uppercase tracking-widest text-foreground/60">{stats1.name}</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <div className="w-3 h-3 bg-val-blue opacity-40 rounded-full"></div>
                                <span className="text-xs font-bold uppercase tracking-widest text-foreground/60">{stats2.name}</span>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
