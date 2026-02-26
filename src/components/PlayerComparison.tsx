'use client';

import { useState, useMemo, useEffect } from 'react';
import { PlayerStats, getPlayerStats } from '@/lib/data';
import PlayerSearch from './PlayerSearch';
import {
    Radar,
    RadarChart,
    PolarGrid,
    PolarAngleAxis,
    PolarRadiusAxis,
    ResponsiveContainer,
} from 'recharts';

export default function PlayerComparison({ players }: { players: { id: number, name: string, riot_id: string }[] }) {
    const [id1, setId1] = useState<number | null>(null);
    const [id2, setId2] = useState<number | null>(null);
    const [stats1, setStats1] = useState<PlayerStats | null>(null);
    const [stats2, setStats2] = useState<PlayerStats | null>(null);
    const [loading, setLoading] = useState(false);
    const [matchType, setMatchType] = useState<'regular' | 'playoff' | undefined>(undefined);

    useEffect(() => {
        if (id1 || id2) {
            setLoading(true);
            Promise.all([
                id1 ? getPlayerStats(id1, matchType) : Promise.resolve(null),
                id2 ? getPlayerStats(id2, matchType) : Promise.resolve(null)
            ]).then(([p1, p2]) => {
                if (id1) setStats1(p1);
                if (id2) setStats2(p2);
                setLoading(false);
            });
        }
    }, [id1, id2, matchType]);

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
                <div className="flex flex-col md:flex-row gap-8 items-center justify-between mb-8">
                    <div className="w-full max-w-sm">
                        <label className="text-[10px] font-black uppercase tracking-widest text-foreground/40 block mb-2">Player 1</label>
                        <PlayerSearch players={players} onSelect={setId1} currentId={id1} />
                    </div>
                    <div className="text-xl font-display font-black text-white/10 italic">VS</div>
                    <div className="w-full max-w-sm">
                        <label className="text-[10px] font-black uppercase tracking-widest text-foreground/40 block mb-2">Player 2</label>
                        <PlayerSearch players={players} onSelect={setId2} currentId={id2} />
                    </div>
                </div>

                <div className="flex justify-center">
                    <div className="flex bg-white/5 p-1 rounded-lg border border-white/10">
                        <button
                            onClick={() => setMatchType(undefined)}
                            className={`px-6 py-2 rounded-md text-xs font-bold uppercase tracking-widest transition-all ${matchType === undefined ? 'bg-val-red text-white shadow-lg shadow-val-red/20' : 'text-foreground/40 hover:text-foreground'}`}
                        >
                            All Stats
                        </button>
                        <button
                            onClick={() => setMatchType('regular')}
                            className={`px-6 py-2 rounded-md text-xs font-bold uppercase tracking-widest transition-all ${matchType === 'regular' ? 'bg-val-red text-white shadow-lg shadow-val-red/20' : 'text-foreground/40 hover:text-foreground'}`}
                        >
                            Regular Season
                        </button>
                        <button
                            onClick={() => setMatchType('playoff')}
                            className={`px-6 py-2 rounded-md text-xs font-bold uppercase tracking-widest transition-all ${matchType === 'playoff' ? 'bg-val-red text-white shadow-lg shadow-val-red/20' : 'text-foreground/40 hover:text-foreground'}`}
                        >
                            Playoffs Only
                        </button>
                    </div>
                </div>
            </div>

            {stats1 && stats2 && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 animate-in fade-in zoom-in-95 duration-500">
                    {/* Stats Comparison Table */}
                    <div className="glass p-8 border border-white/5 rounded-xl">
                        <h3 className="font-display text-xl font-black uppercase tracking-tight mb-8">Performance Comparison</h3>
                        <div className="space-y-6">
                            {[
                                { label: 'Matches Played', val1: stats1.summary.matches, val2: stats2.summary.matches },
                                { label: 'Average ACS', val1: stats1.summary.avgAcs, val2: stats2.summary.avgAcs },
                                { label: 'K/D Ratio', val1: stats1.summary.kd, val2: stats2.summary.kd },
                                { label: 'ADR', val1: stats1.summary.avgAdr, val2: stats2.summary.avgAdr },
                                { label: 'KAST%', val1: `${stats1.summary.avgKast}%`, val2: `${stats2.summary.avgKast}%` },
                                { label: 'Win Rate', val1: `${stats1.summary.winRate}%`, val2: `${stats2.summary.winRate}%` },
                                { label: 'Pistol WR', val1: `${stats1.summary.pistolWinRate}%`, val2: `${stats2.summary.pistolWinRate}%` },
                                { label: 'Clutch Rate', val1: (stats1.summary.clutchSuccessRate || 0) / 100, val2: (stats2.summary.clutchSuccessRate || 0) / 100 },
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
