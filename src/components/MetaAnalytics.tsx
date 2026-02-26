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
    Cell,
    PieChart,
    Pie
} from 'recharts';

export default function MetaAnalyticsComponent({ data }: { data: MetaAnalytics }) {
    const [selectedAgent, setSelectedAgent] = useState<string | null>(null);

    const activeAgent = selectedAgent
        ? data.agents.find(a => a.name === selectedAgent)
        : data.agents[0];

    const CustomTooltip = ({ active, payload }: any) => {
        if (active && payload && payload.length) {
            return (
                <div className="glass p-3 border border-white/10 rounded-sm shadow-2xl">
                    <p className="text-[10px] font-black uppercase tracking-widest text-val-blue mb-1">{payload[0].payload.name}</p>
                    <p className="text-xl font-display font-black">{payload[0].value}%</p>
                </div>
            );
        }
        return null;
    };

    return (
        <div className="space-y-12 animate-in fade-in slide-in-from-bottom-4 duration-700">
            {/* Top Grid: Agent Pick Rates & Map Popularity */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Agent Pick Rates */}
                <div className="glass p-8 border border-white/5 rounded-xl">
                    <div className="flex items-center justify-between mb-8">
                        <div>
                            <h3 className="font-display text-xl font-black uppercase tracking-tight">Agent Pick Rates</h3>
                            <p className="text-xs text-foreground/40 font-bold uppercase tracking-widest">League-wide popularity</p>
                        </div>
                    </div>
                    <div className="h-[300px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={data.agents.slice(0, 10)}>
                                <XAxis
                                    dataKey="name"
                                    axisLine={false}
                                    tickLine={false}
                                    tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 10, fontWeight: 900 }}
                                />
                                <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.05)' }} />
                                <Bar dataKey="pickRate" radius={[2, 2, 0, 0]} onClick={(data) => setSelectedAgent(data?.name ?? null)}>
                                    {data.agents.slice(0, 10).map((entry, index) => (
                                        <Cell
                                            key={`cell-${index}`}
                                            fill={selectedAgent === entry.name ? '#ff4655' : 'rgba(63, 209, 255, 0.4)'}
                                            className="cursor-pointer transition-all duration-300 hover:opacity-100"
                                            fillOpacity={selectedAgent === entry.name ? 1 : 0.6}
                                        />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Map Distribution */}
                <div className="glass p-8 border border-white/5 rounded-xl">
                    <div className="flex items-center justify-between mb-8">
                        <div>
                            <h3 className="font-display text-xl font-black uppercase tracking-tight">Map Statistics</h3>
                            <p className="text-xs text-foreground/40 font-bold uppercase tracking-widest">Win rates by starting side</p>
                        </div>
                    </div>
                    <div className="space-y-4">
                        {data.maps.map((map) => (
                            <div key={map.name} className="space-y-2">
                                <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-widest">
                                    <span>{map.name}</span>
                                    <span className="text-foreground/40">{map.count} Matches</span>
                                </div>
                                <div className="flex h-2 w-full rounded-full overflow-hidden bg-white/5">
                                    <div
                                        className="h-full bg-val-red transition-all duration-1000"
                                        style={{ width: `${map.t1WinRate}%` }}
                                        title={`Team 1 Win Rate: ${map.t1WinRate}%`}
                                    />
                                    <div
                                        className="h-full bg-val-blue transition-all duration-1000"
                                        style={{ width: `${map.t2WinRate}%` }}
                                        title={`Team 2 Win Rate: ${map.t2WinRate}%`}
                                    />
                                </div>
                                <div className="flex justify-between text-[8px] font-bold text-foreground/30 uppercase tracking-tighter">
                                    <span>T1 WR: {map.t1WinRate}%</span>
                                    <span>Avg Rounds: {map.avgRounds}</span>
                                    <span>T2 WR: {map.t2WinRate}%</span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Agent Deep Dive */}
            {activeAgent && (
                <div className="glass p-8 border border-white/5 rounded-xl animate-in fade-in slide-in-from-top-4 duration-500">
                    <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-8 border-b border-white/5 pb-8">
                        <div className="flex items-center gap-6">
                            <div className="w-20 h-20 bg-val-red/10 rounded flex items-center justify-center text-val-red font-display text-4xl font-black">
                                {activeAgent.name[0]}
                            </div>
                            <div>
                                <h3 className="font-display text-4xl font-black uppercase tracking-tight text-white">{activeAgent.name}</h3>
                                <div className="flex gap-4 mt-2">
                                    <div className="text-center">
                                        <div className="text-[10px] font-black uppercase tracking-widest text-foreground/40">Win Rate</div>
                                        <div className="text-xl font-display font-black text-val-blue">{activeAgent.winRate}%</div>
                                    </div>
                                    <div className="text-center border-l border-white/10 pl-4">
                                        <div className="text-[10px] font-black uppercase tracking-widest text-foreground/40">Avg ACS</div>
                                        <div className="text-xl font-display font-black text-white">{activeAgent.avgAcs}</div>
                                    </div>
                                    <div className="text-center border-l border-white/10 pl-4">
                                        <div className="text-[10px] font-black uppercase tracking-widest text-foreground/40">K/D Ratio</div>
                                        <div className="text-xl font-display font-black text-val-red">{activeAgent.avgKd}</div>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div className="text-right">
                            <p className="text-[10px] font-black uppercase tracking-widest text-foreground/40 mb-1">League Pick Rate</p>
                            <div className="text-5xl font-display font-black text-white/10">{activeAgent.pickRate}%</div>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                        {activeAgent.maps.map((m) => (
                            <div key={m.mapName} className="bg-white/5 p-4 rounded border border-white/5">
                                <div className="text-[10px] font-black uppercase tracking-widest text-foreground/40 mb-3">{m.mapName}</div>
                                <div className="flex items-end justify-between">
                                    <div>
                                        <div className="text-xs font-bold text-foreground/60 mb-1">Win Rate</div>
                                        <div className={`text-2xl font-display font-black ${m.winRate >= 50 ? 'text-val-blue' : 'text-val-red'}`}>
                                            {m.winRate}%
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <div className="text-xs font-bold text-foreground/60 mb-1">Picks</div>
                                        <div className="text-xl font-display font-black text-white">{m.pickRate}%</div>
                                    </div>
                                </div>
                                <div className="mt-4 w-full h-1 bg-white/5 rounded-full overflow-hidden">
                                    <div
                                        className={`h-full transition-all duration-1000 ${m.winRate >= 50 ? 'bg-val-blue' : 'bg-val-red'}`}
                                        style={{ width: `${m.winRate}%` }}
                                    />
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
