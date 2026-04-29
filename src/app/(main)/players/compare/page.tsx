import Navbar from '@/components/Navbar';
import PlayerComparison from '@/components/PlayerComparison';
import { getPlayers, getDefaultSeason } from '@/lib/data';

export const dynamic = 'force-dynamic';

export default async function PlayerComparePage(props: {
    searchParams: Promise<{ season?: string }>;
}) {
    const searchParams = await props.searchParams;
    const seasonId = searchParams.season || await getDefaultSeason();
    const players = await getPlayers(seasonId);

    return (
        <div className="min-h-screen">
            <Navbar />

            <main className="max-w-7xl mx-auto px-6 pt-32 pb-20">
                <div className="mb-12">
                    <h1 className="font-display text-4xl md:text-6xl font-black uppercase tracking-tighter mb-3 animate-slide-in">
                        Player <span className="text-val-red">Comparison</span>
                    </h1>
                    <p className="text-foreground/60 text-lg max-w-2xl">
                        Compare head-to-head statistics and skill profiles between any two players in the league.
                    </p>
                </div>

                <PlayerComparison players={players} seasonId={seasonId} />
            </main>
        </div>
    );
}
