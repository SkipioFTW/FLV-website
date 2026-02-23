"use client";

import { useState, useEffect } from "react";
import { getStandings } from "@/lib/data";
import type { StandingsRow } from "@/lib/data";

interface Props {
    onUpdate?: () => void;
}

export default function PlayoffScenarioGenerator({ onUpdate }: Props) {
    const [standings, setStandings] = useState<Map<string, StandingsRow[]>>(new Map());
    const [loading, setLoading] = useState(true);
    const [generating, setGenerating] = useState(false);
    const [selectedGroup, setSelectedGroup] = useState("");
    const [selectedTeamId, setSelectedTeamId] = useState<number | 0>(0);
    const [status, setStatus] = useState<{ type: 'success' | 'error' | 'info', msg: string } | null>(null);
    const [storedScenario, setStoredScenario] = useState<string | null>(null);

    useEffect(() => {
        getStandings().then(s => {
            setStandings(s);
            const groups = Array.from(s.keys());
            if (groups.length > 0) setSelectedGroup(groups[0]);
            setLoading(false);
        });
    }, []);

    useEffect(() => {
        if (selectedTeamId) {
            fetch(`/api/admin/scenarios?team_id=${selectedTeamId}`)
                .then(r => r.json())
                .then(d => setStoredScenario(d.scenario || null))
                .catch(() => setStoredScenario(null));
        } else {
            setStoredScenario(null);
        }
    }, [selectedTeamId]);

    const handleGenerate = async () => {
        if (!selectedTeamId || !selectedGroup) return;
        setGenerating(true);
        setStatus({ type: 'info', msg: 'Generating scenario...' });
        try {
            const res = await fetch('/api/admin/scenarios/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ team_id: selectedTeamId, group_name: selectedGroup })
            });
            const data = await res.json();
            if (res.ok) {
                setStatus({ type: 'success', msg: data.message });
                setStoredScenario(data.scenario);
                if (onUpdate) onUpdate();
            } else {
                setStatus({ type: 'error', msg: data.error || 'Generation failed' });
            }
        } catch (err) {
            setStatus({ type: 'error', msg: 'Network error' });
        } finally {
            setGenerating(false);
        }
    };

    const handleGenerateAll = async () => {
        if (!selectedGroup) return;
        const teamsInGroup = standings.get(selectedGroup) || [];
        if (teamsInGroup.length === 0) return;

        setGenerating(true);
        setStatus({ type: 'info', msg: `Batch generating for ${teamsInGroup.length} teams...` });

        let successCount = 0;
        for (const team of teamsInGroup) {
            try {
                const res = await fetch('/api/admin/scenarios/generate', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ team_id: team.id, group_name: selectedGroup })
                });
                if (res.ok) successCount++;
            } catch (e) { }
        }

        setStatus({ type: 'success', msg: `Successfully generated scenarios for ${successCount}/${teamsInGroup.length} teams.` });
        setGenerating(false);
        if (onUpdate) onUpdate();
    };

    if (loading) return <div className="animate-pulse text-xs font-black uppercase tracking-widest text-foreground/40">Loading groups...</div>;

    const groups = Array.from(standings.keys());
    const teams = standings.get(selectedGroup) || [];

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            <h3 className="font-display text-xl font-black text-val-blue uppercase italic flex items-center gap-4">
                🧠 Playoff Scenario Generator (AI)
                <div className="h-px flex-1 bg-white/5" />
            </h3>

            <div className="grid md:grid-cols-4 gap-4 items-end">
                <div>
                    <label className="text-[10px] font-black uppercase tracking-widest text-foreground/40 block mb-2">Group</label>
                    <select
                        value={selectedGroup}
                        onChange={e => { setSelectedGroup(e.target.value); setSelectedTeamId(0); }}
                        className="w-full bg-white/5 border border-white/10 rounded p-2 text-sm focus:border-val-blue outline-none transition-colors"
                    >
                        {groups.map(g => <option key={g} value={g}>{g}</option>)}
                    </select>
                </div>
                <div>
                    <label className="text-[10px] font-black uppercase tracking-widest text-foreground/40 block mb-2">Team</label>
                    <select
                        value={selectedTeamId}
                        onChange={e => setSelectedTeamId(parseInt(e.target.value))}
                        className="w-full bg-white/5 border border-white/10 rounded p-2 text-sm focus:border-val-blue outline-none transition-colors"
                    >
                        <option value={0}>Select Team</option>
                        {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                </div>
                <button
                    disabled={!selectedTeamId || generating}
                    onClick={handleGenerate}
                    className="py-2.5 bg-val-blue text-white font-display font-black uppercase tracking-widest text-[10px] rounded shadow-[0_0_15px_rgba(63,209,255,0.2)] disabled:opacity-50"
                >
                    {generating ? "Generating..." : "Generate & Store"}
                </button>
                <button
                    disabled={!selectedGroup || generating}
                    onClick={handleGenerateAll}
                    className="py-2.5 bg-white/5 hover:bg-white/10 text-foreground font-display font-black uppercase tracking-widest text-[10px] rounded transition-all disabled:opacity-50"
                >
                    Generate All (Group)
                </button>
            </div>

            {status && (
                <div className={`p-4 rounded border text-xs font-bold uppercase tracking-widest ${status.type === 'success' ? 'bg-val-blue/10 border-val-blue/30 text-val-blue' :
                        status.type === 'error' ? 'bg-val-red/10 border-val-red/30 text-val-red' :
                            'bg-white/5 border-white/10 text-foreground/60'
                    }`}>
                    {status.msg}
                </div>
            )}

            {storedScenario && (
                <div className="glass p-6 rounded relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                        <svg className="w-24 h-24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1">
                            <path d="M12 2L2 7L12 12L22 7L12 2Z" />
                            <path d="M2 17L12 22L22 17" />
                            <path d="M2 12L12 17L22 12" />
                        </svg>
                    </div>
                    <h4 className="text-[10px] font-black uppercase tracking-widest text-val-blue mb-4">Stored Scenario</h4>
                    <div className="text-sm leading-relaxed text-foreground/80 whitespace-pre-wrap font-medium font-mono">
                        {storedScenario}
                    </div>
                </div>
            )}
        </div>
    );
}
