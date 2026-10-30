'use client';

import { useState } from 'react';
import EconomyChart from './EconomyChart';
import RoundReplay from './RoundReplay';
import DuelsMatrix from './DuelsMatrix';
import RoundStrip from './RoundStrip';
import PerformanceTab from './PerformanceTab';

type MapData = {
    index: number;
    name: string;
    t1_rounds: number;
    t2_rounds: number;
    is_forfeit: number;
    stats: any[];
    rounds: any[];
};

type MatchTeam = { id: number; name: string; tag: string };

interface Props {
    matchId: number;
    map: MapData;
    team1: MatchTeam;
    team2: MatchTeam;
}

const TABS = ['Scoreboard', 'Performance', 'Economy', 'Rounds', 'Duels'] as const;
type Tab = typeof TABS[number];

export default function MapSummaryTabs({ matchId, map, team1, team2 }: Props) {
    const [tab, setTab] = useState<Tab>('Scoreboard');
    const roster = Object.fromEntries(map.stats.map((s: any) => [s.player_id, { name: s.player_name, team_id: s.team_id, agent: s.agent }]));

    return (
        <div>
            <div className="flex gap-6 border-b border-white/10 mb-6 overflow-x-auto">
                {TABS.map(t => (
                    <button
                        key={t}
                        onClick={() => setTab(t)}
                        className={`pb-3 px-1 text-sm font-black uppercase tracking-widest whitespace-nowrap border-b-2 transition-colors ${tab === t ? 'border-val-blue text-val-blue' : 'border-transparent text-foreground/40 hover:text-foreground'}`}
                    >
                        {t}
                    </button>
                ))}
            </div>

            {tab === 'Scoreboard' && <ScoreboardTab map={map} team1={team1} team2={team2} />}
            {tab === 'Performance' && <PerformanceTab matchId={matchId} map={map} team1={team1} team2={team2} />}
            {tab === 'Economy' && <EconomyTab map={map} team1={team1} team2={team2} />}
            {tab === 'Rounds' && (
                <RoundReplay matchId={matchId} mapIndex={map.index} mapName={map.name} team1Id={team1.id} roster={roster} rounds={map.rounds || []} />
            )}
            {tab === 'Duels' && <DuelsMatrix matchId={matchId} mapIndex={map.index} map={map} team1={team1} team2={team2} />}
        </div>
    );
}

