"use client";

import { useMemo } from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { RoundWinIcon } from './WinTypeIcons';

interface EconomyChartProps {
    rounds: {
        round_number: number;
        winning_team_id: number;
        win_type: string;
        economy_t1: number;
        economy_t2: number;
    }[];
    team1_id: number;
}

export default function EconomyChart({ rounds, team1_id }: EconomyChartProps) {
    const data = useMemo(() => {
        const chartData = rounds.map(r => ({
            round: r.round_number,
            diff: r.economy_t1 - r.economy_t2,
            rawT1: r.economy_t1,
            rawT2: r.economy_t2,
            winTeam: r.winning_team_id,
            winType: r.win_type
        }));

        return chartData;
    }, [rounds]);

    const avgBankT1 = Math.round(rounds.reduce((sum, r) => sum + r.economy_t1, 0) / (rounds.length || 1));
    const avgBankT2 = Math.round(rounds.reduce((sum, r) => sum + r.economy_t2, 0) / (rounds.length || 1));

    // Custom Tooltip
    const CustomTooltip = ({ active, payload }: any) => {
        if (active && payload && payload.length) {
            const data = payload[0].payload;

            return (
                <div className="bg-[#1a232c] border border-white/10 p-3 rounded shadow-xl text-xs font-sans z-50">
                    <div className="text-foreground/60 mb-1">Round {data.round}</div>
                    <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${data.diff > 0 ? 'bg-[#0ea5e9]' : 'bg-[#ef4444]'}`} />
                        <span className="font-bold">Difference:</span>
                        <span className="font-display">{Math.abs(data.diff).toLocaleString()}</span>
                    </div>
                </div>
            );
        }
        return null;
    };

    // Split data for gradient
    const gradientOffset = () => {
        if (data.length === 0) return 0;
        const dataMax = Math.max(...data.map(i => i.diff));
        const dataMin = Math.min(...data.map(i => i.diff));

        if (dataMax <= 0) return 0;
        if (dataMin >= 0) return 1;

        return dataMax / (dataMax - dataMin);
    };

    const off = gradientOffset();

    return (
        <div className="flex flex-col w-full font-sans bg-[#131b23] p-6 rounded-xl border border-white/5">
            {/* Header / Legend */}
            <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-6">
                    <h3 className="text-xl font-bold font-display tracking-wide">Economy</h3>
                    <div className="h-6 w-px bg-white/10"></div>
                    <div className="flex items-center gap-6 text-sm">
                        <div>
                            <span className="text-foreground/60 mr-2">Avg. Bank:</span>
                            <span className="text-[#0ea5e9] font-bold">{avgBankT1.toLocaleString()}</span>
                            <span className="text-foreground/40 mx-1">/</span>
                            <span className="text-[#ef4444] font-bold">{avgBankT2.toLocaleString()}</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Chart Container */}
            <div className="h-[200px] w-full relative">
                <ResponsiveContainer width="100%" height="100%">
                    <AreaChart
                        data={data}
                        margin={{ top: 10, right: 20, left: 10, bottom: 0 }}
                    >
                        <defs>
                            <linearGradient id="splitColor" x1="0" y1="0" x2="0" y2="1">
                                <stop offset={off} stopColor="#0ea5e9" stopOpacity={0.4} />
                                <stop offset={off} stopColor="#ef4444" stopOpacity={0.4} />
                            </linearGradient>
                            <linearGradient id="strokeColor" x1="0" y1="0" x2="0" y2="1">
                                <stop offset={off} stopColor="#0ea5e9" stopOpacity={1} />
                                <stop offset={off} stopColor="#ef4444" stopOpacity={1} />
                            </linearGradient>
                        </defs>

                        <XAxis
                            dataKey="round"
                            type="number"
                            domain={[1, 'dataMax']}
                            ticks={data.map(d => d.round)}
                            tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 10, dy: 10 }}
                            axisLine={{ stroke: 'rgba(255,255,255,0.1)' }}
                            tickLine={false}
                        />
                        <YAxis
                            tickFormatter={(val) => `${Math.round(val / 1000)}k`}
                            tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 10 }}
                            axisLine={false}
                            tickLine={false}
                            width={40}
                            domain={['auto', 'auto']}
                        />
                        <Tooltip content={<CustomTooltip />} cursor={{ stroke: 'rgba(255,255,255,0.2)', strokeWidth: 1, strokeDasharray: '4 4' }} />
                        <ReferenceLine y={0} stroke="rgba(255,255,255,0.2)" strokeWidth={1} />

                        <Area
                            type="monotone"
                            dataKey="diff"
                            stroke="url(#strokeColor)"
                            strokeWidth={3}
                            fill="url(#splitColor)"
                            activeDot={{ r: 5, fill: '#fff', strokeWidth: 2, stroke: '#131b23' }}
                        />
                    </AreaChart>
                </ResponsiveContainer>
            </div>

            {/* Win Indicators aligned with X-axis */}
            <div className="flex w-full mt-4 pl-[50px] pr-[20px]">
                <div className="flex w-full justify-between px-1">
                    {data.map((r, i) => (
                        <div key={i} className="flex flex-col items-center gap-2 w-6">
                            <div className={`flex justify-center items-center w-6 h-6 ${r.winTeam === team1_id ? 'text-[#0ea5e9]' : 'text-[#ef4444]'}`} title={`${r.winType} (Round ${r.round})`}>
                                <RoundWinIcon type={r.winType} className="w-5 h-5" />
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
