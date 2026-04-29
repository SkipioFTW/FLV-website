import { getPlayerStats, getDefaultSeason, type PlayerStats } from '@/lib/data';

export const dynamic = 'force-dynamic';

function getRankLabel(rank: string): string {
  const rankMap: Record<string, string> = {
    '0': 'Iron', '1': 'Bronze', '2': 'Silver', '3': 'Gold',
    '4': 'Platinum', '5': 'Diamond', '6': 'Ascendant', '7': 'Immortal',
  };
  return rankMap[rank] ?? rank;
}

function StatBar({ label, val1, val2, higher = 'high' }: {
  label: string; val1: number; val2: number; higher?: 'high' | 'low';
}) {
  const p1Wins = higher === 'high' ? val1 > val2 : val1 < val2;
  const p2Wins = higher === 'high' ? val2 > val1 : val2 < val1;

  return (
    <div className="stat-row">
      <span className={`stat-value ${p1Wins ? 'stat-value--winner' : ''}`}>{val1.toFixed(val1 < 10 ? 2 : 0)}</span>
      <span className="stat-label">{label}</span>
      <span className={`stat-value ${p2Wins ? 'stat-value--winner' : ''}`}>{val2.toFixed(val2 < 10 ? 2 : 0)}</span>
    </div>
  );
}

export default async function PlayerComparisonOverlay(props: {
  searchParams: Promise<{ season?: string; p1?: string; p2?: string }>;
}) {
  const searchParams = await props.searchParams;
  const seasonId = searchParams.season || await getDefaultSeason();
  const p1Id = parseInt(searchParams.p1 || '0', 10);
  const p2Id = parseInt(searchParams.p2 || '0', 10);

  const [p1, p2] = await Promise.all([
    getPlayerStats(p1Id, undefined, seasonId),
    getPlayerStats(p2Id, undefined, seasonId),
  ]);

  if (!p1 || !p2) {
    return (
      <div className="w-screen h-screen bg-transparent flex items-center justify-center">
        <div className="text-white font-display text-2xl bg-black/80 p-8 rounded-xl">
          Player data not found. Check the IDs in the URL.
        </div>
      </div>
    );
  }

  return (
    <div className="w-screen h-screen bg-transparent flex items-center justify-center overflow-hidden">
      <div className="comparison-container animate-slide-up">
        {/* Header */}
        <div className="comparison-header">
          <div className="player-header player-header--left">
            <div className="player-tag">{p1.team}</div>
            <div className="player-name">{p1.name}</div>
            <div className="player-rank">{getRankLabel(p1.summary?.winRate?.toString() ?? '')}</div>
          </div>
          <div className="vs-badge">VS</div>
          <div className="player-header player-header--right">
            <div className="player-tag">{p2.team}</div>
            <div className="player-name">{p2.name}</div>
            <div className="player-rank">{getRankLabel(p2.summary?.winRate?.toString() ?? '')}</div>
          </div>
        </div>

        {/* Stats */}
        <div className="stats-panel">
          <StatBar label="ACS" val1={p1.summary.avgAcs} val2={p2.summary.avgAcs} />
          <StatBar label="K/D" val1={p1.summary.kd} val2={p2.summary.kd} />
          <StatBar label="ADR" val1={p1.summary.avgAdr ?? 0} val2={p2.summary.avgAdr ?? 0} />
          <StatBar label="KAST %" val1={p1.summary.avgKast ?? 0} val2={p2.summary.avgKast ?? 0} />
          <StatBar label="HS %" val1={p1.summary.avgHsPct ?? 0} val2={p2.summary.avgHsPct ?? 0} />
          <StatBar label="Win Rate %" val1={p1.summary.winRate} val2={p2.summary.winRate} />
        </div>

        {/* Top Agent */}
        <div className="agents-row">
          <div className="agent-chip">{p1.agents[0]?.name ?? '—'}</div>
          <span className="text-gray-500 text-xs font-display uppercase tracking-widest">Top Agent</span>
          <div className="agent-chip">{p2.agents[0]?.name ?? '—'}</div>
        </div>

        {/* Footer */}
        <div className="mt-5 flex items-center gap-2 opacity-40">
          <div className="h-px flex-1 bg-white/20" />
          <span className="text-white text-xs font-display uppercase tracking-widest">FLV League · Season {seasonId.replace('S', '')}</span>
          <div className="h-px flex-1 bg-white/20" />
        </div>
      </div>

      <style>{`
        .comparison-container {
          background: rgba(8,14,20,0.88);
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
          border: 1px solid rgba(255,255,255,0.08);
          border-top: 2px solid #FF4655;
          border-radius: 12px;
          padding: 32px 40px;
          min-width: 620px;
          max-width: 800px;
          box-shadow: 0 32px 64px rgba(0,0,0,0.6);
        }
        .comparison-header { display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: 16px; margin-bottom: 28px; }
        .player-header { display: flex; flex-direction: column; }
        .player-header--left { align-items: flex-start; }
        .player-header--right { align-items: flex-end; }
        .player-tag { font-family: 'Orbitron', sans-serif; font-size: 11px; font-weight: 700; color: #FF4655; letter-spacing: 0.15em; text-transform: uppercase; }
        .player-name { font-family: 'Orbitron', sans-serif; font-size: 20px; font-weight: 900; color: white; text-transform: uppercase; letter-spacing: 0.05em; }
        .player-rank { font-family: 'Montserrat', sans-serif; font-size: 12px; color: rgba(255,255,255,0.4); }
        .vs-badge { font-family: 'Orbitron', sans-serif; font-size: 18px; font-weight: 900; color: #FF4655; background: rgba(255,70,85,0.1); border: 1px solid rgba(255,70,85,0.25); border-radius: 50%; width: 44px; height: 44px; display: flex; align-items: center; justify-content: center; letter-spacing: 0.05em; }
        .stats-panel { display: flex; flex-direction: column; gap: 8px; }
        .stat-row { display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.04); }
        .stat-label { font-family: 'Orbitron', sans-serif; font-size: 10px; font-weight: 700; letter-spacing: 0.15em; text-transform: uppercase; color: rgba(255,255,255,0.3); text-align: center; width: 80px; }
        .stat-value { font-family: 'Orbitron', sans-serif; font-size: 16px; font-weight: 800; color: rgba(255,255,255,0.5); transition: color 0.3s; }
        .stat-value:first-child { text-align: left; }
        .stat-value:last-child { text-align: right; }
        .stat-value--winner { color: #3FD1FF; }
        .agents-row { display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; margin-top: 16px; gap: 12px; }
        .agent-chip { font-family: 'Montserrat', sans-serif; font-size: 13px; font-weight: 700; color: white; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.1); border-radius: 6px; padding: 6px 14px; }
        .agents-row .agent-chip:first-child { text-align: left; }
        .agents-row .agent-chip:last-child { text-align: right; }
        @keyframes slide-up { from{opacity:0;transform:translateY(24px)}to{opacity:1;transform:translateY(0)} }
        .animate-slide-up { animation: slide-up 0.5s cubic-bezier(0.22,1,0.36,1) both; }
      `}</style>
    </div>
  );
}
