import Navbar from '@/components/Navbar';
import { useState, useEffect } from 'react';

export default function PredictionsPage() {
  const [team1, setTeam1] = useState(0);
  const [team2, setTeam2] = useState(0);
  const [teams, setTeams] = useState<Array<{ id: number; name: string }>>([]);
  const [prob, setProb] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    import('@/lib/supabase').then(({ supabase }) => {
      supabase.from('teams').select('id,name').order('name').then(({ data }) => setTeams((data as any[]) || []));
    });
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

  return (
    <div className="flex flex-col min-h-screen bg-background text-foreground">
      <Navbar />
      <main className="flex-1 max-w-7xl mx-auto w-full px-6 py-24 space-y-6">
        <h1 className="font-display text-4xl font-black italic text-val-blue uppercase tracking-tight">Predictions</h1>
        <div className="glass p-6 rounded space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <select value={team1} onChange={(e) => setTeam1(parseInt(e.target.value))} className="bg-white/5 border border-white/10 rounded p-2 text-xs">
              <option value={0}>Team 1</option>
              {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            <select value={team2} onChange={(e) => setTeam2(parseInt(e.target.value))} className="bg-white/5 border border-white/10 rounded p-2 text-xs">
              <option value={0}>Team 2</option>
              {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            <button onClick={predict} disabled={!team1 || !team2 || team1 === team2 || loading} className="px-4 py-2 bg-val-red text-white rounded text-[10px] font-black uppercase tracking-widest">
              {loading ? 'Predicting...' : 'Predict'}
            </button>
          </div>
          {prob !== null && (
            <div className="text-xs">Team 1 win probability: {(prob * 100).toFixed(1)}%</div>
          )}
        </div>
      </main>
    </div>
  );
}
