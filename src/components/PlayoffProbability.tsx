'use client';

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';

interface Props {
    probabilities: { teamId: number, name: string, probability: number }[];
}

export default function PlayoffProbability({ probabilities }: Props) {
    const CustomTooltip = ({ active, payload }: any) => {
        if (active && payload && payload.length) {
            return (
                <div className="glass p-3 border border-white/10 rounded-sm shadow-2xl">
                    <p className="text-[10px] font-black uppercase tracking-widest text-val-blue mb-1">{payload[0].payload.name}</p>
                    <p className="text-xl font-display font-black">{payload[0].value.toFixed(1)}% Chance</p>
                </div>
            );
        }
        return null;
    };

    return (
        <div className="glass p-8 border border-white/5 rounded-xl">
            <h3 className="font-display text-xl font-black uppercase tracking-tight mb-8 text-val-red italic">Playoff Probability Chart</h3>
            <div className="h-[500px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={probabilities} layout="vertical" margin={{ left: 100 }}>
                        <XAxis type="number" domain={[0, 100]} hide />
                        <YAxis
                            dataKey="name"
                            type="category"
                            axisLine={false}
                            tickLine={false}
                            tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 10, fontWeight: 900 }}
                            width={100}
                        />
                        <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.05)' }} />
                        <Bar dataKey="probability" radius={[0, 2, 2, 0]} barSize={20}>
                            {probabilities.map((entry, index) => (
                                <Cell
                                    key={`cell-${index}`}
                                    fill={entry.probability > 75 ? '#3fd1ff' : entry.probability > 25 ? '#ff4655' : 'rgba(255,255,255,0.1)'}
                                />
                            ))}
                        </Bar>
                    </BarChart>
                </ResponsiveContainer>
            </div>
            <div className="mt-8 flex justify-between text-[10px] font-black uppercase tracking-widest text-foreground/40 border-t border-white/5 pt-4 italic">
                <span>Monte Carlo Simulation Result</span>
                <span>Run with 1000 iterations</span>
            </div>
        </div>
    );
}
