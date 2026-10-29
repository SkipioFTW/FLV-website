'use client';

import { useMemo, useState } from 'react';
import type { PositionPoint } from '@/lib/data';
import { VALORANT_MAP_CALIBRATION, projectToMinimap } from '@/lib/valorantMaps';

type FilterKey = 'deaths' | 'kills' | 'plants' | 'defuses';

const FILTERS: { key: FilterKey; label: string; event_type: string; role: string; color: string }[] = [
    { key: 'deaths', label: 'Deaths', event_type: 'kill', role: 'victim', color: '#FF4655' },
    { key: 'kills', label: 'Kills', event_type: 'kill', role: 'killer', color: '#3FD1FF' },
    { key: 'plants', label: 'Plants', event_type: 'plant', role: 'planter', color: '#FFB800' },
    { key: 'defuses', label: 'Defuses', event_type: 'defuse', role: 'defuser', color: '#00FF94' },
];

interface Props {
    positions: PositionPoint[];
}

export default function PositionHeatmap({ positions }: Props) {
    const availableMaps = useMemo(
        () => [...new Set(positions.map(p => p.map_name))].filter(m => VALORANT_MAP_CALIBRATION[m]),
        [positions]
    );
    const [selectedMap, setSelectedMap] = useState<string | null>(availableMaps[0] ?? null);
    const [filter, setFilter] = useState<FilterKey>('deaths');

    const activeMap = (selectedMap && availableMaps.includes(selectedMap)) ? selectedMap : availableMaps[0] ?? null;
    const activeFilter = FILTERS.find(f => f.key === filter)!;

    const points = useMemo(() => {
        if (!activeMap) return [];
        return positions
            .filter(p => p.map_name === activeMap && p.event_type === activeFilter.event_type && p.role === activeFilter.role)
            .map(p => projectToMinimap(p.x, p.y, activeMap))
            .filter((pt): pt is { left: number; top: number } => pt !== null);
    }, [positions, activeMap, activeFilter]);

    if (!activeMap) {
        return (
            <div className="glass rounded-xl p-6 border border-white/5">
                <h3 className="font-display text-xl font-bold mb-2 uppercase tracking-wider">Position Heatmap</h3>
                <p className="text-foreground/40 text-sm">No position data recorded yet.</p>
            </div>
        );
    }

    const cal = VALORANT_MAP_CALIBRATION[activeMap];

    return (
        <div className="glass rounded-xl p-6 border border-white/5">
            <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
                <h3 className="font-display text-xl font-bold uppercase tracking-wider">Position Heatmap</h3>
                <div className="flex flex-wrap items-center gap-3">
                    <select
                        value={activeMap}
                        onChange={e => setSelectedMap(e.target.value)}
                        className="bg-white/5 border border-white/10 rounded-md px-3 py-2 text-sm font-bold uppercase tracking-wide"
                    >
                        {availableMaps.map(m => <option key={m} value={m}>{m}</option>)}
                    </select>
                    <div className="flex bg-white/5 p-1 rounded-lg border border-white/10">
                        {FILTERS.map(f => (
                            <button
                                key={f.key}
                                onClick={() => setFilter(f.key)}
                                className={`px-4 py-2 rounded-md text-xs font-bold uppercase tracking-widest transition-all ${filter === f.key ? 'bg-val-red text-white' : 'text-foreground/40 hover:text-foreground'}`}
                            >
                                {f.label}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            <div className="relative w-full max-w-xl mx-auto aspect-square rounded-lg overflow-hidden border border-white/10 bg-black/40">
                <img src={cal.displayIcon} alt={activeMap} className="absolute inset-0 w-full h-full object-cover" />
                {points.map((pt, i) => (
                    <div
                        key={i}
                        className="absolute w-2.5 h-2.5 rounded-full -translate-x-1/2 -translate-y-1/2"
                        style={{ left: `${pt.left * 100}%`, top: `${pt.top * 100}%`, backgroundColor: activeFilter.color, opacity: 0.45 }}
                    />
                ))}
                {points.length === 0 && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                        <p className="text-foreground/60 text-sm font-bold uppercase tracking-wider">
                            No {activeFilter.label.toLowerCase()} recorded yet on {activeMap}
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
}
