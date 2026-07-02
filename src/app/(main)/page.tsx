import Navbar from "@/components/Navbar";
import { getGlobalStatsCached as getGlobalStats, getDefaultSeasonCached as getDefaultSeason, getLeaderboardCached as getLeaderboard, getStandingsCached as getStandings } from '@/lib/data';
import LandingClient from './LandingClient';

export const revalidate = 60;

export default async function Home(props: {
    searchParams: Promise<{ season?: string }>;
}) {
    const searchParams = await props.searchParams;
    const seasonId = searchParams.season || await getDefaultSeason();
    const stats = await getGlobalStats(seasonId);

    // Fetch highlight data
    let topPlayer = { name: "—", team: "—", value: "—", label: "Top ACS" };
    let bestTeam = { name: "—", value: "—", label: "Most Wins" };
    let seasonNumber = seasonId.replace('S', '');

    try {
        const leaderboard = await getLeaderboard(3, undefined, seasonId);
        if (leaderboard.length > 0) {
            const best = leaderboard.sort((a, b) => b.avg_acs - a.avg_acs)[0];
            topPlayer = {
                name: best.name,
                team: best.team,
                value: best.avg_acs.toFixed(1),
                label: "Avg ACS",
            };
        }

        const standings = await getStandings(seasonId);
        let bestW = { name: "—", wins: 0 };
        standings.forEach((teams) => {
            teams.forEach((t) => {
                if (t.Wins > bestW.wins) bestW = { name: t.name, wins: t.Wins };
            });
        });
        if (bestW.wins > 0) {
            bestTeam = { name: bestW.name, value: `${bestW.wins}W`, label: "Most Wins" };
        }
    } catch {
        // Graceful fallback — highlights stay as dashes
    }

    return (
        <div className="flex flex-col min-h-screen">
            <Navbar />
            <LandingClient
                seasonNumber={seasonNumber}
                stats={stats}
                topPlayer={topPlayer}
                bestTeam={bestTeam}
            />
        </div>
    );
}
