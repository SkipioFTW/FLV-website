import Navbar from "@/components/Navbar";
import PlayoffsTabs from "@/components/PlayoffsTabs";
import { getPlayoffMatches, getDefaultSeason } from "@/lib/data";

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function PlayoffsPage(props: {
    searchParams: Promise<{ season?: string }>;
}) {
    const searchParams = await props.searchParams;
    const seasonId = searchParams.season || await getDefaultSeason();
    const matches = await getPlayoffMatches(seasonId);

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
                </header>

                {matches.length > 0 ? (
                    <PlayoffsTabs matches={matches} />
                ) : (
                    <div className="glass rounded-xl p-20 text-center border border-white/5 shadow-2xl max-w-4xl mx-auto">
                        <div className="w-20 h-20 bg-val-red/10 rounded-full flex items-center justify-center mx-auto mb-6">
                            <svg className="w-10 h-10 text-val-red" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                            </svg>
                        </div>
                        <h3 className="font-display text-3xl font-black italic text-white uppercase mb-4 tracking-tighter">
                            {seasonId === 'all' ? 'Career Data' : `No Playoffs for Season ${seasonId.replace('S', '')}`}
                        </h3>
                        <p className="text-foreground/40 font-medium">
                            Playoff brackets have not been constructed for this season. Please check back later!
                        </p>
                    </div>
                )}
            </main>
        </div>
    );
}
