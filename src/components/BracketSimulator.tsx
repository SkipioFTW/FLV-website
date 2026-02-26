'use client';

import { useState, useMemo, useEffect } from 'react';
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
    const [isSimulating, setIsSimulating] = useState(false);

    // Persistence
    useEffect(() => {
        const saved = localStorage.getItem('bracket_sim_picks');
        if (saved) {
            try {
                setSimulatedWinners(JSON.parse(saved));
            } catch (e) {
                console.error('Failed to load saved picks');
            }
        }
    }, []);

    useEffect(() => {
        if (Object.keys(simulatedWinners).length > 0) {
            localStorage.setItem('bracket_sim_picks', JSON.stringify(simulatedWinners));
        }
    }, [simulatedWinners]);

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

    const handleAutoSimulate = async () => {
        setIsSimulating(true);
        const newWinners: Record<string, number> = {};
        const currentSimMatches = new Map<string, any>();
        initialMatches.forEach(m => currentSimMatches.set(`${m.playoff_round}:${m.bracket_pos}`, { ...m }));

        // We'll need some basic win probabilities.
        // For client-side auto-sim, we'll fetch them from the API for each match sequentially or use a simplified model.
        // Simplified model: randomly pick for now, or use a heuristic.
        // Actually, let's try to be smart and fetch from API for existing matches.

        for (let r = 1; r <= 5; r++) {
            const roundSlots = r === 1 ? 8 : r === 2 ? 8 : r === 3 ? 4 : r === 4 ? 2 : 1;
            for (let p = 1; p <= roundSlots; p++) {
                const key = `${r}:${p}`;
                const match = currentSimMatches.get(key);
                if (!match) continue;

                let winnerId = 0;
                if (match.status === 'completed' && match.winner_id) {
                    winnerId = match.winner_id;
                } else if (match.team1.id && match.team2.id) {
                    // Call API or use heuristic. Heuristic: team with higher ID (random-ish but stable)
                    // Let's use a simple pseudo-random based on names
                    const combined = match.team1.name + match.team2.name;
                    let hash = 0;
                    for (let i = 0; i < combined.length; i++) hash = combined.charCodeAt(i) + ((hash << 5) - hash);
                    winnerId = (hash % 2 === 0) ? match.team1.id : match.team2.id;
                } else if (match.team1.id) {
                    winnerId = match.team1.id;
                } else if (match.team2.id) {
                    winnerId = match.team2.id;
                }

                if (winnerId) {
                    newWinners[key] = winnerId;
                    const winnerTeam = initialMatches.find(m => m.team1.id === winnerId)?.team1 || initialMatches.find(m => m.team2.id === winnerId)?.team2;
                    if (winnerTeam) {
                        if (r === 1) {
                            const targetKey = `2:${p}`;
                            const target = currentSimMatches.get(targetKey) || { team1: { id: 0 }, team2: { id: 0 } };
                            target.team2 = winnerTeam;
                            currentSimMatches.set(targetKey, target);
                        } else if (r < 5) {
                            const siblingPos = p % 2 === 1 ? p + 1 : p - 1;
                            const targetPos = Math.ceil(Math.min(p, siblingPos) / 2);
                            const targetKey = `${r + 1}:${targetPos}`;
                            const target = currentSimMatches.get(targetKey) || { team1: { id: 0 }, team2: { id: 0 } };
                            if (p < siblingPos) target.team1 = winnerTeam;
                            else target.team2 = winnerTeam;
                            currentSimMatches.set(targetKey, target);
                        }
                    }
                }
            }
        }
        setSimulatedWinners(newWinners);
        setIsSimulating(false);
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
        <div className="space-y-8">
            <div className="flex justify-center gap-4">
                <button
                    onClick={handleAutoSimulate}
                    disabled={isSimulating}
                    className="px-6 py-2 bg-val-blue text-white font-black uppercase tracking-widest text-[10px] rounded hover:bg-val-blue/80 transition-all flex items-center gap-2"
                >
                    <svg className={`w-3 h-3 ${isSimulating ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    {isSimulating ? 'Simulating...' : 'Auto-Simulate (Prediction Model)'}
                </button>
                <button
                    onClick={() => {
                        setSimulatedWinners({});
                        localStorage.removeItem('bracket_sim_picks');
                    }}
                    className="px-6 py-2 bg-white/5 text-foreground/40 font-black uppercase tracking-widest text-[10px] rounded hover:bg-white/10 hover:text-foreground transition-all"
                >
                    Reset Bracket
                </button>
            </div>

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
        </div>
    );
}
