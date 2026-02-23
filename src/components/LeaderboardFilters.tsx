'use client';

import { useState } from 'react';
import { LeaderboardPlayer } from '@/lib/data';
import LeaderboardPodium from './LeaderboardPodium';

export default function LeaderboardFilters({
    players,
}: {
    players: LeaderboardPlayer[];
}) {
    const [minGames, setMinGames] = useState(0);
    const [sortConfig, setSortConfig] = useState<{ key: keyof LeaderboardPlayer; direction: 'asc' | 'desc' }>({
        key: 'avg_acs',
        direction: 'desc'
    });

    const handleSort = (key: keyof LeaderboardPlayer) => {
        setSortConfig((current) => ({
            key,
            direction: current.key === key && current.direction === 'desc' ? 'asc' : 'desc'
        }));
    };

    const sortedPlayers = [...players]
        .filter((p) => p.matches_played >= minGames)
        .sort((a, b) => {
            const aValue = a[sortConfig.key];
            const bValue = b[sortConfig.key];

            if (typeof aValue === 'string' && typeof bValue === 'string') {
                return sortConfig.direction === 'asc'
                    ? aValue.localeCompare(bValue)
                    : bValue.localeCompare(aValue);
            }

            if (typeof aValue === 'number' && typeof bValue === 'number') {
                return sortConfig.direction === 'asc'
                    ? aValue - bValue
                    : bValue - aValue;
            }

            return 0;
        });

    const topThree = [...sortedPlayers].slice(0, 3);

    const SortHeader = ({ label, sortKey, align = 'center' }: { label: string, sortKey: keyof LeaderboardPlayer, align?: 'left' | 'center' | 'right' }) => (
        <th
            className={`px-4 py-4 text-${align} text-[10px] font-black uppercase tracking-widest text-foreground/40 cursor-pointer hover:text-val-blue transition-colors group`}
            onClick={() => handleSort(sortKey)}
        >
            <div className={`flex items-center justify-${align === 'center' ? 'center' : align === 'left' ? 'start' : 'end'} gap-1`}>
                {label}
                <span className={`text-[8px] ${sortConfig.key === sortKey ? 'text-val-blue' : 'opacity-0 group-hover:opacity-100'}`}>
                    {sortConfig.key === sortKey && sortConfig.direction === 'asc' ? '▲' : '▼'}
                </span>
            </div>
        </th>
    );

    return (
        <div>
            {/* Podium Section */}
            <LeaderboardPodium topPlayers={topThree} />

            {/* Filter Controls */}
            <div className="mb-8 glass rounded-xl p-6 border border-white/5">
                <div className="flex flex-col md:flex-row md:items-center gap-4">
                    <label className="text-sm font-bold uppercase tracking-wider text-foreground/60">
                        Minimum Games:
                    </label>
                    <input
                        type="range"
                        min="0"
                        max="10"
                        value={minGames}
                        onChange={(e) => setMinGames(parseInt(e.target.value))}
                        className="flex-1 accent-val-red"
                    />
                    <span className="font-display text-xl font-bold text-val-red min-w-[3rem] text-center">
                        {minGames}
                    </span>
                </div>
                <div className="mt-2 text-xs text-foreground/40">
                    Showing {sortedPlayers.length} of {players.length} players
                </div>
            </div>

            {/* Desktop Table */}
            <div className="hidden md:block glass rounded-xl overflow-hidden border border-white/5">
                <table className="w-full">
                    <thead className="bg-val-deep/50 border-b border-white/10">
                        <tr>
                            <th className="px-6 py-4 text-left text-xs font-bold uppercase tracking-widest text-foreground/60">Rank</th>
                            <SortHeader label="Player" sortKey="name" align="left" />
                            <SortHeader label="Team" sortKey="team" />
                            <SortHeader label="Matches" sortKey="matches_played" />
                            <SortHeader label="ACS" sortKey="avg_acs" />
                            <SortHeader label="ADR" sortKey="avg_adr" />
                            <SortHeader label="KAST" sortKey="avg_kast" />
                            <SortHeader label="HS%" sortKey="avg_hs_pct" />
                            <SortHeader label="K/D" sortKey="kd_ratio" />
                            <SortHeader label="FK" sortKey="total_fk" />
                        </tr>
                    </thead>
                    <tbody>
                        {sortedPlayers.map((player, index) => (
                            <tr
                                key={player.id}
                                className="border-b border-white/5 hover:bg-white/5 transition-colors duration-200"
                            >
                                <td className="px-6 py-4">
                                    <div className="font-display text-lg font-bold text-val-blue/40">
                                        #{index + 1}
                                    </div>
                                </td>
                                <td className="px-4 py-4">
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded bg-val-blue/10 flex items-center justify-center text-val-blue font-black text-xs">
                                            {player.name[0]}
                                        </div>
                                        <div>
                                            <div className="font-bold text-sm text-foreground">{player.name}</div>
                                            <div className="text-[10px] text-foreground/40 uppercase tracking-tighter">{player.riot_id}</div>
                                        </div>
                                    </div>
                                </td>
                                <td className="px-4 py-4 text-center">
                                    <span className="inline-block px-2 py-0.5 rounded bg-val-red/10 text-val-red text-[10px] font-black uppercase tracking-wider">
                                        {player.team}
                                    </span>
                                </td>
                                <td className="px-4 py-4 text-center text-xs font-bold text-foreground/60">
                                    {player.matches_played}
                                </td>
                                <td className="px-4 py-4 text-center font-display text-lg font-black text-val-blue">
                                    {player.avg_acs}
                                </td>
                                <td className="px-4 py-4 text-center font-bold text-foreground text-sm">
                                    {player.avg_adr}
                                </td>
                                <td className="px-4 py-4 text-center font-bold text-foreground text-sm">
                                    {player.avg_kast}%
                                </td>
                                <td className="px-4 py-4 text-center font-bold text-foreground text-sm">
                                    {player.avg_hs_pct}%
                                </td>
                                <td className={`px-4 py-4 text-center font-black text-sm ${player.kd_ratio >= 1 ? 'text-val-blue' : 'text-val-red/60'}`}>
                                    {player.kd_ratio.toFixed(2)}
                                </td>
                                <td className="px-4 py-4 text-center font-black text-val-blue text-sm">
                                    {player.total_fk}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Mobile Cards */}
            <div className="md:hidden space-y-4">
                {sortedPlayers.map((player, index) => (
                    <div
                        key={player.id}
                        className="glass rounded-xl p-5 border border-white/5"
                    >
                        <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-3">
                                <div className="font-display text-2xl font-bold text-val-blue">
                                    #{index + 1}
                                </div>
                                <div>
                                    <div className="font-bold text-foreground">{player.name}</div>
                                    <div className="text-[10px] text-foreground/40 uppercase tracking-tighter">{player.riot_id}</div>
                                </div>
                            </div>
                            <span className="inline-block px-3 py-1 rounded-full bg-val-red/10 text-val-red text-[10px] font-black uppercase tracking-wider">
                                {player.team}
                            </span>
                        </div>

                        <div className="grid grid-cols-2 gap-4 mb-4">
                            <div className="glass p-3 rounded bg-white/5">
                                <div className="text-[9px] text-foreground/40 uppercase font-black tracking-widest mb-1">Avg ACS</div>
                                <div className="font-display text-2xl font-black text-val-blue">{player.avg_acs}</div>
                            </div>
                            <div className="glass p-3 rounded bg-white/5">
                                <div className="text-[9px] text-foreground/40 uppercase font-black tracking-widest mb-1">Avg ADR</div>
                                <div className="font-display text-2xl font-black text-foreground">{player.avg_adr}</div>
                            </div>
                        </div>

                        <div className="grid grid-cols-4 gap-2 text-center">
                            <div>
                                <div className="text-[8px] text-foreground/40 uppercase font-black mb-1">K/D</div>
                                <div className={`text-sm font-black ${player.kd_ratio >= 1 ? 'text-val-blue' : 'text-val-red'}`}>{player.kd_ratio.toFixed(2)}</div>
                            </div>
                            <div>
                                <div className="text-[8px] text-foreground/40 uppercase font-black mb-1">KAST</div>
                                <div className="text-sm font-black text-foreground">{player.avg_kast}%</div>
                            </div>
                            <div>
                                <div className="text-[8px] text-foreground/40 uppercase font-black mb-1">HS%</div>
                                <div className="text-sm font-black text-foreground">{player.avg_hs_pct}%</div>
                            </div>
                            <div>
                                <div className="text-[8px] text-foreground/40 uppercase font-black mb-1">FK</div>
                                <div className="text-sm font-black text-val-blue">{player.total_fk}</div>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
