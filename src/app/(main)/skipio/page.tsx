import { getSkipioLeaderboard, getSkipioTier } from '@/lib/data';
import Link from 'next/link';

export const revalidate = 60; // Revalidate every minute

function getRankIcon(rank: string | null) {
  if (!rank) return "⬜";
  const upper = rank.toUpperCase();
  if (upper.includes("RADIANT")) return "🔺";
  if (upper.includes("IMMORTAL")) return "💜";
  if (upper.includes("ASCENDANT")) return "💚";
  if (upper.includes("DIAMOND")) return "💎";
  if (upper.includes("PLATINUM")) return "🔷";
  if (upper.includes("GOLD")) return "🥇";
  if (upper.includes("SILVER")) return "🥈";
  if (upper.includes("BRONZE")) return "🥉";
  if (upper.includes("IRON")) return "⬜";
  return "🎯";
}

const RANK_TIERS = ["All", "Radiant", "Immortal", "Ascendant", "Diamond", "Platinum", "Gold", "Silver", "Bronze", "Iron"];

export default async function SkipioLeaderboardPage(props: {
  searchParams: Promise<{ rank?: string }>;
}) {
  const searchParams = await props.searchParams;
  const currentRank = searchParams.rank || "All";
  const leaderboard = await getSkipioLeaderboard(currentRank);

  return (
    <div className="min-h-screen bg-val-bg text-white pb-20 pt-16">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Header Section */}
        <div className="mb-8">
          <Link href="/" className="inline-flex items-center text-gray-400 hover:text-val-red transition-colors mb-4 group">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4 mr-2 transform group-hover:-translate-x-1 transition-transform">
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
            </svg>
            <span className="font-display tracking-widest text-sm uppercase">Back to Hub</span>
          </Link>
          <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-6 gap-4 border-b border-white/10 pb-6">
            <div>
              <h1 className="text-4xl md:text-5xl font-display font-black text-white uppercase tracking-tight">
                Skipio <span className="text-val-blue">ELO Rating</span>
              </h1>
              <p className="mt-2 text-gray-400 font-sans max-w-2xl">
                The Skipio Indicator is a rank-relative historical ELO system. 
                Your score rises when you outperform players at your own rank tier.
              </p>
            </div>
            <div className="flex flex-col items-end gap-2">
              <span className="font-display text-[10px] tracking-[0.2em] text-gray-500 uppercase">Filter by Rank</span>
              <div className="flex flex-wrap gap-2 justify-end">
                {RANK_TIERS.map(rank => (
                  <Link
                    key={rank}
                    href={rank === "All" ? "/skipio" : `/skipio?rank=${rank}`}
                    className={`px-3 py-1 text-[10px] font-black uppercase tracking-widest rounded-full border transition-all ${
                      currentRank === rank 
                        ? "bg-val-red border-val-red text-white" 
                        : "bg-white/5 border-white/10 text-gray-400 hover:border-white/30"
                    }`}
                  >
                    {rank}
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          {/* Leaderboard Table */}
          <div className="lg:col-span-3 bg-[#111111] border border-white/10 rounded-xl overflow-hidden shadow-2xl h-fit">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-black/40 border-b border-white/10 font-display text-xs tracking-widest uppercase text-gray-500">
                    <th className="px-6 py-4 font-semibold w-16 text-center">#</th>
                    <th className="px-6 py-4 font-semibold">Player</th>
                    <th className="px-6 py-4 font-semibold">Rank</th>
                    <th className="px-6 py-4 font-semibold text-center">Performance</th>
                    <th className="px-6 py-4 font-semibold text-right text-val-blue">ELO</th>
                  </tr>
                </thead>
                <tbody className="font-sans">
                  {leaderboard.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-6 py-12 text-center text-gray-500">
                        No players found for rank "{currentRank}".
                      </td>
                    </tr>
                  ) : (
                    leaderboard.map((entry, index) => {
                      const isTop3 = index < 3 && currentRank === "All";
                      const rankStr = (index + 1).toString();
                      const tier = getSkipioTier(entry.elo);
                      
                      return (
                        <tr 
                          key={entry.playerId} 
                          className={`
                            border-b border-white/5 transition-colors hover:bg-white/5
                            ${isTop3 && index === 0 ? 'bg-yellow-500/5' : ''}
                          `}
                        >
                          <td className="px-6 py-4">
                            <div className={`
                              w-7 h-7 rounded-full flex items-center justify-center font-display font-bold text-[11px] mx-auto
                              ${isTop3 && index === 0 ? 'bg-yellow-500 text-black' : 'text-gray-500 bg-white/5'}
                            `}>
                              {rankStr}
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <div>
                              <div className="font-display font-bold text-white tracking-wider flex items-center gap-2">
                                {entry.name}
                                <span className="text-[9px] font-sans font-normal px-1.5 py-0.5 rounded-sm bg-white/10 text-gray-400">
                                  {entry.team}
                                </span>
                              </div>
                              <div className="text-[11px] text-gray-500 font-mono uppercase">{entry.riotId}</div>
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex items-center gap-2 text-gray-300">
                              <span className="text-lg" title={entry.rank}>{getRankIcon(entry.rank)}</span>
                              <span className="text-xs uppercase tracking-wider font-display opacity-60">{entry.rank}</span>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-center">
                            <span className={`text-[10px] font-black uppercase tracking-[0.15em] px-2 py-1 rounded-sm bg-white/5 ${tier.color}`}>
                              {tier.label}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-right">
                            <span className={`
                              font-display font-black text-lg tracking-wider
                              ${isTop3 && index === 0 ? 'text-yellow-400' : 'text-val-blue'}
                            `}>
                              {entry.elo}
                            </span>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Sidebar / Guide */}
          <div className="space-y-6">
            <div className="glass border border-white/10 rounded-xl p-6">
              <h3 className="font-display font-bold text-sm uppercase tracking-widest mb-4 text-val-blue">Rating Guide</h3>
              <div className="space-y-4">
                {[
                  { range: "1400+", label: "Godlike", color: "text-orange-500" },
                  { range: "1200 - 1400", label: "Elite", color: "text-val-blue" },
                  { range: "1050 - 1200", label: "Strong", color: "text-green-500" },
                  { range: "950 - 1050", label: "Baseline", color: "text-gray-300" },
                  { range: "850 - 950", label: "Below Avg", color: "text-orange-300" },
                  { range: "< 850", label: "Struggling", color: "text-red-500" },
                ].map((t) => (
                  <div key={t.label} className="flex justify-between items-center text-[11px]">
                    <span className="text-gray-500 font-mono">{t.range}</span>
                    <span className={`font-black uppercase tracking-wider ${t.color}`}>{t.label}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="glass border border-white/10 rounded-xl p-6">
              <h3 className="font-display font-bold text-sm uppercase tracking-widest mb-4 text-val-red">How it works</h3>
              <div className="text-[11px] text-gray-400 leading-relaxed space-y-3 font-sans">
                <p>
                  1. Every match appearance is scored using a weighted formula (ACS 40%, K/D 30%, ADR 20%, KAST 10%).
                </p>
                <p>
                  2. Your score is compared to the <strong>average of all players in your rank tier</strong>.
                </p>
                <p>
                  3. If you outperform your peers, your ELO rises from the 1000 baseline.
                </p>
                <p>
                  4. The calculation includes <strong>all historical matches</strong> for a true career indicator.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
