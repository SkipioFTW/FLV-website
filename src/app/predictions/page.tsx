'use client';
import Navbar from '@/components/Navbar';
import { useState, useEffect, useMemo } from 'react';

export default function PredictionsPage() {
  const [team1, setTeam1] = useState(0);
  const [team2, setTeam2] = useState(0);
  const [teams, setTeams] = useState<Array<{ id: number; name: string }>>([]);
  const [prob, setProb] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [upcoming, setUpcoming] = useState<any[]>([]);
  const [busyUpcoming, setBusyUpcoming] = useState(false);

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

  const t1 = useMemo(() => teams.find(t => t.id === team1)?.name || 'Team 1', [teams, team1]);
  const t2 = useMemo(() => teams.find(t => t.id === team2)?.name || 'Team 2', [teams, team2]);

  return (
    <div className="flex flex-col min-h-screen bg-background text-foreground">
      <Navbar />
      <main className="flex-1 max-w-7xl mx-auto w-full px-6 py-24 space-y-8">
        <div className="glass p-8 rounded border border-white/5">
          <h1 className="font-display text-4xl font-black italic text-val-blue uppercase tracking-tight mb-2">Predictions</h1>
          <p className="text-foreground/60 text-sm mb-6">Pick two teams to simulate the match-up and view the predicted win probability.</p>
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

        <div className="space-y-3">
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
                  return (
                    <div key={m.id} className="grid md:grid-cols-6 gap-3 items-center bg-white/[0.02] rounded p-3 border border-white/5">
                      <div className="text-[10px] font-black uppercase tracking-widest text-foreground/40 md:col-span-1">Week {m.week || '-'}</div>
                      <div className="md:col-span-2 text-sm font-bold">{m.team1?.name} vs {m.team2?.name}</div>
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
      </main>
    </div>
  );
}
