import { getStandings, getMetaAnalytics, getDefaultSeason } from '@/lib/data';
import Navbar from '@/components/Navbar';
import StandingsTabs from '@/components/StandingsTabs';

export const dynamic = 'force-dynamic';

export default async function StandingsPage(props: {
    searchParams: Promise<{ season?: string }>;
}) {
    const searchParams = await props.searchParams;
    const seasonId = searchParams.season || await getDefaultSeason();
    const groupedStandings = await getStandings(seasonId);
    const metaData = await getMetaAnalytics(seasonId);

    return (
        <div className="min-h-screen">
            <Navbar />

            <main className="max-w-7xl mx-auto px-6 pt-32 pb-20">
                <div className="mb-12">
                    <h1 className="font-display text-4xl md:text-6xl font-black uppercase tracking-tighter mb-3">
                        <span className="text-val-red">{seasonId === 'all' ? 'All Time' : `Season ${seasonId.replace('S', '')}`}</span> Standings
                    </h1>
                    <p className="text-foreground/60 text-lg">
                        Current tournament rankings and league-wide meta analytics
                    </p>
                </div>

                <StandingsTabs groupedStandings={groupedStandings} metaData={metaData} />
            </main>
        </div>
    );
}
