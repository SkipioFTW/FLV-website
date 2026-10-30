"use client";

import { useEffect, useState } from "react";
import Navbar from "@/components/Navbar";
import { getAllMatches, getMatchDetails } from "@/lib/data";
import MapSummaryTabs from "@/components/MapSummaryTabs";
import MatchSearch from "@/components/MatchSearch";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

function SummaryContent() {
  const searchParams = useSearchParams();
  const seasonId = searchParams.get('season') || undefined;

  const [matches, setMatches] = useState<any[]>([]);
  const [selectedWeek, setSelectedWeek] = useState<number>(1);
  const [matchId, setMatchId] = useState<number>(0);
  const [details, setDetails] = useState<{ match: any, maps: any[] } | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    getAllMatches(seasonId).then(ms => {
      setMatches(ms);
      if (ms.length > 0) {
        // Try to keep the same week if it exists in the new season
        const currentWeeks = Array.from(new Set(ms.map(m => m.week)));
        if (!currentWeeks.includes(selectedWeek)) {
          setSelectedWeek(ms[0].match_type === 'playoff' ? 0 : ms[0].week);
        }
        setMatchId(0);
        setDetails(null);
      } else {
        setMatchId(0);
        setDetails(null);
      }
    });
  }, [seasonId]);

  const loadDetails = async () => {
    if (!matchId) return;
    setLoading(true);
    const d = await getMatchDetails(matchId);
    setDetails(d);
    setLoading(false);
  };

  return (
    <main className="flex-1 max-w-7xl mx-auto w-full px-6 py-32">
      <header className="mb-8">
        <h1 className="font-display text-4xl md:text-5xl font-black italic text-val-blue uppercase tracking-tighter">
          {seasonId === 'all' ? 'All Time' : `Season ${seasonId?.replace('S', '') || ''}`} Match Summary
        </h1>
        <p className="text-foreground/40 font-bold uppercase tracking-widest text-xs">
          Browse match details, maps and per-map scoreboards
        </p>
      </header>

      <section className="glass p-8">
        <div className="grid md:grid-cols-4 gap-6 items-end">
          <div>
            <label className="text-[10px] font-black uppercase tracking-widest text-foreground/40 block mb-2">Select Week</label>
            <select
              value={selectedWeek}
              onChange={e => setSelectedWeek(parseInt(e.target.value))}
              className="w-full bg-white/5 border border-white/10 rounded p-2 text-sm focus:border-val-blue outline-none transition-colors h-[48px]"
            >
              {matches.some(m => m.match_type === 'playoff') && (
                <option value={0}>Playoffs</option>
              )}
              {Array.from(new Set(matches.filter(m => m.match_type !== 'playoff').map(m => m.week)))
                .sort((a, b) => a - b)
                .map(w => <option key={w} value={w}>Week {w}</option>)}
            </select>
          </div>
          <div className="md:col-span-2">
            <MatchSearch
              matches={matches.filter(m => 
                selectedWeek === 0 
                  ? m.match_type === 'playoff' 
                  : m.week === selectedWeek && m.match_type !== 'playoff'
              )}
              onSelect={setMatchId}
              currentId={matchId}
            />
          </div>
          <button
            disabled={!matchId || loading}
            onClick={loadDetails}
            className="px-4 h-[48px] bg-val-blue text-white rounded text-xs font-black uppercase tracking-widest hover:bg-val-blue/80 transition-colors disabled:opacity-50"
          >
            {loading ? "Loading..." : "View Summary"}
          </button>
        </div>
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
                {details.match.match_type === 'playoff' ? 'Playoffs' : `Week ${details.match.week}`} • {details.match.group_name} • {details.match.format}
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

              <MapSummaryTabs
                matchId={matchId}
                map={map}
                team1={details.match.team1}
                team2={details.match.team2}
              />
            </div>
          ))}
        </section>
      )}
    </main>
  );
}

export default function SummaryPage() {
  return (
    <div className="flex flex-col min-h-screen bg-background text-foreground">
      <Navbar />
      <Suspense fallback={
        <div className="flex-1 flex items-center justify-center pt-32">
          <div className="w-8 h-8 border-4 border-val-blue border-t-transparent rounded-full animate-spin" />
        </div>
      }>
        <SummaryContent />
      </Suspense>
    </div>
  );
}
