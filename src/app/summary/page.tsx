"use client";

import { useEffect, useState } from "react";
import Navbar from "@/components/Navbar";
import { getAllMatches, getMatchDetails } from "@/lib/data";

export default function SummaryPage() {
  const [matches, setMatches] = useState<any[]>([]);
  const [selectedWeek, setSelectedWeek] = useState<number>(1);
  const [matchId, setMatchId] = useState<number>(0);
  const [details, setDetails] = useState<{ match: any, maps: any[] } | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    getAllMatches().then(ms => {
      setMatches(ms);
      if (ms.length > 0) {
        setSelectedWeek(ms[0].week);
      }
    });
  }, []);

  const loadDetails = async () => {
    if (!matchId) return;
    setLoading(true);
    const d = await getMatchDetails(matchId);
    setDetails(d);
    setLoading(false);
  };

  const weekMatches = matches.filter(m => m.week === selectedWeek);

  return (
    <div className="flex flex-col min-h-screen bg-background text-foreground">
      <Navbar />
      <main className="flex-1 max-w-7xl mx-auto w-full px-6 py-32">
        <header className="mb-8">
          <h1 className="font-display text-4xl md:text-5xl font-black italic text-val-blue uppercase tracking-tighter">
            Match Summary
          </h1>
          <p className="text-foreground/40 font-bold uppercase tracking-widest text-xs">
            Browse match details, maps and per-map scoreboards
          </p>
        </header>

        <section className="glass p-8 space-y-6">
          <div className="grid md:grid-cols-3 gap-6">
            <div>
              <label className="text-[10px] font-black uppercase tracking-widest text-foreground/40 block mb-2">Week</label>
              <select
                value={selectedWeek}
                onChange={e => setSelectedWeek(parseInt(e.target.value))}
                className="w-full bg-white/5 border border-white/10 rounded p-2 text-sm focus:border-val-blue outline-none transition-colors"
              >
                {[1, 2, 3, 4, 5, 6].map(w => <option key={w} value={w}>Week {w}</option>)}
              </select>
            </div>
            <div className="md:col-span-2">
              <label className="text-[10px] font-black uppercase tracking-widest text-foreground/40 block mb-2">Match</label>
              <select
                value={matchId}
                onChange={e => setMatchId(parseInt(e.target.value))}
                className="w-full bg-white/5 border border-white/10 rounded p-2 text-sm focus:border-val-blue outline-none transition-colors"
              >
                <option value={0}>Select match</option>
                {weekMatches.map(m => (
                  <option key={m.id} value={m.id}>ID {m.id}: {m.team1.name} vs {m.team2.name} ({m.group_name})</option>
                ))}
              </select>
            </div>
          </div>
          <button
            disabled={!matchId || loading}
            onClick={loadDetails}
            className="px-4 py-2 bg-val-blue text-white rounded text-xs font-black uppercase tracking-widest"
          >
            {loading ? "Loading..." : "Load Summary"}
          </button>
        </section>

        {details?.match && (
          <section className="space-y-8 mt-8 animate-in fade-in duration-500">
            <div className="glass p-8">
              <div className="flex items-center justify-between">
                <div className="font-display text-xl font-black uppercase tracking-wider">
                  <a className="hover:text-val-blue underline" href={`/teams?team_id=${details.match.team1.id}`}>{details.match.team1.name}</a>
                  {" "}vs{" "}
                  <a className="hover:text-val-blue underline" href={`/teams?team_id=${details.match.team2.id}`}>{details.match.team2.name}</a>
                </div>
                <div className="text-[10px] font-black uppercase tracking-widest text-foreground/40">
                  Week {details.match.week} • {details.match.group_name} • {details.match.format}
                </div>
              </div>
              <div className="mt-2 text-sm text-foreground/60">
                Final: {details.match.score_t1 ?? 0} - {details.match.score_t2 ?? 0}
              </div>
            </div>

            {details.maps.map((map) => (
              <div key={map.index} className="glass p-8 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="font-display text-lg font-black uppercase tracking-wider">
                    Map {map.index + 1}: {map.name}
                  </div>
                  <div className="text-[10px] font-black uppercase tracking-widest text-foreground/40">
                    {details.match.team1.name}: {map.t1_rounds} • {details.match.team2.name}: {map.t2_rounds} {map.is_forfeit ? "• Forfeit" : ""}
                  </div>
                </div>

                {/* Round-by-round progression */}
                <div className="flex flex-wrap gap-1 p-2 bg-white/5 rounded border border-white/5">
                  {map.rounds?.map((r: any) => (
                    <div
                      key={r.round_number}
                      className={`w-6 h-6 flex items-center justify-center text-[9px] font-bold rounded ${r.winning_team_id === details.match.team1.id ? "bg-val-blue text-white" : "bg-val-red text-white"
                        }`}
                      title={`Round ${r.round_number}: ${r.win_type}${r.plant ? " (Plant)" : ""}${r.defuse ? " (Defuse)" : ""}`}
                    >
                      {r.round_number}
                    </div>
                  ))}
                </div>

                {/* Economy indicator */}
                <div className="grid grid-cols-2 gap-4 h-1 items-end">
                  <div className="flex justify-end gap-0.5">
                    {map.rounds?.map((r: any) => (
                      <div key={r.round_number} style={{ height: `${Math.min(r.economy_t1 / 500, 20)}px` }} className="w-1 bg-val-blue/30 rounded-t" />
                    ))}
                  </div>
                  <div className="flex justify-start gap-0.5">
                    {map.rounds?.map((r: any) => (
                      <div key={r.round_number} style={{ height: `${Math.min(r.economy_t2 / 500, 20)}px` }} className="w-1 bg-val-red/30 rounded-t" />
                    ))}
                  </div>
                </div>
                <div className="grid md:grid-cols-2 gap-8">
                  {[details.match.team1, details.match.team2].map((team, idx) => {
                    const rows = map.stats.filter((s: any) => s.team_id === team.id);
                    return (
                      <div key={team.id} className="glass p-6 border border-white/5 rounded">
                        <h5 className="font-display text-lg font-bold uppercase tracking-wider mb-4">{team.name} Scoreboard</h5>
                        <div className="space-y-3">
                          <div className="grid grid-cols-12 gap-2 text-[10px] font-black uppercase tracking-widest text-foreground/40">
                            <div className="col-span-2">Player</div>
                            <div>Agent</div>
                            <div>ACS</div>
                            <div>K</div>
                            <div>D</div>
                            <div>A</div>
                            <div>ADR</div>
                            <div>KAST</div>
                            <div>HS%</div>
                            <div>FK</div>
                            <div>Sub</div>
                          </div>
                          {rows.map((r: any, i: number) => (
                            <div key={`${r.player_id}-${i}`} className="grid grid-cols-12 gap-2 items-center text-[11px]">
                              <a href={`/players?player_id=${r.player_id}`} className="col-span-2 hover:text-val-blue underline truncate">{r.player_name}</a>
                              <div className="text-foreground/80">{r.agent}</div>
                              <div className="text-val-blue font-bold">{Math.round(r.acs)}</div>
                              <div>{r.kills}</div>
                              <div className="text-val-red">{r.deaths}</div>
                              <div>{r.assists}</div>
                              <div>{Math.round(r.adr)}</div>
                              <div>{Math.round(r.kast)}%</div>
                              <div>{Math.round(r.hs_pct)}%</div>
                              <div className="text-val-blue font-bold">{r.fk || 0}</div>
                              <div className={`${r.is_sub ? 'text-val-red' : 'text-foreground/20'}`}>{r.is_sub ? "Sub" : "-"}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </section>
        )}
      </main>
    </div>
  );
}
