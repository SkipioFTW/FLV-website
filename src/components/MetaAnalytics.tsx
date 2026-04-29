'use client';

import { useState } from 'react';
import { MetaAnalytics } from '@/lib/data';
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    Tooltip,
    ResponsiveContainer,
    Cell
} from 'recharts';

export default function MetaAnalyticsComponent({ data }: { data: MetaAnalytics }) {
    const [selectedAgent, setSelectedAgent] = useState<string | null>(null);

    const activeAgent = selectedAgent
        ? data.agents.find(a => a.name === selectedAgent)
        : data.agents[0];

    if (data.agents.length === 0) {
        return (
            <div className="glass rounded-xl p-16 text-center border border-white/5">
                <div className="w-16 h-16 bg-val-blue/10 rounded-full flex items-center justify-center mx-auto mb-6">
                    <svg className="w-8 h-8 text-val-blue/60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2m0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                    </svg>
                </div>
                <h3 className="font-display text-2xl font-black italic text-foreground/80 uppercase mb-3">
                    No Meta Analytics Available
                </h3>
                <p className="text-foreground/40 text-sm">
                    Meta-analytics require match data to calculate pick rates and win rates. Data will appear here once Season matches begin.
                </p>
            </div>
        );
    }

    const CustomTooltip = ({ active, payload }: any) => {
        if (active && payload && payload.length) {
            return (
                <div className="glass p-3 border border-white/10 rounded-sm shadow-2xl backdrop-blur-md bg-black/80">
                    <p className="text-[10px] font-black uppercase tracking-widest text-val-blue mb-1">{payload[0].payload.name}</p>
                    <p className="text-xl font-display font-black text-white">{payload[0].value}%</p>
                    <p className="text-[8px] text-foreground/40 font-bold uppercase">Pick Rate</p>
                </div>
            );
        }
        return null;
    };

    return (
        <div className="space-y-12 animate-in fade-in slide-in-from-bottom-4 duration-700">
            {/* Top Grid: Agent Pick Rates & Map Popularity */}
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
                {/* Agent Pick Rates */}
                <div className="lg:col-span-3 glass p-8 border border-white/5 rounded-xl bg-gradient-to-br from-white/[0.02] to-transparent">
                    <div className="flex items-center justify-between mb-8">
                        <div>
                            <h3 className="font-display text-2xl font-black uppercase tracking-tight">Agent Pick Rates</h3>
                            <p className="text-xs text-foreground/40 font-bold uppercase tracking-widest">Global meta distribution</p>
                        </div>
                        <div className="hidden sm:block px-3 py-1 bg-val-blue/10 border border-val-blue/20 rounded-full">
                            <span className="text-[10px] font-black uppercase text-val-blue tracking-widest">Click to inspect</span>
                        </div>
                    </div>
                    <div className="h-[350px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={data.agents.slice(0, 12)} margin={{ top: 20, right: 0, left: -20, bottom: 0 }}>
                                <XAxis
                                    dataKey="name"
                                    axisLine={false}
                                    tickLine={false}
                                    tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 10, fontWeight: 900 }}
                                />
                                <YAxis 
                                    axisLine={false}
                                    tickLine={false}
                                    tick={{ fill: 'rgba(255,255,255,0.2)', fontSize: 10, fontWeight: 900 }}
                                />
                                <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.05)' }} />
                                <Bar dataKey="pickRate" radius={[4, 4, 0, 0]} onClick={(data) => setSelectedAgent(data?.name ?? null)}>
                                    {data.agents.slice(0, 12).map((entry, index) => (
                                        <Cell
                                            key={`cell-${index}`}
                                            fill={selectedAgent === entry.name ? '#ff4655' : 'rgba(63, 209, 255, 0.4)'}
                                            className="cursor-pointer transition-all duration-300"
                                            fillOpacity={selectedAgent === entry.name ? 1 : 0.6}
                                        />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Map Distribution */}
                <div className="lg:col-span-2 glass p-8 border border-white/5 rounded-xl bg-gradient-to-tr from-white/[0.02] to-transparent">
                    <div className="flex items-center justify-between mb-8">
                        <div>
                            <h3 className="font-display text-2xl font-black uppercase tracking-tight">Map Statistics</h3>
                            <p className="text-xs text-foreground/40 font-bold uppercase tracking-widest">Win rates & dominance</p>
                        </div>
                    </div>
                    <div className="space-y-6">
                        {data.maps.map((map) => (
                            <div key={map.name} className="space-y-2 group">
                                <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-widest">
                                    <span className="text-white group-hover:text-val-blue transition-colors">{map.name}</span>
                                    <div className="flex items-center gap-2">
                                        <span className="text-foreground/20 italic lowercase font-medium">{map.topTeams?.[0]?.name} dominant</span>
                                        <span className="text-foreground/40">{map.count} Matches</span>
                                    </div>
                                </div>
                                <div className="flex h-3 w-full rounded overflow-hidden bg-white/5 p-[1px]">
                                    <div
                                        className="h-full bg-gradient-to-r from-val-red to-val-red/60 transition-all duration-1000"
                                        style={{ width: `${map.t1WinRate}%` }}
                                    />
                                    <div
                                        className="h-full bg-gradient-to-l from-val-blue to-val-blue/60 transition-all duration-1000"
                                        style={{ width: `${map.t2WinRate}%` }}
                                    />
                                </div>
                                <div className="flex justify-between text-[9px] font-black text-foreground/30 uppercase tracking-widest">
                                    <span className={map.t1WinRate > map.t2WinRate ? 'text-val-red' : ''}>T1 WR: {map.t1WinRate}%</span>
                                    <span>Avg Rnds: {map.avgRounds}</span>
                                    <span className={map.t2WinRate > map.t1WinRate ? 'text-val-blue' : ''}>T2 WR: {map.t2WinRate}%</span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Agent Deep Dive */}
            {activeAgent && (
                <div className="glass border border-white/5 rounded-xl overflow-hidden animate-in fade-in slide-in-from-top-4 duration-500">
                    <div className="p-8 bg-gradient-to-r from-val-red/10 via-transparent to-transparent">
                        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-8 mb-12">
                            <div className="flex items-center gap-8">
                                <div className="relative group">
                                    <div className="absolute -inset-4 bg-val-red/20 rounded-full blur-2xl group-hover:bg-val-red/30 transition-all duration-500" />
                                    <div className="relative w-24 h-24 bg-val-red/10 border border-val-red/30 rounded-lg flex items-center justify-center text-val-red font-display text-5xl font-black italic">
                                        {activeAgent.name[0]}
                                    </div>
                                </div>
                                <div>
                                    <div className="flex items-center gap-3 mb-1">
                                        <h3 className="font-display text-5xl font-black uppercase tracking-tighter text-white italic">{activeAgent.name}</h3>
                                        <span className="px-2 py-0.5 bg-white/5 border border-white/10 rounded text-[10px] font-black uppercase tracking-widest text-foreground/60">Active Meta</span>
                                    </div>
                                    <div className="flex flex-wrap gap-x-8 gap-y-4 mt-4">
                                        <div className="flex flex-col">
                                            <span className="text-[10px] font-black uppercase tracking-widest text-foreground/30">Win Rate</span>
                                            <span className="text-2xl font-display font-black text-val-blue italic">{activeAgent.winRate}%</span>
                                        </div>
                                        <div className="flex flex-col">
                                            <span className="text-[10px] font-black uppercase tracking-widest text-foreground/30">Avg ACS</span>
                                            <span className="text-2xl font-display font-black text-white italic">{activeAgent.avgAcs}</span>
                                        </div>
                                        <div className="flex flex-col">
                                            <span className="text-[10px] font-black uppercase tracking-widest text-foreground/30">Avg KAST</span>
                                            <span className="text-2xl font-display font-black text-val-red italic">{activeAgent.avgKast}%</span>
                                        </div>
                                        <div className="flex flex-col">
                                            <span className="text-[10px] font-black uppercase tracking-widest text-foreground/30">HS Percentage</span>
                                            <span className="text-2xl font-display font-black text-white italic">{activeAgent.avgHsPct}%</span>
                                        </div>
                                        <div className="flex flex-col">
                                            <span className="text-[10px] font-black uppercase tracking-widest text-foreground/30">ADR</span>
                                            <span className="text-2xl font-display font-black text-val-blue italic">{activeAgent.avgAdr}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <div className="flex flex-col items-end">
                                <div className="text-[10px] font-black uppercase tracking-widest text-foreground/30 mb-1">Pick Rate</div>
                                <div className="text-7xl font-display font-black text-white/5 italic">{activeAgent.pickRate}%</div>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                            {/* Map Efficiency */}
                            <div className="lg:col-span-2 space-y-4">
                                <h4 className="text-[10px] font-black uppercase tracking-widest text-val-blue">Map Efficiency</h4>
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                    {activeAgent.maps.map((m) => (
                                        <div key={m.mapName} className="bg-white/5 p-5 rounded-lg border border-white/5 hover:border-val-red/20 transition-all">
                                            <div className="text-[10px] font-black uppercase tracking-widest text-foreground/40 mb-4">{m.mapName}</div>
                                            <div className="space-y-4">
                                                <div className="flex items-center justify-between">
                                                    <span className="text-[9px] font-bold text-foreground/40 uppercase">Win Rate</span>
                                                    <span className={`text-lg font-display font-black italic ${m.winRate >= 50 ? 'text-val-blue' : 'text-val-red'}`}>{m.winRate}%</span>
                                                </div>
                                                <div className="w-full h-1 bg-white/5 rounded-full overflow-hidden">
                                                    <div className={`h-full ${m.winRate >= 50 ? 'bg-val-blue' : 'bg-val-red'}`} style={{ width: `${m.winRate}%` }} />
                                                </div>
                                                <div className="flex items-center justify-between">
                                                    <span className="text-[9px] font-bold text-foreground/40 uppercase">Usage</span>
                                                    <span className="text-xs font-black text-white">{m.pickRate}%</span>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Top Specialists */}
                            <div className="space-y-4">
                                <h4 className="text-[10px] font-black uppercase tracking-widest text-val-red">Top Specialists</h4>
                                <div className="space-y-3">
                                    {activeAgent.topPlayers.length > 0 ? (
                                        activeAgent.topPlayers.map((player, idx) => (
                                            <div key={player.id} className="flex items-center justify-between p-4 glass bg-white/[0.03] border border-white/5 rounded-lg group hover:bg-white/[0.05] transition-all">
                                                <div className="flex items-center gap-4">
                                                    <div className="w-8 h-8 rounded bg-val-red/10 flex items-center justify-center text-val-red font-display font-black text-xs">
                                                        #{idx + 1}
                                                    </div>
                                                    <div>
                                                        <div className="text-sm font-black text-white group-hover:text-val-red transition-colors">{player.name}</div>
                                                        <div className="text-[9px] font-bold text-foreground/40 uppercase tracking-widest">Highest ACS Rating</div>
                                                    </div>
                                                </div>
                                                <div className="text-right">
                                                    <div className="text-lg font-display font-black italic text-val-blue">{player.acs}</div>
                                                    <div className="text-[8px] font-bold text-foreground/30 uppercase">Avg ACS</div>
                                                </div>
                                            </div>
                                        ))
                                    ) : (
                                        <p className="text-xs text-foreground/40 italic">No specialist data available.</p>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
