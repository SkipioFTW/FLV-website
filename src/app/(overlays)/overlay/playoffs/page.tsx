import { getPlayoffMatches, getDefaultSeason, type PlayoffMatch } from '@/lib/data';

export const dynamic = 'force-dynamic';

function MatchCard({ match }: { match: PlayoffMatch }) {
  const t1Won = match.winner_id === match.team1.id;
  const t2Won = match.winner_id === match.team2.id;
  const isCompleted = match.status === 'completed';
  const isLive = match.status === 'live';

  return (
    <div className={`bracket-match ${isLive ? 'bracket-match--live' : ''}`}>
      {isLive && (
        <div className="live-badge">
          <span className="live-dot" />
          LIVE
        </div>
      )}
      {match.bracket_label && (
        <div className="match-label">{match.bracket_label}</div>
      )}
      <div className={`team-slot ${isCompleted && t1Won ? 'team-slot--winner' : ''} ${isCompleted && !t1Won && match.winner_id ? 'team-slot--loser' : ''}`}>
        <span className="team-name">{match.team1.name}</span>
        {isCompleted && <span className="team-score">{match.team1.score}</span>}
      </div>
      <div className="slot-divider" />
      <div className={`team-slot ${isCompleted && t2Won ? 'team-slot--winner' : ''} ${isCompleted && !t2Won && match.winner_id ? 'team-slot--loser' : ''}`}>
        <span className="team-name">{match.team2.name}</span>
        {isCompleted && <span className="team-score">{match.team2.score}</span>}
      </div>
    </div>
  );
}

export default async function PlayoffsOverlay(props: {
  searchParams: Promise<{ season?: string }>;
}) {
  const searchParams = await props.searchParams;
  const seasonId = searchParams.season || await getDefaultSeason();
  const matches = await getPlayoffMatches(seasonId);

  const byRound = matches.reduce((acc, m) => {
    const r = m.playoff_round ?? 1;
    if (!acc[r]) acc[r] = [];
    acc[r].push(m);
    return acc;
  }, {} as Record<number, PlayoffMatch[]>);

  const rounds = Object.keys(byRound).map(Number).sort((a, b) => a - b);
  const roundLabels: Record<number, string> = { 1: 'Quarter-Finals', 2: 'Semi-Finals', 3: 'Grand Final' };

  return (
    <div className="w-screen h-screen bg-transparent flex items-center justify-center overflow-hidden">
      <div className="playoff-container animate-slide-up">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <div className="w-1.5 h-10 bg-val-red rounded-full" />
          <div>
            <div className="text-val-red font-display text-xs font-bold uppercase tracking-[0.3em] opacity-80">
              Season {seasonId.replace('S', '')}
            </div>
            <h1 className="font-display text-3xl font-black uppercase tracking-wider text-white">
              Championship Bracket
            </h1>
          </div>
        </div>

        {matches.length === 0 ? (
          <div className="text-gray-500 italic py-8 text-center font-display text-lg">
            Playoffs not yet started for {seasonId}
          </div>
        ) : (
          <div className="bracket-grid" style={{ gridTemplateColumns: `repeat(${rounds.length}, 1fr)` }}>
            {rounds.map((round) => (
              <div key={round} className="bracket-round">
                <div className="round-label">{roundLabels[round] ?? `Round ${round}`}</div>
                <div className="bracket-matches">
                  {(byRound[round] || []).sort((a, b) => (a.bracket_pos ?? 0) - (b.bracket_pos ?? 0)).map(m => (
                    <MatchCard key={m.id} match={m} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Footer */}
        <div className="mt-6 flex items-center gap-2 opacity-40">
          <div className="h-px flex-1 bg-white/20" />
          <span className="text-white text-xs font-display uppercase tracking-widest">FLV League</span>
          <div className="h-px flex-1 bg-white/20" />
        </div>
      </div>

      <style>{`
        .playoff-container {
          background: rgba(8, 14, 20, 0.88);
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
          border: 1px solid rgba(255,255,255,0.08);
          border-top: 2px solid #FF4655;
          border-radius: 12px;
          padding: 32px 40px;
          min-width: 700px;
          max-width: 1200px;
          box-shadow: 0 32px 64px rgba(0,0,0,0.6);
        }
        .bracket-grid { display: grid; gap: 24px; }
        .bracket-round { display: flex; flex-direction: column; gap: 12px; }
        .round-label { font-family: 'Orbitron', sans-serif; font-size: 11px; font-weight: 700; letter-spacing: 0.15em; text-transform: uppercase; color: rgba(255,255,255,0.35); margin-bottom: 8px; text-align: center; }
        .bracket-matches { display: flex; flex-direction: column; gap: 12px; justify-content: center; height: 100%; }
        .bracket-match { background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); border-radius: 8px; overflow: hidden; position: relative; }
        .bracket-match--live { border-color: rgba(255,70,85,0.5); box-shadow: 0 0 20px rgba(255,70,85,0.15); }
        .live-badge { position: absolute; top: 6px; right: 8px; display: flex; align-items: center; gap: 4px; font-size: 10px; font-weight: 700; font-family: 'Orbitron', sans-serif; color: #FF4655; letter-spacing: 0.1em; }
        .live-dot { width: 6px; height: 6px; border-radius: 50%; background: #FF4655; animation: pulse 1s ease-in-out infinite; }
        .match-label { padding: 4px 12px; font-size: 10px; font-family: 'Orbitron', sans-serif; color: rgba(255,255,255,0.3); letter-spacing: 0.1em; border-bottom: 1px solid rgba(255,255,255,0.04); }
        .team-slot { display: flex; justify-content: space-between; align-items: center; padding: 10px 12px; font-family: 'Montserrat', sans-serif; }
        .team-slot--winner { background: rgba(63,209,255,0.08); }
        .team-slot--winner .team-name { color: #3FD1FF; font-weight: 700; }
        .team-slot--loser .team-name { color: rgba(255,255,255,0.3); }
        .team-name { font-size: 14px; font-weight: 600; color: white; }
        .team-score { font-family: 'Orbitron', sans-serif; font-size: 16px; font-weight: 900; color: white; }
        .slot-divider { height: 1px; background: rgba(255,255,255,0.05); margin: 0; }
        @keyframes pulse { 0%,100%{opacity:1}50%{opacity:0.4} }
        @keyframes slide-up { from{opacity:0;transform:translateY(24px)}to{opacity:1;transform:translateY(0)} }
        .animate-slide-up { animation: slide-up 0.5s cubic-bezier(0.22,1,0.36,1) both; }
      `}</style>
    </div>
  );
}
