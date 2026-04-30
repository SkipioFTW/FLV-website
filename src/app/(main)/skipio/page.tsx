import { getSkipioLeaderboard, getDefaultSeason } from '@/lib/data';
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

export default async function SkipioLeaderboardPage() {
  const leaderboard = await getSkipioLeaderboard();

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
                Everyone starts at 1000. Your score rises when you outperform players at your own rank, 
                and falls when you underperform.
              </p>
            </div>
            <div className="text-right">
              <p className="font-display text-sm tracking-widest text-val-blue uppercase mb-1">Total Ranked</p>
              <p className="text-3xl font-display font-bold">{leaderboard.length}</p>
            </div>
          </div>
        </div>

        {/* Leaderboard Table */}
        <div className="bg-[#111111] border border-white/10 rounded-xl overflow-hidden shadow-2xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-black/40 border-b border-white/10 font-display text-xs tracking-widest uppercase text-gray-500">
                  <th className="px-6 py-4 font-semibold w-16 text-center">#</th>
                  <th className="px-6 py-4 font-semibold">Player</th>
                  <th className="px-6 py-4 font-semibold">Rank</th>
                  <th className="px-6 py-4 font-semibold text-center">Maps Played</th>
                  <th className="px-6 py-4 font-semibold text-center">Avg Raw Score</th>
                  <th className="px-6 py-4 font-semibold text-right text-val-blue">ELO Rating</th>
                </tr>
              </thead>
              <tbody className="font-sans">
                {leaderboard.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center text-gray-500">
                      No match data available yet.
                    </td>
                  </tr>
                ) : (
                  leaderboard.map((entry, index) => {
                    const isTop3 = index < 3;
                    const rankStr = (index + 1).toString();
                    
                    return (
                      <tr 
                        key={entry.playerId} 
                        className={`
                          border-b border-white/5 transition-colors hover:bg-white/5
                          ${index === 0 ? 'bg-yellow-500/10' : ''}
                          ${index === 1 ? 'bg-gray-400/10' : ''}
                          ${index === 2 ? 'bg-amber-700/10' : ''}
                        `}
                      >
                        <td className="px-6 py-4">
                          <div className={`
                            w-8 h-8 rounded-full flex items-center justify-center font-display font-bold text-sm mx-auto
                            ${index === 0 ? 'bg-yellow-500 text-black shadow-[0_0_15px_rgba(234,179,8,0.5)]' : ''}
                            ${index === 1 ? 'bg-gray-400 text-black' : ''}
                            ${index === 2 ? 'bg-amber-700 text-white' : ''}
                            ${!isTop3 ? 'text-gray-500' : ''}
                          `}>
                            {rankStr}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center">
                            <div>
                              <div className="font-display font-bold text-white tracking-wider flex items-center gap-2">
                                {entry.name}
                                <span className="text-xs font-sans font-normal px-2 py-0.5 rounded-sm bg-white/10 text-gray-300">
                                  {entry.team}
                                </span>
                              </div>
                              <div className="text-sm text-gray-500">{entry.riotId}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center gap-2 text-gray-300">
                            <span className="text-xl" title={entry.rank}>{getRankIcon(entry.rank)}</span>
                            <span className="text-sm">{entry.rank}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-center text-gray-400 font-mono">
                          {entry.mapsPlayed}
                        </td>
                        <td className="px-6 py-4 text-center text-gray-400 font-mono">
                          {entry.avgRawScore}
                        </td>
                        <td className="px-6 py-4 text-right">
                          <span className={`
                            font-display font-black text-xl tracking-wider
                            ${index === 0 ? 'text-yellow-400' : ''}
                            ${index === 1 ? 'text-gray-300' : ''}
                            ${index === 2 ? 'text-amber-600' : ''}
                            ${!isTop3 ? 'text-val-blue' : ''}
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
      </div>
    </div>
  );
}
