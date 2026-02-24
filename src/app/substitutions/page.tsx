import Link from 'next/link';
import Navbar from '@/components/Navbar';
import SubstitutionView from '@/components/SubstitutionView';
import { getSubstitutionAnalytics } from '@/lib/data';

export const revalidate = 900; // Revalidate every 15 minutes

export default async function SubstitutionsPage({
    searchParams,
}: {
    searchParams: { type?: string };
}) {
    const matchType = searchParams.type === 'playoff' ? 'playoff' : searchParams.type === 'regular' ? 'regular' : undefined;
    const analytics = await getSubstitutionAnalytics(matchType);

    return (
        <div className="min-h-screen">
            <Navbar />

            <main className="max-w-7xl mx-auto px-6 pt-32 pb-20">
                <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-12">
                    <div>
                        <h1 className="font-display text-4xl md:text-6xl font-black uppercase tracking-tighter mb-3 animate-slide-in">
                            Substitution <span className="text-val-yellow">Analytics</span>
                        </h1>
                        <p className="text-foreground/60 text-lg max-w-2xl">
                            Identify the impact of substitutes on team performance, win rates, and individual contributions across the league.
                        </p>
                    </div>

                    {/* Match Type Toggle */}
                    <div className="flex bg-white/5 p-1 rounded-lg border border-white/10">
                        <Link
                            href="/substitutions"
                            className={`px-4 py-2 rounded-md text-xs font-bold uppercase tracking-widest transition-all ${!matchType ? 'bg-val-yellow text-black shadow-lg shadow-val-yellow/20' : 'text-foreground/40 hover:text-foreground'}`}
                        >
                            All
                        </Link>
                        <Link
                            href="/substitutions?type=regular"
                            className={`px-4 py-2 rounded-md text-xs font-bold uppercase tracking-widest transition-all ${matchType === 'regular' ? 'bg-val-yellow text-black shadow-lg shadow-val-yellow/20' : 'text-foreground/40 hover:text-foreground'}`}
                        >
                            Regular
                        </Link>
                        <Link
                            href="/substitutions?type=playoff"
                            className={`px-4 py-2 rounded-md text-xs font-bold uppercase tracking-widest transition-all ${matchType === 'playoff' ? 'bg-val-yellow text-black shadow-lg shadow-val-yellow/20' : 'text-foreground/40 hover:text-foreground'}`}
                        >
                            Playoffs
                        </Link>
                    </div>
                </div>

                {analytics.teamStats.length > 0 ? (
                    <SubstitutionView data={analytics} />
                ) : (
                    <div className="glass rounded-xl p-12 border border-white/5 text-center">
                        <div className="w-16 h-16 mx-auto mb-4 bg-white/5 rounded-full flex items-center justify-center">
                            <svg className="w-8 h-8 text-foreground/20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                        </div>
                        <h3 className="text-xl font-bold mb-2">No Substitution Data</h3>
                        <p className="text-foreground/60">We couldn't find any substitution records in the database.</p>
                    </div>
                )}
            </main>
        </div>
    );
}
