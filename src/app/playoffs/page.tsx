import Navbar from "@/components/Navbar";
import PlayoffsTabs from "@/components/PlayoffsTabs";
import { getPlayoffMatches } from "@/lib/data";

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function PlayoffsPage() {
    const matches = await getPlayoffMatches();

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

                <PlayoffsTabs matches={matches} />
            </main>
        </div>
    );
}
