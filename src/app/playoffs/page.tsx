import Navbar from "@/components/Navbar";
import { getPlayoffMatches } from "@/lib/data";
import Image from "next/image";

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function PlayoffsPage() {
    const matches = await getPlayoffMatches();

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

    const MatchCard = ({ match, compact }: { match: ReturnType<typeof getMatchAt>; compact?: boolean }) => (
        <div className={`glass border-white/5 ${compact ? 'p-2' : 'p-3'} rounded-sm transition-all duration-300 hover:border-val-red/30 hover:bg-white/[0.05]`}>
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
        <div className="flex flex-col min-h-screen bg-background">
            <Navbar />

            <main className="flex-1 w-full px-6 py-32 overflow-x-auto">
                <header className="max-w-7xl mx-auto w-full mb-12">
                    <h1 className="font-display text-4xl md:text-6xl font-black italic text-val-red uppercase tracking-tighter mb-4 text-center">
                        Championship Brackets
                    </h1>
                    <p className="text-foreground/60 max-w-2xl mx-auto font-medium text-center">
                        The ultimate battle for glory. Track the progression of the top teams as they fight through the elimination rounds.
                    </p>
                    <div className="flex justify-center gap-6 mt-6 text-[10px] font-black uppercase tracking-widest text-foreground/30">
                        <span className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-val-blue inline-block" /> BYE (Top 2 per group)</span>
                        <span className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-val-red inline-block" /> Play-ins (#3-#6)</span>
                    </div>
                </header>

                <div className="min-w-[1400px] flex gap-2 px-4 items-stretch">
                    {rounds.map((round) => (
                        <div key={round.id} className="flex-1 flex flex-col min-w-0" style={{ maxWidth: round.id === 1 ? '180px' : undefined }}>
                            <h2 className="font-display text-sm font-black text-val-blue uppercase italic text-center mb-6 tracking-widest whitespace-nowrap">
                                {round.name}
                            </h2>

                            <div className="flex-1 flex flex-col justify-around gap-2">
                                {Array.from({ length: round.slots }).map((_, idx) => {
                                    const pos = idx + 1;
                                    const match = getMatchAt(round.id, pos);

                                    /* For Round 2, show BYE badge when only team1 (the BYE seed) is filled */
                                    const isBye = round.id === 2 && match && (match.team1.id && !match.team2.id);

                                    return (
                                        <div
                                            key={`${round.id}-${pos}`}
                                            className={`relative ${match ? 'opacity-100' : 'opacity-30'}`}
                                        >
                                            {isBye && (
                                                <div className="absolute -top-3 right-0 text-[8px] font-black uppercase tracking-widest text-val-blue/60 bg-val-blue/10 px-1.5 py-0.5 rounded-sm">
                                                    BYE
                                                </div>
                                            )}
                                            <MatchCard match={match} compact={round.id === 1} />

                                            {/* Connector line to next round */}
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
            </main>
        </div>
    );
}
