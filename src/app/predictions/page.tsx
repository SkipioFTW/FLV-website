'use client';
import Navbar from '@/components/Navbar';
import { useState, useEffect, useMemo } from 'react';
import ScenarioGenerator from '@/components/ScenarioGenerator';
import PlayoffProbability from '@/components/PlayoffProbability';
import { getSimulationData, getPlayoffProbability } from '@/lib/data';

export default function PredictionsPage() {
  const [team1, setTeam1] = useState(0);
  const [team2, setTeam2] = useState(0);
  const [teams, setTeams] = useState<Array<{ id: number; name: string }>>([]);
  const [prob, setProb] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [upcoming, setUpcoming] = useState<any[]>([]);
  const [busyUpcoming, setBusyUpcoming] = useState(false);
  const [simulationData, setSimulationData] = useState<{ currentStandings: any[], remainingMatches: any[] } | null>(null);
  const [playoffProbs, setPlayoffProbs] = useState<any[]>([]);
  const [activeView, setActiveView] = useState<'match' | 'scenario' | 'probability'>('match');

  useEffect(() => {
    import('@/lib/supabase').then(({ supabase }) => {
      supabase.from('teams').select('id,name').order('name').then(({ data }) => setTeams((data as any[]) || []));
    });
    const loadUpcoming = async () => {
      setBusyUpcoming(true);
      try {
        const r = await fetch('/api/predictions/upcoming', { cache: 'no-store' });
        const j = await r.json();
        setUpcoming(j.items || []);
      } finally {
        setBusyUpcoming(false);
      }
    };
    loadUpcoming();
    getSimulationData().then(setSimulationData);
    getPlayoffProbability().then(setPlayoffProbs);
  }, []);

  const predict = async () => {
    if (!team1 || !team2 || team1 === team2) return;
    setLoading(true);
    try {
      const r = await fetch(`/api/predict?team1_id=${team1}&team2_id=${team2}`);
      const j = await r.json();
      setProb(j.probability_team1_win ?? null);
    } finally {
      setLoading(false);
    }
  };

  const teamMap = useMemo(() => {
    const m = new Map<number, { id: number; name: string }>();
    teams.forEach(t => m.set(Number(t.id), t));
    return m;
  }, [teams]);
  const t1 = useMemo(() => teamMap.get(Number(team1))?.name || 'Team 1', [teamMap, team1]);
  const t2 = useMemo(() => teamMap.get(Number(team2))?.name || 'Team 2', [teamMap, team2]);

  return (
    <div className="flex flex-col min-h-screen bg-background text-foreground">
      <Navbar />
      <main className="flex-1 max-w-7xl mx-auto w-full px-6 py-32 space-y-12 animate-in fade-in duration-700">
        <header>
          <h1 className="font-display text-5xl md:text-7xl font-black italic text-val-blue uppercase tracking-tight mb-4">
            League <span className="text-val-red">Simulations</span>
          </h1>
          <p className="text-foreground/60 text-lg max-w-2xl font-medium">
            Analyze match probabilities, simulate remaining matches, and view mathematical playoff projections.
          </p>
        </header>

        {/* View Toggles */}
        <div className="flex flex-wrap gap-4 border-b border-white/10 pb-6">
          <button
            onClick={() => setActiveView('match')}
            className={`px-8 py-3 font-display font-black uppercase tracking-widest text-sm transition-all border-b-2 ${activeView === 'match' ? 'border-val-red text-white' : 'border-transparent text-foreground/40 hover:text-foreground'}`}
          >
            Match Predictor
          </button>
          <button
            onClick={() => setActiveView('scenario')}
            className={`px-8 py-3 font-display font-black uppercase tracking-widest text-sm transition-all border-b-2 ${activeView === 'scenario' ? 'border-val-red text-white' : 'border-transparent text-foreground/40 hover:text-foreground'}`}
          >
            Scenario Generator
          </button>
          <button
            onClick={() => setActiveView('probability')}
            className={`px-8 py-3 font-display font-black uppercase tracking-widest text-sm transition-all border-b-2 ${activeView === 'probability' ? 'border-val-red text-white' : 'border-transparent text-foreground/40 hover:text-foreground'}`}
          >
            Playoff Probabilities
          </button>
        </div>

        {activeView === 'match' && (
        <div className="space-y-8">
        <div className="glass p-8 rounded border border-white/5 relative overflow-hidden group">
          <div className="absolute -top-24 -right-24 w-96 h-96 bg-val-blue/5 rounded-full blur-3xl pointer-events-none group-hover:bg-val-blue/10 transition-colors" />
          <h1 className="font-display text-4xl font-black italic text-val-blue uppercase tracking-tight mb-2 relative z-10">Match Predictor</h1>
          <p className="text-foreground/60 text-sm mb-6 relative z-10">Pick two teams to simulate the match-up and view the predicted win probability.</p>
          <div className="grid md:grid-cols-3 gap-3 items-end">
            <div>
              <label className="text-[10px] font-black uppercase tracking-widest text-foreground/40 block mb-2">Team 1</label>
              <select value={team1} onChange={(e) => setTeam1(parseInt(e.target.value))} className="w-full bg-white/5 border border-white/10 rounded p-3 text-sm">
                <option value={0}>Select team</option>
                {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[10px] font-black uppercase tracking-widest text-foreground/40 block mb-2">Team 2</label>
              <select value={team2} onChange={(e) => setTeam2(parseInt(e.target.value))} className="w-full bg-white/5 border border-white/10 rounded p-3 text-sm">
                <option value={0}>Select team</option>
                {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
            <button onClick={predict} disabled={!team1 || !team2 || team1 === team2 || loading} className="h-[44px] px-4 bg-val-red text-white rounded text-[10px] font-black uppercase tracking-widest disabled:opacity-50">
              {loading ? 'Predicting...' : 'Predict'}
            </button>
          </div>
          {prob !== null && (
            <div className="mt-6">
              <div className="flex items-center justify-between text-xs mb-2">
                <span className="font-bold">{t1}</span>
                <span className="font-bold">{t2}</span>
              </div>
              <div className="w-full h-3 bg-white/10 rounded overflow-hidden">
                <div className="h-3 bg-val-blue" style={{ width: `${Math.round((prob || 0) * 100)}%` }} />
              </div>
              <div className="text-xs mt-2 text-foreground/70">{t1} win probability: {(prob * 100).toFixed(1)}%</div>
            </div>
          )}
        </div>

        <div className="space-y-6">
          <h2 className="font-display text-2xl font-black italic uppercase tracking-wider text-val-blue">Upcoming Match Predictions</h2>
          <div className="glass p-6 rounded border border-white/5">
            {busyUpcoming ? (
              <div className="text-xs text-foreground/60">Loading...</div>
            ) : upcoming.length === 0 ? (
              <div className="text-xs text-foreground/60">No scheduled matches.</div>
            ) : (
              <div className="space-y-3">
                {upcoming.map((m) => {
                  const pct = Math.round((m.probability_team1_win || 0) * 100);
                  const t1n = teamMap.get(Number(m.team1?.id))?.name || m.team1?.name || '';
                  const t1t = teamMap.get(Number(m.team1?.id))?.name ? '' : (teamMap.get(Number(m.team1?.id)) as any)?.tag;
                  const t2n = teamMap.get(Number(m.team2?.id))?.name || m.team2?.name || '';
                  const t2t = teamMap.get(Number(m.team2?.id))?.name ? '' : (teamMap.get(Number(m.team2?.id)) as any)?.tag;
                  const name1 = t1n || t1t || m.team1?.tag || `Team ${m.team1?.id ?? ''}`;
                  const name2 = t2n || t2t || m.team2?.tag || `Team ${m.team2?.id ?? ''}`;
                  return (
                    <div key={m.id} className="grid md:grid-cols-6 gap-3 items-center bg-white/[0.02] rounded p-3 border border-white/5">
                      <div className="text-[10px] font-black uppercase tracking-widest text-foreground/40 md:col-span-1">Week {m.week || '-'}</div>
                      <div className="md:col-span-2 text-sm font-bold">{name1} vs {name2}</div>
                      <div className="md:col-span-2">
                        <div className="w-full h-2 bg-white/10 rounded overflow-hidden">
                          <div className="h-2 bg-val-blue" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                      <div className="text-right text-xs md:col-span-1">{pct}%</div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
        </div>
        )}

        {activeView === 'scenario' && simulationData && (
          <ScenarioGenerator
            initialStandings={simulationData.currentStandings}
            remainingMatches={simulationData.remainingMatches}
          />
        )}

        {activeView === 'probability' && playoffProbs.length > 0 && (
          <PlayoffProbability probabilities={playoffProbs} />
        )}
      </main>
    </div>
  );
}
