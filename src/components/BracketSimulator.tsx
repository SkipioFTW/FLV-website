'use client';

import { useState, useMemo } from 'react';
import Image from 'next/image';

interface Team {
    id: number;
    name: string;
    logo: string | null;
}

interface Match {
    id: number;
    playoff_round: number;
    bracket_pos: number;
    team1: Team;
    team2: Team;
    winner_id?: number | null;
}

interface Props {
    initialMatches: Match[];
}

export default function BracketSimulator({ initialMatches }: Props) {
    const [simulatedWinners, setSimulatedWinners] = useState<Record<string, number>>({}); // "round:pos" -> winnerId

    const rounds = [
        { id: 1, name: "Play-ins", slots: 8 },
        { id: 2, name: "Round of 16", slots: 8 },
        { id: 3, name: "Quarter-finals", slots: 4 },
        { id: 4, name: "Semi-finals", slots: 2 },
        { id: 5, name: "Grand Final", slots: 1 }
    ];

    const simulatedMatches = useMemo(() => {
        const matches = new Map<string, Match>();
        initialMatches.forEach(m => matches.set(`${m.playoff_round}:${m.bracket_pos}`, { ...m }));

        // Advance logic
        for (let r = 1; r < 5; r++) {
            for (let p = 1; p <= rounds[r-1].slots; p++) {
                const key = `${r}:${p}`;
                const winnerId = simulatedWinners[key] || matches.get(key)?.winner_id;
                if (!winnerId) continue;

                const winnerTeam = initialMatches.find(m => m.team1.id === winnerId || m.team2.id === winnerId)?.team1.id === winnerId
                    ? initialMatches.find(m => m.team1.id === winnerId || m.team2.id === winnerId)?.team1
                    : initialMatches.find(m => m.team1.id === winnerId || m.team2.id === winnerId)?.team2;

                if (!winnerTeam) continue;

                if (r === 1) {
                    // R1 -> R2 (same bracket_pos)
                    const targetKey = `2:${p}`;
                    const targetMatch = matches.get(targetKey) || { id: 0, playoff_round: 2, bracket_pos: p, team1: { id: 0, name: 'TBD', logo: null }, team2: { id: 0, name: 'TBD', logo: null } };
                    targetMatch.team2 = winnerTeam;
                    matches.set(targetKey, targetMatch);
                } else {
                    // R2+ -> Sibling pairing
                    const siblingPos = p % 2 === 1 ? p + 1 : p - 1;
                    const targetPos = Math.ceil(Math.min(p, siblingPos) / 2);
                    const targetKey = `${r + 1}:${targetPos}`;
                    const targetMatch = matches.get(targetKey) || { id: 0, playoff_round: r + 1, bracket_pos: targetPos, team1: { id: 0, name: 'TBD', logo: null }, team2: { id: 0, name: 'TBD', logo: null } };

                    if (p < siblingPos) targetMatch.team1 = winnerTeam;
                    else targetMatch.team2 = winnerTeam;

                    matches.set(targetKey, targetMatch);
                }
            }
        }

        return matches;
    }, [initialMatches, simulatedWinners]);

    const handlePickWinner = (round: number, pos: number, teamId: number) => {
        setSimulatedWinners(prev => ({
            ...prev,
            [`${round}:${pos}`]: teamId
        }));
    };

    const MatchCard = ({ round, pos }: { round: number, pos: number }) => {
        const match = simulatedMatches.get(`${round}:${pos}`);
        const winnerId = simulatedWinners[`${round}:${pos}`] || match?.winner_id;

        return (
            <div className={`glass border border-white/5 p-3 rounded transition-all duration-300 ${winnerId ? 'border-val-red/30 bg-val-red/5' : 'hover:border-white/20 hover:bg-white/[0.05]'}`}>
                {/* Team 1 */}
                <button
                    onClick={() => match?.team1.id && handlePickWinner(round, pos, match.team1.id)}
                    className={`w-full flex items-center justify-between mb-1.5 p-1 rounded transition-colors ${winnerId === match?.team1.id ? 'bg-val-blue/20' : 'hover:bg-white/5'}`}
                    disabled={!match?.team1.id}
                >
                    <div className="flex items-center gap-2">
                        <div className="w-6 h-6 bg-white/5 rounded-sm p-0.5 relative flex-shrink-0">
                            {match?.team1.logo && <Image src={match.team1.logo} alt="" fill className="object-contain" />}
                        </div>
                        <span className={`text-[10px] font-black uppercase tracking-tight ${winnerId === match?.team1.id ? 'text-val-blue' : 'text-foreground/60'}`}>
                            {match?.team1.name || "TBD"}
                        </span>
                    </div>
                </button>

                <div className="h-px bg-white/5 mb-1.5" />

                {/* Team 2 */}
                <button
                    onClick={() => match?.team2.id && handlePickWinner(round, pos, match.team2.id)}
                    className={`w-full flex items-center justify-between p-1 rounded transition-colors ${winnerId === match?.team2.id ? 'bg-val-red/20' : 'hover:bg-white/5'}`}
                    disabled={!match?.team2.id}
                >
                    <div className="flex items-center gap-2">
                        <div className="w-6 h-6 bg-white/5 rounded-sm p-0.5 relative flex-shrink-0">
                            {match?.team2.logo && <Image src={match.team2.logo} alt="" fill className="object-contain" />}
                        </div>
                        <span className={`text-[10px] font-black uppercase tracking-tight ${winnerId === match?.team2.id ? 'text-val-red' : 'text-foreground/60'}`}>
                            {match?.team2.name || "TBD"}
                        </span>
                    </div>
                </button>
            </div>
        );
    };

    return (
        <div className="min-w-[1400px] flex gap-4 px-4 items-stretch pb-12">
            {rounds.map((round) => (
                <div key={round.id} className="flex-1 flex flex-col min-w-0" style={{ maxWidth: round.id === 1 ? '180px' : undefined }}>
                    <h2 className="font-display text-[10px] font-black text-val-blue uppercase italic text-center mb-6 tracking-[0.2em] whitespace-nowrap opacity-60">
                        {round.name}
                    </h2>

                    <div className="flex-1 flex flex-col justify-around gap-4">
                        {Array.from({ length: round.slots }).map((_, idx) => (
                            <div key={`${round.id}-${idx + 1}`} className="relative">
                                <MatchCard round={round.id} pos={idx + 1} />
                                {round.id < 5 && (
                                    <div className="absolute -right-2 top-1/2 w-2 h-px bg-white/10" />
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            ))}
        </div>
    );
}