function ScoreboardTab({ map, team1, team2 }: { map: MapData; team1: MatchTeam; team2: MatchTeam }) {
    return (
        <div className="space-y-6">
            <RoundStrip rounds={map.rounds || []} team1Id={team1.id} />
            <div className="grid md:grid-cols-2 gap-8">
                {[team1, team2].map((team) => {
                    const rows = map.stats.filter((s: any) => s.team_id === team.id);
                    return (
                        <div key={team.id} className="glass p-6 border border-white/5 rounded">
                            <h5 className="font-display text-lg font-bold uppercase tracking-wider mb-4">{team.name} Scoreboard</h5>
                            <div className="space-y-3">
                                <div className="grid grid-cols-[repeat(14,minmax(0,1fr))] gap-2 text-[10px] font-black uppercase tracking-widest text-foreground/40">
                                    <div className="col-span-2">Player</div>
                                    <div>Agent</div>
                                    <div>ACS</div>
                                    <div>K</div>
                                    <div>D</div>
                                    <div>A</div>
                                    <div>+/-</div>
                                    <div>K/D</div>
                                    <div>ADR</div>
                                    <div>KAST</div>
                                    <div>HS%</div>
                                    <div>FK</div>
                                    <div>MK</div>
                                    <div>Sub</div>
                                </div>
                                {rows.map((r: any, i: number) => {
                                    const plusMinus = (r.kills || 0) - (r.deaths || 0);
                                    const kd = r.deaths > 0 ? (r.kills / r.deaths) : r.kills;
                                    return (
                                        <div key={`${r.player_id}-${i}`} className="grid grid-cols-[repeat(14,minmax(0,1fr))] gap-2 items-center text-[11px]">
                                            <a href={`/players?player_id=${r.player_id}`} className="col-span-2 hover:text-val-blue underline truncate">{r.player_name}</a>
                                            <div className="text-foreground/80">{r.agent}</div>
                                            <div className="text-val-blue font-bold">{Math.round(r.acs)}</div>
                                            <div>{r.kills}</div>
                                            <div className="text-val-red">{r.deaths}</div>
                                            <div>{r.assists}</div>
                                            <div className={plusMinus > 0 ? 'text-val-blue font-bold' : plusMinus < 0 ? 'text-val-red font-bold' : 'text-foreground/40'}>
                                                {plusMinus > 0 ? `+${plusMinus}` : plusMinus}
                                            </div>
                                            <div>{kd.toFixed(1)}</div>
                                            <div>{Math.round(r.adr)}</div>
                                            <div>{Math.round(r.kast)}%</div>
                                            <div>{Math.round(r.hs_pct)}%</div>
                                            <div className="text-val-blue font-bold">{r.fk || 0}</div>
                                            <div>{r.mk || 0}</div>
                                            <div className={`${r.is_sub ? 'text-val-red' : 'text-foreground/20'}`}>{r.is_sub ? "Sub" : "-"}</div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

function EconomyTab({ map, team1, team2 }: { map: MapData; team1: MatchTeam; team2: MatchTeam }) {
    const [mode, setMode] = useState<'bank' | 'loadout' | 'total'>('loadout');
    const rounds = map.rounds || [];
    const hasBank = rounds.some((r: any) => r.bank_t1 != null || r.bank_t2 != null);

    return (
        <div className="space-y-6">
            {hasBank && (
                <div className="flex justify-end">
                    <div className="flex bg-white/5 p-1 rounded-lg border border-white/10">
                        {(['bank', 'loadout', 'total'] as const).map(m => (
                            <button
                                key={m}
                                onClick={() => setMode(m)}
                                className={`px-4 py-2 rounded-md text-xs font-bold uppercase tracking-widest transition-all ${mode === m ? 'bg-val-red text-white' : 'text-foreground/40 hover:text-foreground'}`}
                            >
                                {m}
                            </button>
                        ))}
                    </div>
                </div>
            )}
            <EconomyChart rounds={rounds} team1_id={team1.id} mode={hasBank ? mode : 'loadout'} />

            <div className="glass p-6 border border-white/5 rounded">
                <h5 className="font-display text-lg font-bold uppercase tracking-wider mb-4">Round Breakdown</h5>
                <div className="overflow-x-auto">
                    <div className="min-w-[600px] grid grid-cols-6 gap-4 text-[10px] font-black uppercase tracking-widest text-foreground/40 pb-2 border-b border-white/10">
                        <div>Round</div>
                        <div>Winner</div>
                        <div>Type</div>
                        <div>Plant/Defuse</div>
                        <div className="text-right">T1 Economy</div>
                        <div className="text-right">T2 Economy</div>
                    </div>
                    <div className="divide-y divide-white/5 max-h-64 overflow-y-auto pr-2">
                        {rounds.map((r: any) => (
                            <div key={r.round_number} className="grid grid-cols-6 gap-4 py-2 text-[11px] items-center">
                                <div className="font-bold">Round {r.round_number}</div>
                                <div className={r.winning_team_id === team1.id ? 'text-val-blue font-bold' : 'text-val-red font-bold'}>
                                    {r.winning_team_id === team1.id ? team1.tag : team2.tag}
                                </div>
                                <div className="text-foreground/60">{r.win_type}</div>
                                <div className="text-foreground/40">{r.plant ? (r.defuse ? "✓ Plant + Defuse" : "✓ Plant") : "-"}</div>
                                <div className="text-right font-mono text-val-blue/80">${r.economy_t1.toLocaleString()}</div>
                                <div className="text-right font-mono text-val-red/80">${r.economy_t2.toLocaleString()}</div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
