import { getStandings, getDefaultSeason, type StandingsRow } from '@/lib/data';

export const dynamic = 'force-dynamic';

export default async function StandingsOverlay(props: {
  searchParams: Promise<{ season?: string; group?: string }>;
}) {
  const searchParams = await props.searchParams;
  const seasonId = searchParams.season || await getDefaultSeason();
  const group = searchParams.group || 'Earth';

  const allStandings = await getStandings(seasonId);
  
  // Find group case-insensitively
  let teams: StandingsRow[] = [];
  for (const [key, value] of allStandings.entries()) {
    if (key.toLowerCase() === group.toLowerCase()) {
      teams = value;
      break;
    }
  }

  return (
    <div className="w-screen h-screen bg-transparent flex items-center justify-center overflow-hidden">
      <div className="overlay-container animate-slide-up">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <div className="w-1.5 h-10 bg-val-red rounded-full" />
          <div>
            <div className="text-val-red font-display text-xs font-bold uppercase tracking-[0.3em] opacity-80">
              Season {seasonId.replace('S', '')}
            </div>
            <h1 className="font-display text-3xl font-black uppercase tracking-wider text-white">
              Group {group} Standings
            </h1>
          </div>
        </div>

        {/* Table */}
        <div className="overlay-table">
          {/* Column Headers */}
          <div className="overlay-row overlay-header">
            <span className="col-rank">#</span>
            <span className="col-team">Team</span>
            <span className="col-stat">W</span>
            <span className="col-stat">L</span>
            <span className="col-stat">PD</span>
            <span className="col-stat">Pts</span>
          </div>

          {/* Team Rows */}
          {teams.map((team, i) => (
            <div
              key={team.id}
              className={`overlay-row ${i === 0 ? 'overlay-row--leader' : ''}`}
              style={{ animationDelay: `${i * 80}ms` }}
            >
              <span className="col-rank text-gray-400">{i + 1}</span>
              <span className="col-team">
                <span className="text-white font-bold">{team.name}</span>
                <span className="text-gray-400 text-sm ml-2 font-mono">{team.tag}</span>
              </span>
              <span className="col-stat text-green-400 font-bold">{team.Wins}</span>
              <span className="col-stat text-val-red font-bold">{team.Losses}</span>
              <span className={`col-stat font-bold ${team.PD >= 0 ? 'text-green-400' : 'text-val-red'}`}>
                {team.PD > 0 ? `+${team.PD}` : team.PD}
              </span>
              <span className="col-stat text-val-blue font-black">{team.Points}</span>
            </div>
          ))}

          {teams.length === 0 && (
            <div className="overlay-row text-gray-500 italic text-center justify-center py-4">
              No data for Group {group}
            </div>
          )}
        </div>

        {/* Footer watermark */}
        <div className="mt-4 flex items-center gap-2 opacity-40">
          <div className="h-px flex-1 bg-white/20" />
          <span className="text-white text-xs font-display uppercase tracking-widest">FLV League</span>
          <div className="h-px flex-1 bg-white/20" />
        </div>
      </div>

      <style>{`
        .overlay-container {
          background: rgba(8, 14, 20, 0.88);
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-top: 2px solid #FF4655;
          border-radius: 12px;
          padding: 32px 40px;
          min-width: 560px;
          box-shadow: 0 32px 64px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,70,85,0.1);
        }
        .overlay-table { display: flex; flex-direction: column; gap: 4px; }
        .overlay-header { color: rgba(255,255,255,0.3); font-size: 11px; font-weight: 600; letter-spacing: 0.12em; text-transform: uppercase; border-bottom: 1px solid rgba(255,255,255,0.06); padding-bottom: 10px; margin-bottom: 4px; }
        .overlay-row { display: flex; align-items: center; gap: 0; padding: 10px 0; border-radius: 6px; }
        .overlay-row--leader { background: rgba(255,70,85,0.06); padding: 10px 12px; margin: 0 -12px; border: 1px solid rgba(255,70,85,0.15); }
        .col-rank { width: 36px; font-family: 'Orbitron', sans-serif; font-size: 14px; }
        .col-team { flex: 1; font-family: 'Montserrat', sans-serif; font-size: 16px; }
        .col-stat { width: 52px; text-align: center; font-family: 'Orbitron', sans-serif; font-size: 15px; }

        @keyframes slide-up {
          from { opacity: 0; transform: translateY(24px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-slide-up {
          animation: slide-up 0.5s cubic-bezier(0.22, 1, 0.36, 1) both;
        }
      `}</style>
    </div>
  );
}
