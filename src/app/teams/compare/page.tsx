import Navbar from '@/components/Navbar';
import TeamComparison from '@/components/TeamComparison';
import { getTeams } from '@/lib/data';

export const revalidate = 900; // Revalidate every 15 minutes

export default async function TeamComparePage() {
    const teams = await getTeams();

    return (
        <div className="min-h-screen">
            <Navbar />

            <main className="max-w-7xl mx-auto px-6 pt-32 pb-20">
                <div className="mb-12">
                    <h1 className="font-display text-4xl md:text-6xl font-black uppercase tracking-tighter mb-3 animate-slide-in">
                        Team <span className="text-val-blue">Comparison</span>
                    </h1>
                    <p className="text-foreground/60 text-lg max-w-2xl">
                        Head-to-head analysis of team performance, progression charts, and roster comparisons.
                    </p>
                </div>

                <TeamComparison teams={teams} />
            </main>
        </div>
    );
}
