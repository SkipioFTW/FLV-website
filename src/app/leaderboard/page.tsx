import { getLeaderboard } from '@/lib/data';
import Navbar from '@/components/Navbar';
import LeaderboardFilters from '@/components/LeaderboardFilters';
import Link from 'next/link';

export const revalidate = 900; // Revalidate every 15 minutes

export default async function LeaderboardPage({
    searchParams,
}: {
    searchParams: { type?: string };
}) {
    const matchType = searchParams.type === 'playoff' ? 'playoff' : searchParams.type === 'regular' ? 'regular' : undefined;
    const leaderboard = await getLeaderboard(0, matchType);

    return (
        <div className="min-h-screen">
            <Navbar />

            <main className="max-w-7xl mx-auto px-6 pt-32 pb-20">
                <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-12">
                    <div>
                        <h1 className="font-display text-4xl md:text-6xl font-black uppercase tracking-tighter mb-3">
                            Player <span className="text-val-blue">Leaderboard</span>
                        </h1>
                        <p className="text-foreground/60 text-lg">
                            Top performers ranked by Average Combat Score
                        </p>
                    </div>

                    {/* Match Type Toggle */}
                    <div className="flex bg-white/5 p-1 rounded-lg border border-white/10">
                        <Link
                            href="/leaderboard"
                            className={`px-4 py-2 rounded-md text-xs font-bold uppercase tracking-widest transition-all ${!matchType ? 'bg-val-blue text-white shadow-lg shadow-val-blue/20' : 'text-foreground/40 hover:text-foreground'}`}
                        >
                            All
                        </Link>
                        <Link
                            href="/leaderboard?type=regular"
                            className={`px-4 py-2 rounded-md text-xs font-bold uppercase tracking-widest transition-all ${matchType === 'regular' ? 'bg-val-blue text-white shadow-lg shadow-val-blue/20' : 'text-foreground/40 hover:text-foreground'}`}
                        >
                            Regular
                        </Link>
                        <Link
                            href="/leaderboard?type=playoff"
                            className={`px-4 py-2 rounded-md text-xs font-bold uppercase tracking-widest transition-all ${matchType === 'playoff' ? 'bg-val-blue text-white shadow-lg shadow-val-blue/20' : 'text-foreground/40 hover:text-foreground'}`}
                        >
                            Playoffs
                        </Link>
                    </div>
                </div>

                <LeaderboardFilters players={leaderboard} />
            </main>
        </div>
    );
}
