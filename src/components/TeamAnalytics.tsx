'use client';

import { useState, useEffect } from 'react';
import {
    LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
    BarChart, Bar, Cell, Legend
} from 'recharts';
import { motion, AnimatePresence } from 'framer-motion';
import { type TeamPerformance, getTeamPerformance } from '@/lib/data';

const COLORS = ['#FF4655', '#3FD1FF', '#FFB800', '#00FF94', '#8E44AD', '#E67E22'];

interface Props {
    teams: { id: number; name: string; tag: string }[];
    initialSelectedId?: number;
    seasonId: string;
}

export default function TeamAnalytics({ teams, initialSelectedId, seasonId }: Props) {
    const [selectedId, setSelectedId] = useState<number | null>(initialSelectedId ?? teams[0]?.id ?? null);
    const [matchType, setMatchType] = useState<'regular' | 'playoff' | undefined>(undefined);
    const [viewMode, setViewMode] = useState<'overview' | 'scouting'>('overview');
    const [stats, setStats] = useState<TeamPerformance | null>(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (initialSelectedId) setSelectedId(initialSelectedId);
        if (selectedId) {
            setLoading(true);
            getTeamPerformance(selectedId, matchType, seasonId).then(data => {
                setStats(data);
                setLoading(false);
            });
        }
    }, [selectedId, initialSelectedId, matchType, seasonId]);

    return (
        <div className="space-y-8">
            {/* Team Selector & Filters */}
            <div className="glass rounded-xl p-4 border border-white/5 flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                    <label className="text-sm font-bold uppercase tracking-wider text-foreground/60">Select Team:</label>
                    <select
                        value={selectedId || ''}
                        onChange={(e) => setSelectedId(Number(e.target.value))}
                        className="bg-background/50 border border-white/10 rounded-lg px-4 py-2 focus:border-val-red outline-none min-w-[200px]"
                    >
                        {teams.map(t => (
                            <option key={t.id} value={t.id}>{t.name} [{t.tag}]</option>
                        ))}
                    </select>
                </div>

                <div className="flex gap-4">
                    <div className="flex bg-white/5 p-1 rounded-lg border border-white/10">
                        <button
                            onClick={() => setViewMode('overview')}
                            className={`px-4 py-2 rounded-md text-xs font-bold uppercase tracking-widest transition-all ${viewMode === 'overview' ? 'bg-val-blue text-white' : 'text-foreground/40 hover:text-foreground'}`}
                        >
                            Overview
                        </button>
                        <button
                            onClick={() => setViewMode('scouting')}
                            className={`px-4 py-2 rounded-md text-xs font-bold uppercase tracking-widest transition-all ${viewMode === 'scouting' ? 'bg-val-red text-white' : 'text-foreground/40 hover:text-foreground'}`}
                        >
                            Scouting
                        </button>
                    </div>

                    <div className="flex bg-white/5 p-1 rounded-lg border border-white/10">
                        <button
                            onClick={() => setMatchType(undefined)}
                            className={`px-4 py-2 rounded-md text-xs font-bold uppercase tracking-widest transition-all ${matchType === undefined ? 'bg-white/10 text-white' : 'text-foreground/40 hover:text-foreground'}`}
                        >
                            All
                        </button>
                        <button
                            onClick={() => setMatchType('regular')}
                            className={`px-4 py-2 rounded-md text-xs font-bold uppercase tracking-widest transition-all ${matchType === 'regular' ? 'bg-white/10 text-white' : 'text-foreground/40 hover:text-foreground'}`}
                        >
                            Regular
                        </button>
                        <button
                            onClick={() => setMatchType('playoff')}
                            className={`px-4 py-2 rounded-md text-xs font-bold uppercase tracking-widest transition-all ${matchType === 'playoff' ? 'bg-white/10 text-white' : 'text-foreground/40 hover:text-foreground'}`}
                        >
                            Playoffs
                        </button>
                    </div>
                </div>
            </div>

            <AnimatePresence mode="wait">
                {loading ? (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="h-[400px] flex items-center justify-center"
                    >
                        <div className="w-8 h-8 border-4 border-val-blue border-t-transparent rounded-full animate-spin" />
                    </motion.div>
                ) : stats && stats.progression.length > 0 ? (
                    <motion.div
                        key={stats.id}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -20 }}
                        className="space-y-8"
                    >
                        {viewMode === 'overview' ? (
                            <>
                                {/* Summary Cards */}
                                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                                    <StatCard label="Group" value={stats.group} color="text-val-blue" />
                                    <StatCard label="Total Points" value={stats.progression.reduce((acc, curr) => acc + curr.points, 0)} color="text-val-red" />
                                    <StatCard label="Map Win Rate" value={`${Math.round((stats.maps.reduce((acc, curr) => acc + curr.wins, 0) / stats.maps.reduce((acc, curr) => acc + curr.wins + curr.losses, 0) || 0) * 100)}%`} color="text-foreground" />
                                    <StatCard label="Pistol WR" value={`${stats.summary.pistolWinRate}%`} color="text-val-blue" />
                                    <StatCard label="Round WR" value={`${stats.summary.roundWinRate}%`} color="text-val-red" />
                                    <StatCard label="Avg Team ACS" value={Math.round(stats.playerStats.reduce((acc, curr) => acc + curr.avgAcs, 0) / stats.playerStats.length || 0)} color="text-val-yellow" />
                                </div>

                                <div className="grid lg:grid-cols-2 gap-8">
                                    {/* Progression Chart */}
                                    <div className="glass rounded-xl p-6 border border-white/5">
                                        <h3 className="font-display text-xl font-bold mb-6 uppercase tracking-wider">Season Progression (Points)</h3>
                                        <div className="h-[300px] w-full">
                                            <ResponsiveContainer width="100%" height="100%">
                                                <LineChart data={stats.progression}>
                                                    <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" />
                                                    <XAxis
                                                        dataKey="week"
                                                        stroke="#ffffff60"
                                                        tickFormatter={(v) => `Week ${v}`}
                                                        fontSize={12}
                                                    />
                                                    <YAxis stroke="#ffffff60" fontSize={12} />
                                                    <Tooltip
                                                        contentStyle={{ backgroundColor: '#1a1a1a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px' }}
                                                        itemStyle={{ color: '#fff' }}
                                                    />
                                                    <Line
                                                        type="monotone"
                                                        dataKey="points"
                                                        stroke="#3FD1FF"
                                                        strokeWidth={3}
                                                        dot={{ fill: '#3FD1FF', r: 6 }}
                                                        activeDot={{ r: 8, fill: '#FF4655' }}
                                                    />
                                                </LineChart>
                                            </ResponsiveContainer>
                                        </div>
                                    </div>

                                    {/* Map Wins Chart */}
                                    <div className="glass rounded-xl p-6 border border-white/5">
                                        <h3 className="font-display text-xl font-bold mb-6 uppercase tracking-wider">Map Performance</h3>
                                        <div className="h-[300px] w-full">
                                            <ResponsiveContainer width="100%" height="100%">
                                                <BarChart data={stats.maps} layout="vertical" margin={{ left: 20 }}>
                                                    <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" />
                                                    <XAxis type="number" stroke="#ffffff60" fontSize={12} />
                                                    <YAxis dataKey="name" type="category" stroke="#ffffff60" fontSize={12} width={80} />
                                                    <Tooltip
                                                        contentStyle={{ backgroundColor: '#1a1a1a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px' }}
                                                        itemStyle={{ color: '#fff' }}
                                                    />
                                                    <Legend />
                                                    <Bar dataKey="wins" fill="#3FD1FF" radius={[0, 4, 4, 0]} name="Wins" stackId="a" />
                                                    <Bar dataKey="losses" fill="#FF4655" radius={[0, 4, 4, 0]} name="Losses" stackId="a" />
                                                </BarChart>
                                            </ResponsiveContainer>
                                        </div>
                                    </div>
                                </div>

                                {/* Player Stats Table */}
                                <div className="glass rounded-xl border border-white/5 overflow-hidden">
                                    <div className="p-6 border-b border-white/5">
                                        <h3 className="font-display text-xl font-bold uppercase tracking-wider">Internal Roster Rankings</h3>
                                    </div>
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-left">
                                            <thead>
                                                <tr className="bg-white/5 text-xs font-bold uppercase tracking-widest text-foreground/40">
                                                    <th className="px-6 py-4">Player</th>
                                                    <th className="px-6 py-4 text-center">Avg ACS</th>
                                                    <th className="px-6 py-4 text-center">ADR</th>
                                                    <th className="px-6 py-4 text-center">K/D Ratio</th>
                                                    <th className="px-6 py-4 text-center">KAST</th>
                                                    <th className="px-6 py-4 text-center">Maps Played</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-white/5">
                                                {stats.playerStats.map((p, i) => (
                                                    <tr key={i} className="hover:bg-white/[0.02] transition-colors">
                                                        <td className="px-6 py-4">
                                                            <div className="flex items-center gap-3">
                                                                <div className="w-8 h-8 rounded-full bg-val-red/10 flex items-center justify-center text-[10px] font-bold text-val-red">
                                                                    {i + 1}
                                                                </div>
                                                                <span className="font-bold">{p.name}</span>
                                                            </div>
                                                        </td>
                                                        <td className="px-6 py-4 text-center font-display font-medium text-val-blue text-lg">{p.avgAcs}</td>
                                                        <td className="px-6 py-4 text-center font-medium text-val-yellow">{p.avgAdr}</td>
                                                        <td className="px-6 py-4 text-center font-medium">
                                                            <span className={p.kd >= 1 ? 'text-val-blue' : 'text-val-red'}>{p.kd}</span>
                                                        </td>
                                                        <td className="px-6 py-4 text-center font-medium">{p.avgKast}%</td>
                                                        <td className="px-6 py-4 text-center text-foreground/60">{p.matches}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            </>
                        ) : (
                            <TeamScoutingReport stats={stats} />
                        )}
                    </motion.div>
                ) : (
                    <div className="h-[400px] flex items-center justify-center text-foreground/40 italic">
                        No statistical data found for this team.
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
}

function StatCard({ label, value, color }: { label: string, value: string | number, color: string }) {
    return (
        <div className="glass rounded-xl p-4 border border-white/5">
            <div className="text-[10px] font-black uppercase tracking-tighter text-foreground/40 mb-1">{label}</div>
            <div className={`text-2xl font-display font-black tracking-tight ${color}`}>{value}</div>
        </div>
    );
}

function TeamScoutingReport({ stats }: { stats: TeamPerformance }) {
    const bestMaps = [...stats.maps].sort((a, b) => (b.wins / (b.wins + b.losses || 1)) - (a.wins / (a.wins + a.losses || 1))).slice(0, 3);
    const worstMaps = [...stats.maps].sort((a, b) => (a.wins / (a.wins + a.losses || 1)) - (b.wins / (b.wins + b.losses || 1))).slice(0, 3);
    const topFraggers = [...stats.playerStats].sort((a, b) => b.avgAcs - a.avgAcs).slice(0, 2);

    return (
        <div className="space-y-8 animate-fade-in">
            <div className="grid lg:grid-cols-2 gap-8">
                {/* Roster Agent Meta */}
                <div className="glass rounded-xl p-6 border border-white/5">
                    <h3 className="font-display text-xl font-bold mb-6 uppercase tracking-wider">Roster Agent Meta</h3>
                    <div className="space-y-4">
                        {stats.playerStats.map((p, i) => (
                            <div key={i} className="flex items-center justify-between p-3 bg-white/5 rounded-lg border border-white/5">
                                <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 bg-val-blue/10 border border-val-blue/20 rounded flex items-center justify-center font-bold text-val-blue text-xs uppercase">
                                        {(p.mostPlayedAgent || '??').slice(0, 2)}
                                    </div>
                                    <div>
                                        <span className="font-bold block">{p.name}</span>
                                        <span className="text-xs text-white/40 uppercase tracking-widest">Team Starter</span>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <div className="text-xs text-white/40 uppercase tracking-tighter">Most Played</div>
                                    <div className="font-display font-black text-val-blue">{p.mostPlayedAgent || 'N/A'}</div>
                                </div>
                            </div>
                        ))}
                        {stats.playerStats.length === 0 && <span className="text-white/40 italic">No roster data available.</span>}
                    </div>
                </div>

                {/* Match Form */}
                <div className="glass rounded-xl p-6 border border-white/5">
                    <h3 className="font-display text-xl font-bold mb-6 uppercase tracking-wider">Recent Form (Last 5)</h3>
                    <div className="space-y-4">
                        {stats.recentMatches?.map((m, i) => (
                            <div key={i} className="flex items-center justify-between p-3 bg-white/5 rounded-lg border border-white/5">
                                <div className="flex items-center gap-4">
                                    <span className={`w-3 h-3 rounded-full ${m.result === 'win' ? 'bg-val-blue' : m.result === 'loss' ? 'bg-val-red' : 'bg-gray-500'}`} />
                                    <div>
                                        <div className="font-bold text-sm uppercase">vs {m.opponent}</div>
                                        <div className="text-xs text-white/40">Week {m.week}</div>
                                    </div>
                                </div>
                                <span className={`font-display font-black tracking-widest ${m.result === 'win' ? 'text-val-blue' : m.result === 'loss' ? 'text-val-red' : 'text-gray-400'}`}>
                                    {m.score}
                                </span>
                            </div>
                        ))}
                        {(!stats.recentMatches || stats.recentMatches.length === 0) && <span className="text-white/40 italic">No recent matches found.</span>}
                    </div>
                </div>
            </div>

            <div className="grid lg:grid-cols-2 gap-8">
                {/* Best Maps */}
                <div className="glass rounded-xl p-6 border border-white/5">
                    <h3 className="font-display text-xl font-bold mb-6 uppercase tracking-wider text-val-blue">Best Maps</h3>
                    <div className="space-y-3">
                        {bestMaps.map((m, i) => {
                            const wr = Math.round((m.wins / (m.wins + m.losses || 1)) * 100);
                            return (
                                <div key={i} className="flex justify-between items-center bg-val-blue/10 border border-val-blue/20 p-4 rounded-lg">
                                    <span className="font-bold uppercase tracking-widest">{m.name}</span>
                                    <span className="font-display font-black text-val-blue text-xl">{wr}% <span className="text-sm font-sans font-normal opacity-60">({m.wins}W - {m.losses}L)</span></span>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Worst Maps */}
                <div className="glass rounded-xl p-6 border border-white/5">
                    <h3 className="font-display text-xl font-bold mb-6 uppercase tracking-wider text-val-red">Permabans / Weaknesses</h3>
                    <div className="space-y-3">
                        {worstMaps.map((m, i) => {
                            const wr = Math.round((m.wins / (m.wins + m.losses || 1)) * 100);
                            return (
                                <div key={i} className="flex justify-between items-center bg-val-red/10 border border-val-red/20 p-4 rounded-lg">
                                    <span className="font-bold uppercase tracking-widest">{m.name}</span>
                                    <span className="font-display font-black text-val-red text-xl">{wr}% <span className="text-sm font-sans font-normal opacity-60">({m.wins}W - {m.losses}L)</span></span>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>

            {/* Danger Players */}
            <div className="glass rounded-xl p-6 border border-white/5">
                <h3 className="font-display text-xl font-bold mb-6 uppercase tracking-wider text-val-yellow">⚠️ Danger Players</h3>
                <div className="grid md:grid-cols-2 gap-4">
                    {topFraggers.map((p, i) => (
                        <div key={i} className="flex items-center gap-4 bg-white/5 p-4 rounded-lg border border-white/10 relative overflow-hidden group">
                            <div className="absolute inset-0 bg-val-yellow/5 translate-y-[100%] group-hover:translate-y-0 transition-transform duration-300" />
                            <div className="w-12 h-12 bg-val-yellow/20 rounded-full flex items-center justify-center font-bold text-val-yellow text-xl relative z-10">
                                {i + 1}
                            </div>
                            <div className="relative z-10">
                                <div className="font-bold text-lg">{p.name}</div>
                                <div className="text-sm text-white/60">Top Fragger</div>
                            </div>
                            <div className="ml-auto text-right relative z-10">
                                <div className="font-display font-black text-3xl text-val-yellow">{p.avgAcs}</div>
                                <div className="text-xs text-white/40 uppercase tracking-widest">Avg ACS</div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
                        {/* ... */}

