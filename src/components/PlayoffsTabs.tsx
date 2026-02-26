'use client';

import { useState } from 'react';
import Image from 'next/image';
import BracketSimulator from './BracketSimulator';

interface Props {
    matches: any[];
}

export default function PlayoffsTabs({ matches }: Props) {
    const [activeTab, setActiveTab] = useState<'bracket' | 'simulator'>('bracket');

    const rounds = [
        { id: 1, name: "Play-ins", slots: 8 },
        { id: 2, name: "Round of 16", slots: 8 },
        { id: 3, name: "Quarter-finals", slots: 4 },
        { id: 4, name: "Semi-finals", slots: 2 },
        { id: 5, name: "Grand Final", slots: 1 }
    ];

    const getMatchAt = (roundId: number, pos: number) => {
        return matches.find(m => m.playoff_round === roundId && m.bracket_pos === pos);
    };

    const MatchCard = ({ match, compact }: { match: any; compact?: boolean }) => (
        <div className={`glass border border-white/5 ${compact ? 'p-2' : 'p-3'} rounded-sm transition-all duration-300 hover:border-val-red/30 hover:bg-white/[0.05]`}>
            {/* Team 1 */}
            <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2">
                    <div className={`${compact ? 'w-6 h-6' : 'w-8 h-8'} bg-white/5 rounded-sm p-0.5 relative flex-shrink-0`}>
                        {match?.team1.logo && (
                            <Image src={match.team1.logo} alt="" fill className="object-contain" />
                        )}
                    </div>
                    <span className={`${compact ? 'text-[10px]' : 'text-xs'} font-black uppercase tracking-tight ${match?.winner_id === match?.team1.id ? 'text-val-blue' : 'text-foreground/60'}`}>
                        {match?.team1.name || "TBD"}
                    </span>
                </div>
                <span className={`font-display font-black ${compact ? 'text-xs' : 'text-sm'} italic`}>
                    {match?.status === 'completed' ? match.team1.score : '-'}
                </span>
            </div>

            {/* Divider */}
            <div className="h-px bg-white/5 mb-1.5" />

            {/* Team 2 */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <div className={`${compact ? 'w-6 h-6' : 'w-8 h-8'} bg-white/5 rounded-sm p-0.5 relative flex-shrink-0`}>
                        {match?.team2.logo && (
                            <Image src={match.team2.logo} alt="" fill className="object-contain" />
                        )}
                    </div>
                    <span className={`${compact ? 'text-[10px]' : 'text-xs'} font-black uppercase tracking-tight ${match?.winner_id === match?.team2.id ? 'text-val-blue' : 'text-foreground/60'}`}>
                        {match?.team2.name || "TBD"}
                    </span>
                </div>
                <span className={`font-display font-black ${compact ? 'text-xs' : 'text-sm'} italic`}>
                    {match?.status === 'completed' ? match.team2.score : '-'}
                </span>
            </div>

            {/* Footer */}
            <div className="mt-1.5 pt-1.5 border-t border-white/5 flex items-center justify-between">
                <span className="text-[8px] font-black uppercase tracking-widest text-foreground/20">
                    {match?.format || 'BO3'}
                </span>
                <span className={`text-[8px] font-black uppercase tracking-widest ${match?.status === 'live' ? 'text-val-red animate-pulse' : 'text-foreground/20'}`}>
                    {match?.status || 'SCHEDULED'}
                </span>
            </div>
        </div>
    );

    return (
        <div className="space-y-12">
            <div className="flex flex-col items-center gap-8">
                <div className="flex bg-white/5 p-1 rounded-lg border border-white/10">
                    <button
                        onClick={() => setActiveTab('bracket')}
                        className={`px-8 py-3 rounded-md font-display font-black uppercase tracking-widest text-sm transition-all ${activeTab === 'bracket' ? 'bg-val-red text-white shadow-[0_0_20px_rgba(255,70,85,0.4)]' : 'text-foreground/40 hover:text-foreground'}`}
                    >
                        Live Bracket
                    </button>
                    <button
                        onClick={() => setActiveTab('simulator')}
                        className={`px-8 py-3 rounded-md font-display font-black uppercase tracking-widest text-sm transition-all ${activeTab === 'simulator' ? 'bg-val-red text-white shadow-[0_0_20px_rgba(255,70,85,0.4)]' : 'text-foreground/40 hover:text-foreground'}`}
                    >
                        Bracket Simulator
                    </button>
                </div>

                <div className="flex justify-center gap-6 text-[10px] font-black uppercase tracking-widest text-foreground/30 border-y border-white/5 py-4 w-full max-w-4xl">
                    <span className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-val-blue inline-block" /> BYE (Top 2 per group)</span>
                    <span className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-val-red inline-block" /> Play-ins (#3-#6)</span>
                    {activeTab === 'simulator' && (
                        <span className="flex items-center gap-2 text-val-yellow ml-4 italic">Pick a team to simulate their victory!</span>
                    )}
                </div>
            </div>

            {activeTab === 'bracket' ? (
                <div className="min-w-[1400px] flex gap-2 px-4 items-stretch pb-12 animate-in fade-in slide-in-from-bottom-4 duration-700">
                    {rounds.map((round) => (
                        <div key={round.id} className="flex-1 flex flex-col min-w-0" style={{ maxWidth: round.id === 1 ? '180px' : undefined }}>
                            <h2 className="font-display text-[10px] font-black text-val-blue uppercase italic text-center mb-6 tracking-[0.2em] whitespace-nowrap opacity-60">
                                {round.name}
                            </h2>

                            <div className="flex-1 flex flex-col justify-around gap-2">
                                {Array.from({ length: round.slots }).map((_, idx) => {
                                    const pos = idx + 1;
                                    const match = getMatchAt(round.id, pos);
                                    const isBye = round.id === 2 && match && (match.team1.id && !match.team2.id);

                                    return (
                                        <div key={`${round.id}-${pos}`} className={`relative ${match ? 'opacity-100' : 'opacity-30'}`}>
                                            {isBye && (
                                                <div className="absolute -top-3 right-0 text-[8px] font-black uppercase tracking-widest text-val-blue/60 bg-val-blue/10 px-1.5 py-0.5 rounded-sm">
                                                    BYE
                                                </div>
                                            )}
                                            <MatchCard match={match} compact={round.id === 1} />
                                            {round.id < 5 && (
                                                <div className="absolute -right-1 top-1/2 w-1 h-px bg-white/10" />
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    ))}
                </div>
            ) : (
                <div className="animate-in fade-in slide-in-from-bottom-4 duration-700">
                    <BracketSimulator initialMatches={matches} />
                </div>
            )}
        </div>
    );
}
