"use client";
export const dynamic = 'force-dynamic';

import { useEffect, useState } from "react";
import Navbar from "@/components/Navbar";
import {
    getPendingRequests,
    getAllMatches,
    updatePendingRequestStatus,
    getTeamsBasic,
    getPlayoffMatches,
    updateMatch,
    saveMapResults,
    parseTrackerJson,
    getDashboardStats,
    type GlobalStats
} from "@/lib/data";
import { clearMatchDetails } from "@/lib/data";
import { supabase } from "@/lib/supabase";
import type { PendingMatch, PendingPlayer, MatchEntry } from "@/lib/data";
import type { PlayoffMatch } from "@/lib/data";

export default function AdminPage() {
    const [activeTab, setActiveTab] = useState<'pending' | 'schedule' | 'playoffs' | 'editor' | 'players'>('pending');
    const [pending, setPending] = useState<{ matches: PendingMatch[], players: PendingPlayer[] }>({ matches: [], players: [] });
    const [matches, setMatches] = useState<MatchEntry[]>([]);
    const [playoffMatches, setPlayoffMatches] = useState<PlayoffMatch[]>([]);
    const [teams, setTeams] = useState<{ id: number, name: string, tag: string, group_name: string }[]>([]);
    const [stats, setStats] = useState<GlobalStats>({ activeTeams: 0, matchesPlayed: 0, livePlayers: 0, totalPoints: 0 });
    const [loading, setLoading] = useState(true);
    const [authorized, setAuthorized] = useState(false);
    const [authLoading, setAuthLoading] = useState(true);
    const [form, setForm] = useState({ username: "", password: "", token: "" });
    const [authError, setAuthError] = useState<string | null>(null);

    useEffect(() => {
        fetch("/api/admin/me")
            .then(r => r.json())
            .then(d => {
                setAuthorized(Boolean(d.authorized));
                setAuthLoading(false);
            })
            .catch(() => setAuthLoading(false));
    }, []);

    useEffect(() => {
        const loadData = async () => {
            if (!authorized) {
                setLoading(false);
                return;
            }
            setLoading(true);
            const [p, m, t, pm, s] = await Promise.all([
                getPendingRequests(),
                getAllMatches(),
                getTeamsBasic(),
                getPlayoffMatches(),
                getDashboardStats()
            ]);
            setPending(p);
            setMatches(m);
            setTeams(t);
            setPlayoffMatches(pm);
            setStats(s);
            setLoading(false);
        };
        loadData();
    }, [authorized]);

    const handleUpdatePending = async (type: 'match' | 'player', id: number, status: string) => {
        const success = await updatePendingRequestStatus(type, id, status);
        if (success) {
            setPending(prev => ({
                ...prev,
                [type === 'match' ? 'matches' : 'players']: prev[type === 'match' ? 'matches' : 'players'].filter(p => p.id !== id)
            }));
        }
    };

    if (!authorized) {
        return (
            <div className="flex flex-col min-h-screen bg-background text-foreground">
                <Navbar />
                <main className="flex-1 max-w-7xl mx-auto w-full px-6 py-32">
                    <section className="glass p-12">
                        <h1 className="font-display text-3xl font-black italic text-val-red uppercase tracking-tighter mb-6 text-center">
                            Admin Login
                        </h1>
                        <div className="max-w-md mx-auto space-y-4">
                            <div>
                                <label className="text-[10px] font-black uppercase tracking-widest text-foreground/40 block mb-2">Username</label>
                                <input
                                    value={form.username}
                                    onChange={e => setForm({ ...form, username: e.target.value })}
                                    className="w-full bg-white/5 border border-white/10 rounded p-2 text-sm focus:border-val-blue outline-none transition-colors"
                                />
                            </div>
                            <div>
                                <label className="text-[10px] font-black uppercase tracking-widest text-foreground/40 block mb-2">Password</label>
                                <input
                                    type="password"
                                    value={form.password}
                                    onChange={e => setForm({ ...form, password: e.target.value })}
                                    className="w-full bg-white/5 border border-white/10 rounded p-2 text-sm focus:border-val-blue outline-none transition-colors"
                                />
                            </div>
                            <div>
                                <label className="text-[10px] font-black uppercase tracking-widest text-foreground/40 block mb-2">Token</label>
                                <input
                                    value={form.token}
                                    onChange={e => setForm({ ...form, token: e.target.value })}
                                    className="w-full bg-white/5 border border-white/10 rounded p-2 text-sm focus:border-val-blue outline-none transition-colors"
                                />
                            </div>
                            {authError && (
                                <div className="text-val-red text-xs font-bold uppercase tracking-widest">{authError}</div>
                            )}
                            <button
                                disabled={authLoading}
                                onClick={async () => {
                                    setAuthError(null);
                                    const res = await fetch("/api/admin/login", {
                                        method: "POST",
                                        headers: { "Content-Type": "application/json" },
                                        body: JSON.stringify(form)
                                    });
                                    if (res.ok) {
                                        setAuthorized(true);
                                    } else {
                                        setAuthError("Invalid credentials");
                                    }
                                }}
                                className="w-full py-3 bg-val-blue text-white font-display font-black uppercase tracking-widest text-xs rounded shadow-[0_0_20px_rgba(63,209,255,0.3)]"
                            >
                                {authLoading ? "Checking..." : "Login"}
                            </button>
                            <div className="text-[10px] font-black uppercase tracking-widest text-foreground/40 text-center">
                                Credentials are configured via environment variables
                            </div>
                        </div>
                    </section>
                </main>
            </div>
        );
    }

    return (
        <div className="flex flex-col min-h-screen bg-background text-foreground">
            <Navbar />

            <main className="flex-1 max-w-7xl mx-auto w-full px-6 py-32">
                <header className="mb-12 flex items-center justify-between">
                    <div>
                        <h1 className="font-display text-4xl md:text-5xl font-black italic text-val-red uppercase tracking-tighter mb-2">
                            Admin Dashboard
                        </h1>
                        <p className="text-foreground/40 font-bold uppercase tracking-widest text-xs">
                            Control Center & Tournament Management
                        </p>
                    </div>

                    <div className="flex glass p-1 rounded-lg">
                        {(['pending', 'schedule', 'playoffs', 'editor', 'players'] as const).map((tab) => (
                            <button
                                key={tab}
                                onClick={() => setActiveTab(tab)}
                                className={`px-6 py-2 rounded-md font-display text-xs font-black uppercase tracking-widest transition-all ${activeTab === tab
                                    ? 'bg-val-red text-white shadow-[0_0_15px_rgba(255,70,85,0.4)]'
                                    : 'text-foreground/40 hover:text-foreground/80'
                                    }`}
                            >
                                {tab}
                                {tab === 'pending' && (pending.matches.length + pending.players.length > 0) && (
                                    <span className="ml-2 px-1.5 py-0.5 bg-white text-val-red rounded-full text-[10px]">
                                        {pending.matches.length + pending.players.length}
                                    </span>
                                )}
                            </button>
                        ))}
                    </div>
                </header>
                <section className="grid md:grid-cols-4 gap-6 mb-8">
                    <div className="custom-card glass p-6 text-center rounded">
                        <h4 className="text-val-blue mb-1">LIVE USERS</h4>
                        <div className="font-display text-3xl">{stats.livePlayers}</div>
                        <div className="text-foreground/40 text-xs">Currently on website</div>
                    </div>
                    <div className="custom-card glass p-6 text-center rounded">
                        <h4 className="text-green-400 mb-1">SYSTEM STATUS</h4>
                        <div className="font-display text-xl">ONLINE</div>
                        <div className="text-foreground/40 text-xs">All systems operational</div>
                    </div>
                    <div className="custom-card glass p-6 text-center rounded">
                        <h4 className="text-val-red mb-1">SESSION ROLE</h4>
                        <div className="font-display text-xl">ADMIN</div>
                        <div className="text-foreground/40 text-xs">Authorized Session</div>
                    </div>
                    <div className="custom-card glass p-6 text-center rounded">
                        <h4 className="text-val-blue mb-1">PREDICTIONS</h4>
                        <div className="text-foreground/60 text-xs mb-3">Manage model and simulate</div>
                        <a href="/admin/predictions" className="inline-block px-4 py-2 bg-val-blue text-white rounded text-[10px] font-black uppercase tracking-widest">
                            Open Predictions Admin
                        </a>
                    </div>
                </section>

                {loading ? (
                    <div className="glass p-20 flex flex-col items-center justify-center animate-pulse">
                        <div className="w-12 h-12 border-4 border-val-red border-t-transparent rounded-full animate-spin mb-4" />
                        <span className="font-display text-val-red font-black uppercase tracking-widest">Loading Dashboard Data...</span>
                    </div>
                ) : (
                    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                        {activeTab === 'pending' && (
                            <section className="grid md:grid-cols-2 gap-8">
                                {/* Pending Matches */}
                                <div className="space-y-4">
                                    <h2 className="font-display text-xl font-black text-val-blue uppercase italic flex items-center gap-4">
                                        🤖 Bot Match Requests
                                        <div className="h-px flex-1 bg-white/5" />
                                    </h2>
                                    <div className="grid gap-3">
                                        {pending.matches.length > 0 ? pending.matches.map((m) => (
                                            <div key={m.id} className="glass p-4 group hover:border-val-red/30 transition-all">
                                                <div className="flex justify-between items-start mb-3">
                                                    <div>
                                                        <div className="font-display text-lg font-black uppercase tracking-tight">
                                                            {m.team_a} vs {m.team_b}
                                                        </div>
                                                        <div className="text-[10px] font-bold text-foreground/40 uppercase tracking-widest">
                                                            {m.group_name} • Submitted by {m.submitted_by}
                                                        </div>
                                                    </div>
                                                    <div className="flex gap-2">
                                                        <button
                                                            onClick={() => {
                                                                const cand = matches.filter(mm => mm.status === 'scheduled').find(mm => {
                                                                    const nm = (s: string) => s?.trim().toLowerCase();
                                                                    return (nm(mm.team1.name) === nm(m.team_a) && nm(mm.team2.name) === nm(m.team_b)) ||
                                                                        (nm(mm.team1.name) === nm(m.team_b) && nm(mm.team2.name) === nm(m.team_a));
                                                                });
                                                                if (cand) {
                                                                    setActiveTab('editor');
                                                                    // inform editor via localStorage
                                                                    try {
                                                                        window.localStorage.setItem('auto_selected_match_id', String(cand.id));
                                                                        window.localStorage.setItem('auto_selected_match_week', String(cand.week));
                                                                        window.localStorage.setItem('pending_match_db_id', String(m.id));
                                                                        if (m.url) window.localStorage.setItem('auto_selected_match_url', m.url);
                                                                        const fmt = (m as any).format;
                                                                        if (fmt) window.localStorage.setItem('pending_match_format', String(fmt));
                                                                    } catch { }
                                                                } else {
                                                                    setActiveTab('editor');
                                                                }
                                                            }}
                                                            className="px-3 py-1 bg-white/10 hover:bg-white/20 text-foreground text-[10px] font-black uppercase tracking-widest rounded transition-all"
                                                        >
                                                            Process
                                                        </button>
                                                        <button
                                                            onClick={() => handleUpdatePending('match', m.id, 'accepted')}
                                                            className="px-3 py-1 bg-val-blue/20 hover:bg-val-blue text-val-blue hover:text-white text-[10px] font-black uppercase tracking-widest rounded transition-all"
                                                        >
                                                            Accept
                                                        </button>
                                                        <button
                                                            onClick={() => handleUpdatePending('match', m.id, 'rejected')}
                                                            className="px-3 py-1 bg-val-red/20 hover:bg-val-red text-val-red hover:text-white text-[10px] font-black uppercase tracking-widest rounded transition-all"
                                                        >
                                                            Reject
                                                        </button>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-4 text-[10px] text-foreground/30 font-medium">
                                                    <a href={m.url} target="_blank" className="hover:text-val-blue underline truncate">Tracker.gg Link</a>
                                                    <span>{new Date(m.timestamp).toLocaleString()}</span>
                                                </div>
                                            </div>
                                        )) : (
                                            <div className="glass p-8 text-center text-foreground/30 text-xs font-bold uppercase tracking-widest">
                                                No pending match requests
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Pending Players */}
                                <div className="space-y-4">
                                    <h2 className="font-display text-xl font-black text-val-blue uppercase italic flex items-center gap-4">
                                        🤖 Bot Player Requests
                                        <div className="h-px flex-1 bg-white/5" />
                                    </h2>
                                    <div className="grid gap-3">
                                        {pending.players.length > 0 ? pending.players.map((p) => (
                                            <div key={p.id} className="glass p-4 group hover:border-val-red/30 transition-all">
                                                <div className="flex justify-between items-start mb-3">
                                                    <div>
                                                        <div className="font-display text-lg font-black uppercase tracking-tight">
                                                            {p.riot_id}
                                                        </div>
                                                        <div className="text-[10px] font-bold text-foreground/40 uppercase tracking-widest">
                                                            Rank: {p.rank} • Discord: {p.discord_handle}
                                                        </div>
                                                    </div>
                                                    <div className="flex gap-2">
                                                        <button
                                                            onClick={() => handleUpdatePending('player', p.id, 'accepted')}
                                                            className="px-3 py-1 bg-val-blue/20 hover:bg-val-blue text-val-blue hover:text-white text-[10px] font-black uppercase tracking-widest rounded transition-all"
                                                        >
                                                            Accept
                                                        </button>
                                                        <button
                                                            onClick={() => handleUpdatePending('player', p.id, 'rejected')}
                                                            className="px-3 py-1 bg-val-red/20 hover:bg-val-red text-val-red hover:text-white text-[10px] font-black uppercase tracking-widest rounded transition-all"
                                                        >
                                                            Reject
                                                        </button>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-4 text-[10px] text-foreground/30 font-medium">
                                                    <a href={p.tracker_link} target="_blank" className="hover:text-val-blue underline truncate">Tracker.gg Profile</a>
                                                    <span>{new Date(p.timestamp).toLocaleString()}</span>
                                                </div>
                                            </div>
                                        )) : (
                                            <div className="glass p-8 text-center text-foreground/30 text-xs font-bold uppercase tracking-widest">
                                                No pending player requests
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </section>
                        )}

                        {activeTab === 'schedule' && (
                            <ScheduleManager teams={teams} onUpdate={() => {
                                getAllMatches().then(setMatches);
                            }} />
                        )}

                        {activeTab === 'playoffs' && (
                            <PlayoffBracketEditor
                                teams={teams}
                                matches={playoffMatches}
                                onUpdate={async () => {
                                    const pm = await getPlayoffMatches();
                                    setPlayoffMatches(pm);
                                }}
                            />
                        )}

                        {activeTab === 'editor' && (
                            <ScoreMapEditor />
                        )}
                        {activeTab === 'players' && (
                            <PlayersAdmin />
                        )}
                    </div>
                )}
            </main>
        </div>
    );
}
/**
 * Schedule Manager Component
 */
function ScheduleManager({
    teams,
    onUpdate
}: {
    teams: { id: number, name: string, tag: string, group_name: string }[],
    onUpdate: () => void
}) {
    const [bulkText, setBulkText] = useState("");
    const [week, setWeek] = useState(1);
    const [group, setGroup] = useState("");
    const [format, setFormat] = useState<'BO1' | 'BO3' | 'BO5'>('BO1');
    const [t1Id, setT1Id] = useState<number>(0);
    const [t2Id, setT2Id] = useState<number>(0);
    const [processing, setProcessing] = useState(false);
    const [status, setStatus] = useState<string | null>(null);
    const [scheduledMatches, setScheduledMatches] = useState<any[]>([]);
    const [filterWeek, setFilterWeek] = useState<number | 'all'>('all');

    const loadScheduled = async () => {
        const { getAllMatches } = await import("@/lib/data");
        const all = await getAllMatches();
        setScheduledMatches(all.filter(m => m.status === 'scheduled'));
    };

    useEffect(() => { loadScheduled(); }, []);

    const handleBulkAdd = async () => {
        if (!bulkText.trim()) return;
        setProcessing(true);
        setStatus(null);
        try {
            const lines = bulkText.split('\n').filter(l => l.includes('vs'));
            const matchesToCreate = lines.map(line => {
                const [ta, tb] = line.split(/vs/i).map(s => s.trim());
                const teamA = teams.find(t => t.name.toLowerCase() === ta.toLowerCase() || t.tag.toLowerCase() === ta.toLowerCase());
                const teamB = teams.find(t => t.name.toLowerCase() === tb.toLowerCase() || t.tag.toLowerCase() === tb.toLowerCase());
                if (!teamA || !teamB) return null;
                return {
                    week,
                    group_name: group || teamA.group_name,
                    team1_id: teamA.id,
                    team2_id: teamB.id,
                    status: 'scheduled' as const,
                    format,
                    maps_played: 0,
                    winner_id: null
                };
            }).filter(Boolean) as any[];

            if (matchesToCreate.length > 0) {
                const { bulkCreateMatches } = await import("@/lib/data");
                await bulkCreateMatches(matchesToCreate);
                setBulkText("");
                setStatus(`✓ Added ${matchesToCreate.length} matches!`);
                onUpdate();
                await loadScheduled();
            } else {
                setStatus("No valid matches found. Format: 'Team A vs Team B'");
            }
        } catch {
            setStatus("Error adding matches");
        } finally {
            setProcessing(false);
        }
    };

    const handleDeleteMatch = async (id: number) => {
        if (!confirm(`Delete match #${id}?`)) return;
        try {
            await fetch('/api/admin/matches/delete', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id })
            } as any);
            setScheduledMatches(prev => prev.filter(m => m.id !== id));
            onUpdate();
        } catch { }
    };

    const displayMatches = filterWeek === 'all' ? scheduledMatches : scheduledMatches.filter(m => m.week === filterWeek);

    return (
        <div className="space-y-8 animate-in fade-in duration-500">
            <div className="grid md:grid-cols-2 gap-8">
                {/* Single Match Add */}
                <div className="glass p-8 space-y-6">
                    <h3 className="font-display text-xl font-black text-val-red uppercase italic">Quick Add Match</h3>
                    <div className="grid gap-4">
                        <div className="grid grid-cols-3 gap-3">
                            <div>
                                <label className="text-[10px] font-black uppercase tracking-widest text-foreground/40 block mb-2">Week</label>
                                <input
                                    type="number"
                                    value={week}
                                    onChange={e => setWeek(parseInt(e.target.value))}
                                    className="w-full bg-white/5 border border-white/10 rounded p-2 text-sm focus:border-val-red outline-none transition-colors"
                                />
                            </div>
                            <div>
                                <label className="text-[10px] font-black uppercase tracking-widest text-foreground/40 block mb-2">Format</label>
                                <select value={format} onChange={e => setFormat(e.target.value as any)} className="w-full bg-white/5 border border-white/10 rounded p-2 text-sm focus:border-val-red outline-none">
                                    <option value="BO1" className="bg-background">BO1</option>
                                    <option value="BO3" className="bg-background">BO3</option>
                                    <option value="BO5" className="bg-background">BO5</option>
                                </select>
                            </div>
                            <div>
                                <label className="text-[10px] font-black uppercase tracking-widest text-foreground/40 block mb-2">Group</label>
                                <input
                                    type="text"
                                    placeholder="e.g. ALPHA"
                                    value={group}
                                    onChange={e => setGroup(e.target.value.toUpperCase())}
                                    className="w-full bg-white/5 border border-white/10 rounded p-2 text-sm focus:border-val-red outline-none transition-colors"
                                />
                            </div>
                        </div>

                        <div className="space-y-4">
                            <div>
                                <label className="text-[10px] font-black uppercase tracking-widest text-foreground/40 block mb-2">Team 1</label>
                                <select
                                    value={t1Id}
                                    onChange={e => setT1Id(parseInt(e.target.value))}
                                    className="w-full bg-white/5 border border-white/10 rounded p-2 text-sm focus:border-val-red outline-none transition-colors"
                                >
                                    <option value={0} className="bg-background">Select Team</option>
                                    {teams.map(t => <option key={t.id} value={t.id} className="bg-background">{t.name} [{t.tag}]</option>)}
                                </select>
                            </div>
                            <div className="text-center font-display font-black text-val-red/20 italic">VS</div>
                            <div>
                                <label className="text-[10px] font-black uppercase tracking-widest text-foreground/40 block mb-2">Team 2</label>
                                <select
                                    value={t2Id}
                                    onChange={e => setT2Id(parseInt(e.target.value))}
                                    className="w-full bg-white/5 border border-white/10 rounded p-2 text-sm focus:border-val-red outline-none transition-colors"
                                >
                                    <option value={0} className="bg-background">Select Team</option>
                                    {teams.map(t => <option key={t.id} value={t.id} className="bg-background">{t.name} [{t.tag}]</option>)}
                                </select>
                            </div>
                        </div>

                        <button
                            disabled={!t1Id || !t2Id || processing}
                            onClick={async () => {
                                setProcessing(true);
                                setStatus(null);
                                try {
                                    const { createMatch } = await import("@/lib/data");
                                    await createMatch({
                                        week,
                                        group_name: group || teams.find(t => t.id === t1Id)?.group_name || "N/A",
                                        team1_id: t1Id,
                                        team2_id: t2Id,
                                        status: 'scheduled',
                                        format,
                                        maps_played: 0,
                                        winner_id: null
                                    });
                                    setStatus("✓ Match added!");
                                    setT1Id(0);
                                    setT2Id(0);
                                    onUpdate();
                                    await loadScheduled();
                                } catch {
                                    setStatus("Error creating match");
                                } finally {
                                    setProcessing(false);
                                }
                            }}
                            className="w-full py-3 bg-val-red text-white font-display font-black uppercase tracking-widest text-xs rounded shadow-[0_0_20px_rgba(255,70,85,0.3)] hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 disabled:scale-100"
                        >
                            {processing ? "Adding..." : "Add to Schedule"}
                        </button>
                    </div>
                </div>

                {/* Bulk Add */}
                <div className="glass p-8 space-y-6">
                    <div className="flex justify-between items-center">
                        <h3 className="font-display text-xl font-black text-val-blue uppercase italic">Bulk Add Matches</h3>
                        <span className="text-[10px] font-black text-foreground/20 uppercase tracking-widest">Parser Mode</span>
                    </div>
                    <p className="text-[10px] text-foreground/40 font-bold uppercase tracking-widest leading-relaxed">
                        Paste matches below. Format: <span className="text-val-blue">TEAM Name vs OTHER Team</span>. One per line.
                    </p>
                    <textarea
                        value={bulkText}
                        onChange={e => setBulkText(e.target.value)}
                        placeholder={"Team A vs Team B\nTeam C vs Team D"}
                        className="w-full h-40 bg-white/5 border border-white/10 rounded p-4 text-sm font-mono focus:border-val-blue outline-none transition-colors resize-none"
                    />
                    <button
                        disabled={!bulkText.trim() || processing}
                        onClick={handleBulkAdd}
                        className="w-full py-3 bg-val-blue text-white font-display font-black uppercase tracking-widest text-xs rounded shadow-[0_0_20px_rgba(63,209,255,0.3)] hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 disabled:scale-100"
                    >
                        {processing ? "Parsing & Saving..." : "Bulk Save Schedule"}
                    </button>
                    {status && (
                        <div className={`text-xs font-bold uppercase tracking-widest ${status.startsWith('✓') ? 'text-val-blue' : 'text-val-red'}`}>{status}</div>
                    )}
                </div>
            </div>

            {/* Existing Scheduled Matches */}
            <div className="glass p-8 space-y-4">
                <div className="flex items-center justify-between">
                    <h3 className="font-display text-xl font-black uppercase">Scheduled Matches</h3>
                    <div className="flex items-center gap-3">
                        <button onClick={loadScheduled} className="px-3 py-1 bg-white/10 rounded text-[10px] font-black uppercase tracking-widest">↻ Refresh</button>
                        <select value={filterWeek} onChange={e => setFilterWeek(e.target.value === 'all' ? 'all' : parseInt(e.target.value))} className="bg-white/5 border border-white/10 rounded p-2 text-xs outline-none">
                            <option value="all" className="bg-background">All Weeks</option>
                            {[1, 2, 3, 4, 5, 6].map(w => <option key={w} value={w} className="bg-background">Week {w}</option>)}
                        </select>
                    </div>
                </div>
                <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                        <thead>
                            <tr className="text-left text-[10px] font-black uppercase tracking-widest text-foreground/40 border-b border-white/5">
                                <th className="py-2 pr-4">ID</th>
                                <th className="py-2 pr-4">Week</th>
                                <th className="py-2 pr-4">Group</th>
                                <th className="py-2 pr-4">Team 1</th>
                                <th className="py-2 pr-4">Team 2</th>
                                <th className="py-2 pr-4">Format</th>
                                <th className="py-2">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                            {displayMatches.length === 0 ? (
                                <tr><td colSpan={7} className="py-6 text-center text-foreground/30 text-xs font-bold uppercase tracking-widest">No scheduled matches</td></tr>
                            ) : displayMatches.map(m => (
                                <tr key={m.id} className="hover:bg-white/5 transition-colors">
                                    <td className="py-2 pr-4 font-mono text-xs text-foreground/50">#{m.id}</td>
                                    <td className="py-2 pr-4 text-xs">W{m.week}</td>
                                    <td className="py-2 pr-4 text-xs text-foreground/60">{m.group_name}</td>
                                    <td className="py-2 pr-4 text-xs font-bold">{m.team1.name}</td>
                                    <td className="py-2 pr-4 text-xs font-bold">{m.team2.name}</td>
                                    <td className="py-2 pr-4 text-[10px] font-black text-foreground/50">{m.format}</td>
                                    <td className="py-2">
                                        <button
                                            onClick={() => handleDeleteMatch(m.id)}
                                            className="px-3 py-1 bg-val-red/20 hover:bg-val-red text-val-red hover:text-white text-[10px] font-black uppercase tracking-widest rounded transition-all"
                                        >
                                            Delete
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}


/**
 * Playoff Bracket Editor Component
 */
function PlayoffBracketEditor({
    teams,
    matches,
    onUpdate
}: {
    teams: { id: number, name: string, tag: string, group_name: string }[],
    matches: PlayoffMatch[],
    onUpdate: () => void
}) {
    const [saving, setSaving] = useState(false);
    const [proposals, setProposals] = useState<Array<any>>([]);
    const [creatingR1, setCreatingR1] = useState(false);
    const [creatingR2, setCreatingR2] = useState(false);
    const [round2Byes, setRound2Byes] = useState<Array<number | null>>(Array.from({ length: 8 }, () => null));
    const [byeOptions, setByeOptions] = useState<Array<{ id: number, name: string, tag: string, group_name: string }>>([]);
    const [autoAdvance, setAutoAdvance] = useState(true);
    useEffect(() => {
        import('@/lib/data').then(({ getStandings }) => {
            getStandings().then(gs => {
                const opts: Array<{ id: number, name: string, tag: string, group_name: string }> = [];
                Array.from(gs.entries()).forEach(([group, rows]) => {
                    rows.slice(0, 2).forEach(r => {
                        opts.push({ id: r.id, name: r.name, tag: r.tag || '', group_name: group });
                    });
                });
                setByeOptions(opts);
            });
        });
        try {
            const av = window.localStorage.getItem('playoffs_auto_advance');
            if (av) setAutoAdvance(av === '1');
        } catch { }
    }, []);

    useEffect(() => {
        if (!autoAdvance) return;
        const id = setInterval(async () => {
            try {
                const { computeBracketAdvancements, applyBracketAdvancements } = await import('@/lib/data');
                const acts = await computeBracketAdvancements();
                if (acts.length > 0) {
                    await applyBracketAdvancements(acts);
                    onUpdate();
                }
            } catch { }
        }, 8000);
        return () => clearInterval(id);
    }, [autoAdvance, matches.length]);

    const rounds = [
        { id: 1, name: "Round of 24", slots: 8 },
        { id: 2, name: "Round of 16", slots: 8 },
        { id: 3, name: "Quarter-finals", slots: 4 },
        { id: 4, name: "Semi-finals", slots: 2 },
        { id: 5, name: "Grand Final", slots: 1 }
    ];

    const getMatchAt = (roundId: number, pos: number) =>
        matches.find(m => m.playoff_round === roundId && m.bracket_pos === pos);

    const handleAssign = async (matchId: number, which: 'team1_id' | 'team2_id', teamId: number) => {
        setSaving(true);
        try {
            await updateMatch(matchId, { [which]: teamId });
            onUpdate();
        } finally {
            setSaving(false);
        }
    };

    return (
        <section className="space-y-6">
            <h2 className="font-display text-xl font-black text-val-blue uppercase italic">
                Playoff Bracket Editor
            </h2>
            <div className="glass p-4 rounded border border-white/5">
                <div className="grid md:grid-cols-2 gap-4">
                    <div className="space-y-3">
                        <div className="text-[10px] font-black uppercase tracking-widest text-foreground/40">Round 1 (8 matches)</div>
                        <button
                            onClick={async () => {
                                setCreatingR1(true);
                                try {
                                    const existing = matches.filter(m => m.playoff_round === 1).length;
                                    const needed = Math.max(0, 8 - existing);
                                    if (needed > 0) {
                                        const payload = [];
                                        for (let i = existing + 1; i <= 8; i++) {
                                            payload.push({
                                                week: 0,
                                                group_name: 'Playoffs',
                                                team1_id: null,
                                                team2_id: null,
                                                status: 'scheduled',
                                                format: 'BO3',
                                                maps_played: 0,
                                                match_type: 'playoff',
                                                playoff_round: 1,
                                                bracket_pos: i,
                                                bracket_label: `R1 #${i}`
                                            });
                                        }
                                        await fetch('/api/admin/matches/bulk', {
                                            method: 'POST',
                                            headers: { 'Content-Type': 'application/json' },
                                            body: JSON.stringify(payload)
                                        } as any);
                                    }
                                    onUpdate();
                                } finally {
                                    setCreatingR1(false);
                                }
                            }}
                            className="px-4 py-2 bg-val-blue text-white rounded text-xs font-black uppercase tracking-widest disabled:opacity-50"
                            disabled={creatingR1}
                        >
                            {creatingR1 ? "Creating..." : "Create Round 1 Matches"}
                        </button>
                    </div>
                    <div className="space-y-3">
                        <div className="text-[10px] font-black uppercase tracking-widest text-foreground/40">Round 2 BYE Seeds (8 matches)</div>
                        <div className="grid grid-cols-2 gap-2">
                            {round2Byes.map((val, idx) => (
                                <select
                                    key={idx}
                                    value={val || 0}
                                    onChange={e => {
                                        const next = [...round2Byes]; next[idx] = parseInt(e.target.value) || null; setRound2Byes(next);
                                    }}
                                    className="bg-white/5 border border-white/10 rounded p-2 text-xs"
                                >
                                    <option value={0}>BYE Seed #{idx + 1}</option>
                                    {byeOptions.map(t => <option key={t.id} value={t.id}>{t.name} [{t.tag}] • {t.group_name}</option>)}
                                </select>
                            ))}
                        </div>
                        <button
                            onClick={async () => {
                                setCreatingR2(true);
                                try {
                                    for (let i = 1; i <= 8; i++) {
                                        const byeTeam = round2Byes[i - 1];
                                        const { data: existing } = await supabase
                                            .from('matches')
                                            .select('*')
                                            .eq('match_type', 'playoff')
                                            .eq('playoff_round', 2)
                                            .eq('bracket_pos', i)
                                            .limit(1);
                                        if (existing && existing.length > 0) {
                                            // update team1 with BYE if provided
                                            if (byeTeam) {
                                                await updateMatch(existing[0].id, { team1_id: byeTeam });
                                            }
                                        } else {
                                            await fetch('/api/admin/matches/create', {
                                                method: 'POST',
                                                headers: { 'Content-Type': 'application/json' },
                                                body: JSON.stringify({
                                                    week: 0,
                                                    group_name: 'Playoffs',
                                                    team1_id: byeTeam || null,
                                                    team2_id: null,
                                                    status: 'scheduled',
                                                    format: 'BO3',
                                                    maps_played: 0,
                                                    match_type: 'playoff',
                                                    playoff_round: 2,
                                                    bracket_pos: i,
                                                    bracket_label: `R2 #${i}`
                                                })
                                            } as any);
                                        }
                                    }
                                    onUpdate();
                                } finally {
                                    setCreatingR2(false);
                                }
                            }}
                            className="px-4 py-2 bg-val-red text-white rounded text-xs font-black uppercase tracking-widest disabled:opacity-50"
                            disabled={creatingR2}
                        >
                            {creatingR2 ? "Seeding..." : "Seed Round 2 BYEs"}
                        </button>
                    </div>
                </div>
            </div>
            <div className="min-w-[1000px] grid grid-cols-5 gap-6">
                {rounds.map((round) => (
                    <div key={round.id} className="space-y-4">
                        <div className="text-center font-display text-sm font-black uppercase tracking-widest text-foreground/60">
                            {round.name}
                        </div>
                        <div className="flex flex-col gap-3">
                            {Array.from({ length: round.slots }).map((_, idx) => {
                                const pos = idx + 1;
                                const match = getMatchAt(round.id, pos);
                                if (!match) {
                                    return (
                                        <div key={`${round.id}-${pos}`} className="glass p-4 border border-white/5 rounded">
                                            <div className="text-xs text-foreground/40 italic">Empty slot</div>
                                        </div>
                                    );
                                }
                                return (
                                    <div key={`${round.id}-${pos}`} className="glass p-4 border border-white/5 rounded space-y-3">
                                        <div className="text-[10px] font-black uppercase tracking-widest text-foreground/40">
                                            Match #{match.id}
                                        </div>
                                        <div className="grid grid-cols-2 gap-3 items-center">
                                            <div>
                                                <label className="text-[10px] font-black uppercase tracking-widest text-foreground/40 block mb-1">Team 1</label>
                                                <select
                                                    value={match.team1.id || 0}
                                                    onChange={e => handleAssign(match.id, 'team1_id', parseInt(e.target.value))}
                                                    className="w-full bg-white/5 border border-white/10 rounded p-2 text-xs focus:border-val-blue outline-none"
                                                >
                                                    <option value={0}>TBD</option>
                                                    {teams.map(t => <option key={t.id} value={t.id}>{t.name} [{t.tag}]</option>)}
                                                </select>
                                            </div>
                                            <div>
                                                <label className="text-[10px] font-black uppercase tracking-widest text-foreground/40 block mb-1">Team 2</label>
                                                <select
                                                    value={match.team2.id || 0}
                                                    onChange={e => handleAssign(match.id, 'team2_id', parseInt(e.target.value))}
                                                    className="w-full bg-white/5 border border-white/10 rounded p-2 text-xs focus:border-val-blue outline-none"
                                                >
                                                    <option value={0}>TBD</option>
                                                    {teams.map(t => <option key={t.id} value={t.id}>{t.name} [{t.tag}]</option>)}
                                                </select>
                                            </div>
                                        </div>
                                        <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-widest text-foreground/40">
                                            <span>Format: {match.format}</span>
                                            <span>Status: {match.status}</span>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                ))}
            </div>
            <div className="glass p-6 rounded border border-white/5 space-y-4">
                <div className="flex items-center justify-between">
                    <h3 className="font-display text-xl font-bold uppercase tracking-wider">Bracket Auto-Advancement</h3>
                    <div className="flex gap-3">
                        <button
                            onClick={async () => {
                                const { computeBracketAdvancements } = await import('@/lib/data');
                                const acts = await computeBracketAdvancements();
                                setProposals(acts);
                            }}
                            className="px-4 py-2 bg-white/10 text-foreground rounded text-xs font-black uppercase tracking-widest"
                        >
                            Scan Completed & Propose
                        </button>
                        <button
                            onClick={async () => {
                                if (proposals.length === 0) return;
                                const { applyBracketAdvancements } = await import('@/lib/data');
                                setSaving(true);
                                try {
                                    await applyBracketAdvancements(proposals);
                                    setProposals([]);
                                    onUpdate();
                                } finally {
                                    setSaving(false);
                                }
                            }}
                            className="px-4 py-2 bg-val-blue text-white rounded text-xs font-black uppercase tracking-widest disabled:opacity-50"
                            disabled={saving || proposals.length === 0}
                        >
                            Confirm & Apply
                        </button>
                        <label className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-foreground/60">
                            <input
                                type="checkbox"
                                checked={autoAdvance}
                                onChange={e => {
                                    const v = e.target.checked;
                                    setAutoAdvance(v);
                                    try { window.localStorage.setItem('playoffs_auto_advance', v ? '1' : '0'); } catch { }
                                }}
                            />
                            Auto-advance
                        </label>
                    </div>
                </div>
                {proposals.length > 0 ? (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left">
                            <thead>
                                <tr className="bg-white/5 text-xs font-bold uppercase tracking-widest text-foreground/40">
                                    <th className="px-4 py-2">Target</th>
                                    <th className="px-4 py-2">Title</th>
                                    <th className="px-4 py-2">Reason</th>
                                    <th className="px-4 py-2">Action</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/5">
                                {proposals.map((p, idx) => (
                                    <tr key={idx}>
                                        <td className="px-4 py-2 text-xs">R{p.target_round} #{p.bracket_pos}</td>
                                        <td className="px-4 py-2 text-xs">{p.title}</td>
                                        <td className="px-4 py-2 text-xs text-foreground/60">{p.reason}</td>
                                        <td className="px-4 py-2 text-xs">{p.kind.toUpperCase()}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    <div className="text-[10px] font-black uppercase tracking-widest text-foreground/40">No proposals yet. Click Scan to compute.</div>
                )}
            </div>
            {saving && (
                <div className="text-[10px] font-black uppercase tracking-widest text-val-blue">Saving changes...</div>
            )}
        </section>
    );
}

/**
 * Unified Score & Map Editor with Tracker.gg JSON import
 */
function ScoreMapEditor() {
    const [matchId, setMatchId] = useState<number>(0);
    const [selectedWeek, setSelectedWeek] = useState<number>(1);
    const [format, setFormat] = useState<'BO1' | 'BO3' | 'BO5'>('BO3');
    const [forfeit, setForfeit] = useState(false);
    const [jsonText, setJsonText] = useState("");
    const [saving, setSaving] = useState(false);
    const [status, setStatus] = useState<string | null>(null);
    const [ghId, setGhId] = useState<string>("");
    const [allMatches, setAllMatchesState] = useState<MatchEntry[]>([]);
    const [allPlayers, setAllPlayers] = useState<{ id: number; name: string; riot_id: string; default_team_id: number | null }[]>([]);
    const [pendingId, setPendingId] = useState<number | null>(null);
    const [mapIndex, setMapIndex] = useState(0);
    const [mapName, setMapName] = useState("Unknown");
    const [t1Rounds, setT1Rounds] = useState(0);
    const [t2Rounds, setT2Rounds] = useState(0);
    const [winnerId, setWinnerId] = useState<number | null>(null);
    const [team1Rows, setTeam1Rows] = useState<Array<{ player_id?: number; is_sub: boolean; subbed_for_id?: number; agent?: string; acs: number; kills: number; deaths: number; assists: number; conf: string }>>([]);
    const [team2Rows, setTeam2Rows] = useState<Array<{ player_id?: number; is_sub: boolean; subbed_for_id?: number; agent?: string; acs: number; kills: number; deaths: number; assists: number; conf: string }>>([]);
    const agentsList = ["Jett", "Viper", "Sage", "Sova", "Killjoy", "Cypher", "Omen", "Brimstone", "Raze", "Reyna", "Skye", "Astra", "Yoru", "Neon", "Harbor", "Fade", "Iso", "Clove"];

    useEffect(() => {
        import("@/lib/data").then(({ getAllMatches }) => {
            getAllMatches().then(ms => setAllMatchesState(ms));
        });
        supabase.from('players').select('id, name, riot_id, default_team_id').then(({ data }) => {
            setAllPlayers((data as any[]) || []);
        });
        try {
            const mid = window.localStorage.getItem('auto_selected_match_id');
            const wk = window.localStorage.getItem('auto_selected_match_week');
            const url = window.localStorage.getItem('auto_selected_match_url');
            const pid = window.localStorage.getItem('pending_match_db_id');
            const fmt = window.localStorage.getItem('pending_match_format');
            if (mid) setMatchId(parseInt(mid));
            if (wk) setSelectedWeek(parseInt(wk));
            if (url) {
                const m = url.match(/match\/([A-Za-z0-9\-]+)/);
                setGhId(m ? m[1] : url.replace(/[^A-Za-z0-9\-]/g, ''));
            }
            if (pid) setPendingId(parseInt(pid));
            if (fmt && (fmt === 'BO1' || fmt === 'BO3' || fmt === 'BO5')) setFormat(fmt as any);
        } catch { }
    }, []);

    const applyMatchData = async () => {
        try {
            setSaving(true);
            const sel = allMatches.find(m => m.id === matchId);
            if (!sel) return;
            let json: any;
            if (jsonText && jsonText.trim()) {
                json = JSON.parse(jsonText);
            } else if (ghId) {
                const cleaned = ghId.includes("tracker.gg") ? ghId.match(/match\/([A-Za-z0-9\-]+)/)?.[1] || ghId : ghId.replace(/[^A-Za-z0-9\-]/g, "");
                const r = await fetch(`/api/github/matches/resolve?mid=${encodeURIComponent(cleaned)}`);
                if (!r.ok) {
                    const txt = await r.text();
                    setStatus(`Error: ${txt}`);
                    return;
                }
                json = await r.json();
            } else {
                setStatus("Error: No match data source provided");
                return;
            }

            const roster1 = allPlayers.filter(p => p.default_team_id === sel.team1.id);
            const roster2 = allPlayers.filter(p => p.default_team_id === sel.team2.id);
            const roster1Rids = roster1.map(p => String(p.riot_id || "").trim().toLowerCase()).filter(Boolean);
            const roster2Rids = roster2.map(p => String(p.riot_id || "").trim().toLowerCase()).filter(Boolean);

            const out = parseTrackerJson(json, sel.team1.id, sel.team2.id, roster1Rids, roster2Rids, mapIndex);

            const mapsArr = json?.maps || json?.data?.maps || [];
            if (Array.isArray(mapsArr)) {
                if (mapsArr.length <= 1) setFormat('BO1');
                else if (mapsArr.length <= 3) setFormat('BO3');
                else setFormat('BO5');
            }

            setMapName(out.map_name);
            setT1Rounds(Math.round(out.t1_rounds));
            setT2Rounds(Math.round(out.t2_rounds));
            if (out.t1_rounds > out.t2_rounds) setWinnerId(sel.team1.id);
            else if (out.t2_rounds > out.t1_rounds) setWinnerId(sel.team2.id);

            const labToId = new Map(allPlayers.map(p => [String(p.riot_id || "").trim().toLowerCase(), p.id]));
            const riotToLabel = new Map(allPlayers.map(p => [String(p.riot_id || "").trim().toLowerCase(), `${p.name} (${p.riot_id || ''})`]));

            const processTeam = (teamNum: 1 | 2, roster: typeof allPlayers) => {
                const teamSugRids = Object.keys(out.suggestions).filter(k => out.suggestions[k].team_num === teamNum);
                const rosterLabels = roster.map(p => `${p.name} (${p.riot_id || ''})`);
                const rosterMap = new Map(roster.map(p => [`${p.name} (${p.riot_id || ''})`, p.id]));
                const jsonRosterMatches: any[] = [];
                const jsonSubs: any[] = [];

                teamSugRids.forEach(rid => {
                    const s = out.suggestions[rid];
                    const label = riotToLabel.get(rid);
                    if (label && rosterLabels.includes(label)) {
                        jsonRosterMatches.push({ rid, label, s });
                    } else {
                        jsonSubs.push({ rid, label, s });
                    }
                });

                const rows: any[] = [];
                const usedRoster = new Set(jsonRosterMatches.map(m => m.label));
                const missingRoster = rosterLabels.filter(l => !usedRoster.has(l));

                jsonRosterMatches.forEach(m => {
                    rows.push({
                        player_id: labToId.get(m.rid),
                        is_sub: false,
                        subbed_for_id: labToId.get(m.rid),
                        agent: m.s.agent,
                        acs: Math.round(m.s.acs),
                        kills: m.s.k,
                        deaths: m.s.d,
                        assists: m.s.a,
                        conf: m.s.conf || "-"
                    });
                });

                jsonSubs.forEach(m => {
                    if (rows.length >= 5) return;
                    const subForLabel = missingRoster.shift() || (rosterLabels[0] || "");
                    rows.push({
                        player_id: labToId.get(m.rid),
                        is_sub: true,
                        subbed_for_id: rosterMap.get(subForLabel),
                        agent: m.s.agent,
                        acs: Math.round(m.s.acs),
                        kills: m.s.k,
                        deaths: m.s.d,
                        assists: m.s.a,
                        conf: m.s.conf || "-"
                    });
                });

                while (rows.length < 5) {
                    const label = missingRoster.shift() || (rosterLabels[0] || "");
                    rows.push({
                        player_id: rosterMap.get(label),
                        is_sub: false,
                        subbed_for_id: rosterMap.get(label),
                        agent: agentsList[0],
                        acs: 0,
                        kills: 0,
                        deaths: 0,
                        assists: 0,
                        conf: "-"
                    });
                }
                return rows.slice(0, 5);
            };

            setTeam1Rows(processTeam(1, roster1));
            setTeam2Rows(processTeam(2, roster2));
            setStatus("Data applied from Tracker.gg");
        } catch (e: any) {
            setStatus(`Error: ${e.message}`);
        } finally {
            setSaving(false);
        }
    };

    const saveForfeitMatch = async () => {
        if (!matchId) return;
        setSaving(true);
        try {
            await clearMatchDetails(matchId);
            const sel = allMatches.find(m => m.id === matchId);
            const s1 = forfeit ? 13 : 0;
            const s2 = forfeit ? 0 : 13;
            const winner_id = s1 > s2 ? sel?.team1.id : sel?.team2.id;
            await updateMatch(matchId, { score_t1: s1, score_t2: s2, winner_id, status: 'completed', format, maps_played: 0, is_forfeit: true as any });
            setStatus("Saved");
        } catch {
            setStatus("Error");
        } finally {
            setSaving(false);
        }
    };

    const saveCurrentMap = async () => {
        if (!matchId) return;
        setSaving(true);
        setStatus(null);
        try {
            const sel = allMatches.find(m => m.id === matchId);
            const payloadRows = [
                ...team1Rows.map(r => ({ team_id: sel?.team1.id as number, ...r })),
                ...team2Rows.map(r => ({ team_id: sel?.team2.id as number, ...r })),
            ].filter(r => r.player_id);

            await saveMapResults(matchId, {
                index: mapIndex,
                name: mapName,
                t1_rounds: t1Rounds,
                t2_rounds: t2Rounds,
                winner_id: winnerId,
                is_forfeit: false
            }, payloadRows.map(r => ({
                team_id: r.team_id,
                player_id: r.player_id as number,
                is_sub: r.is_sub,
                subbed_for_id: r.subbed_for_id ?? null,
                agent: r.agent || "Unknown",
                acs: r.acs,
                kills: r.kills,
                deaths: r.deaths,
                assists: r.assists
            })), {
                pendingId: pendingId || undefined,
                url: window.localStorage.getItem('auto_selected_match_url') || undefined
            });

            window.localStorage.removeItem('auto_selected_match_id');
            window.localStorage.removeItem('pending_match_db_id');
            setStatus("Saved successfully");
        } catch (e: any) {
            setStatus(`Error: ${e.message}`);
        } finally {
            setSaving(false);
        }
    };

    return (
        <section className="glass p-12 space-y-6">
            <h3 className="font-display text-2xl font-black text-val-red uppercase italic">Unified Score Editor</h3>
            <p className="text-foreground/40 text-sm font-medium">Enter map results and player stats exactly as production.</p>
            <div className="grid md:grid-cols-2 gap-8">
                <div className="space-y-4">
                    <label className="text-[10px] font-black uppercase tracking-widest text-foreground/40 block mb-2">Week & Match</label>
                    <div className="grid grid-cols-2 gap-2">
                        <select
                            value={selectedWeek}
                            onChange={e => setSelectedWeek(parseInt(e.target.value))}
                            className="bg-white/5 border border-white/10 rounded p-2 text-sm text-white outline-none focus:border-val-red"
                        >
                            {[1, 2, 3, 4, 5, 6].map(w => <option key={w} value={w} className="bg-background">Week {w}</option>)}
                        </select>
                        <select
                            value={matchId}
                            onChange={e => setMatchId(parseInt(e.target.value))}
                            className="bg-white/5 border border-white/10 rounded p-2 text-sm text-white outline-none focus:border-val-red"
                        >
                            <option value={0} className="bg-background">Select Match</option>
                            {allMatches.filter(m => m.week === selectedWeek).map(m => (
                                <option key={m.id} value={m.id} className="bg-background text-xs">
                                    ID {m.id}: {m.team1.name} vs {m.team2.name}
                                </option>
                            ))}
                        </select>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="text-[10px] font-black uppercase tracking-widest text-foreground/40 block mb-2">Format</label>
                            <select
                                value={format}
                                onChange={e => setFormat(e.target.value as any)}
                                className="w-full bg-white/5 border border-white/10 rounded p-2 text-sm text-white outline-none focus:border-val-red"
                            >
                                <option value="BO1" className="bg-background">BO1</option>
                                <option value="BO3" className="bg-background">BO3</option>
                                <option value="BO5" className="bg-background">BO5</option>
                            </select>
                        </div>
                        <div className="flex items-end pb-2">
                            <label className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-foreground/60 cursor-pointer">
                                <input type="checkbox" checked={forfeit} onChange={e => setForfeit(e.target.checked)} className="accent-val-red" />
                                Match Forfeit
                            </label>
                        </div>
                    </div>
                    <div>
                        <label className="text-[10px] font-black uppercase tracking-widest text-foreground/40 block mb-2">Tracker URL or ID (Auto-Fill)</label>
                        <div className="flex gap-2">
                            <input
                                value={ghId}
                                onChange={e => setGhId(e.target.value)}
                                placeholder="Match ID or tracker.gg URL"
                                className="flex-1 bg-white/5 border border-white/10 rounded p-2 text-sm text-white outline-none focus:border-val-blue"
                            />
                            <button
                                onClick={async () => { await applyMatchData(); }}
                                className="px-4 bg-val-blue text-white font-black uppercase tracking-widest text-[10px] rounded"
                            >
                                Apply
                            </button>
                        </div>
                    </div>
                    {forfeit && (
                        <button
                            onClick={saveForfeitMatch}
                            className="w-full py-3 bg-val-red text-white font-display font-black uppercase tracking-widest text-xs rounded"
                        >
                            Save Forfeit Match
                        </button>
                    )}
                </div>
                <div className="space-y-4">
                    <label className="text-[10px] font-black uppercase tracking-widest text-foreground/40 block mb-2">Map Info</label>
                    <div className="grid grid-cols-4 gap-2">
                        <div>
                            <label className="text-[8px] font-black uppercase tracking-widest text-foreground/40 block mb-1">Index</label>
                            <select value={mapIndex} onChange={e => setMapIndex(parseInt(e.target.value))} className="w-full bg-white/5 border border-white/10 rounded p-2 text-xs">
                                {Array.from({ length: format === 'BO1' ? 1 : format === 'BO3' ? 3 : 5 }).map((_, i) => (
                                    <option key={i} value={i} className="bg-background">{i + 1}</option>
                                ))}
                            </select>
                        </div>
                        <div className="col-span-3">
                            <label className="text-[8px] font-black uppercase tracking-widest text-foreground/40 block mb-1">Map Name</label>
                            <select value={mapName} onChange={e => setMapName(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded p-2 text-xs">
                                {["Unknown", "Ascent", "Bind", "Breeze", "Fracture", "Haven", "Icebox", "Lotus", "Pearl", "Split", "Sunset", "Abyss"].map(m => (
                                    <option key={m} value={m} className="bg-background">{m}</option>
                                ))}
                            </select>
                        </div>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                        <div>
                            <label className="text-[8px] font-black uppercase tracking-widest text-foreground/40 block mb-1">T1 Score</label>
                            <input type="number" value={t1Rounds} onChange={e => setT1Rounds(parseInt(e.target.value) || 0)} className="w-full bg-white/5 border border-white/10 rounded p-2 text-xs" />
                        </div>
                        <div>
                            <label className="text-[8px] font-black uppercase tracking-widest text-foreground/40 block mb-1">T2 Score</label>
                            <input type="number" value={t2Rounds} onChange={e => setT2Rounds(parseInt(e.target.value) || 0)} className="w-full bg-white/5 border border-white/10 rounded p-2 text-xs" />
                        </div>
                        <div>
                            <label className="text-[8px] font-black uppercase tracking-widest text-foreground/40 block mb-1">Winner</label>
                            <select value={winnerId || 0} onChange={e => setWinnerId(parseInt(e.target.value) || null)} className="w-full bg-white/5 border border-white/10 rounded p-2 text-xs">
                                <option value={0} className="bg-background">TBD</option>
                                {(() => {
                                    const sel = allMatches.find(m => m.id === matchId);
                                    if (!sel) return null;
                                    return (
                                        <>
                                            <option value={sel.team1.id} className="bg-background">{sel.team1.name}</option>
                                            <option value={sel.team2.id} className="bg-background">{sel.team2.name}</option>
                                        </>
                                    );
                                })()}
                            </select>
                        </div>
                    </div>
                </div>
            </div>
            <div className="space-y-10 pt-4">
                {[1, 2].map(teamNum => {
                    const sel = allMatches.find(m => m.id === matchId);
                    if (!sel) return null;
                    const teamId = teamNum === 1 ? sel.team1.id : sel.team2.id;
                    const teamName = teamNum === 1 ? sel.team1.name : sel.team2.name;
                    const roster = allPlayers.filter(p => p.default_team_id === teamId);
                    const rows = teamNum === 1 ? team1Rows : team2Rows;
                    const setRows = teamNum === 1 ? setTeam1Rows : setTeam2Rows;
                    const rosterOptions = roster.map(p => ({ id: p.id, label: `${p.name} (${p.riot_id || ''})` }));
                    const globalOptions = allPlayers.map(p => ({ id: p.id, label: `${p.name} (${p.riot_id || ''})` }));
                    return (
                        <div key={teamNum} className="glass p-6 border border-white/5 rounded-lg space-y-4">
                            <h5 className="font-display text-lg font-bold uppercase tracking-wider text-val-blue italic">{teamName} Scoreboard</h5>
                            <div className="space-y-2">
                                <div className="grid grid-cols-9 gap-2 items-center text-[10px] font-black uppercase tracking-widest text-foreground/30 px-2">
                                    <div className="col-span-1">Player</div>
                                    <div className="text-center">Sub</div>
                                    <div className="col-span-1">Subbing For</div>
                                    <div className="col-span-1">Agent</div>
                                    <div className="text-center">ACS</div>
                                    <div className="text-center">K</div>
                                    <div className="text-center">D</div>
                                    <div className="text-center">A</div>
                                    <div className="text-center">Conf</div>
                                </div>
                                {rows.map((row, idx) => (
                                    <div key={idx} className="grid grid-cols-9 gap-2 items-center bg-white/5 rounded p-1">
                                        <select
                                            value={row.player_id || 0}
                                            onChange={e => {
                                                const v = parseInt(e.target.value);
                                                const next = [...rows];
                                                const selectedPlayer = allPlayers.find(p => p.id === v);
                                                const isOnTeam = !!selectedPlayer && selectedPlayer.default_team_id === teamId;
                                                let subFor = v;
                                                if (!isOnTeam && v !== 0) {
                                                    const used = new Set(next.map(r => r.subbed_for_id).filter(Boolean));
                                                    subFor = roster.find(r => !used.has(r.id))?.id || roster[0]?.id || 0;
                                                }
                                                next[idx] = { ...row, player_id: v, subbed_for_id: subFor, is_sub: !isOnTeam && v !== 0 };
                                                setRows(next);
                                            }}
                                            className="bg-transparent text-white text-xs p-1 outline-none"
                                        >
                                            <option value={0} className="bg-background">Select</option>
                                            {globalOptions.map(o => <option key={o.id} value={o.id} className="bg-background">{o.label}</option>)}
                                        </select>
                                        <div className="flex justify-center">
                                            <input type="checkbox" checked={row.is_sub} onChange={e => {
                                                const next = [...rows]; next[idx] = { ...row, is_sub: e.target.checked };
                                                setRows(next);
                                            }} className="accent-val-red" />
                                        </div>
                                        <select
                                            value={row.subbed_for_id || 0}
                                            onChange={e => {
                                                const next = [...rows]; next[idx] = { ...row, subbed_for_id: parseInt(e.target.value) };
                                                setRows(next);
                                            }}
                                            className="bg-transparent text-white text-xs p-1 outline-none"
                                        >
                                            <option value={0} className="bg-background">Self</option>
                                            {rosterOptions.map(o => <option key={o.id} value={o.id} className="bg-background">{o.label}</option>)}
                                        </select>
                                        <select
                                            value={row.agent || ''}
                                            onChange={e => {
                                                const next = [...rows]; next[idx] = { ...row, agent: e.target.value };
                                                setRows(next);
                                            }}
                                            className="bg-transparent text-white text-xs p-1 outline-none"
                                        >
                                            {agentsList.map(a => <option key={a} value={a} className="bg-background">{a}</option>)}
                                        </select>
                                        <input type="number" value={row.acs} onChange={e => { const next = [...rows]; next[idx] = { ...row, acs: parseInt(e.target.value) || 0 }; setRows(next); }} className="bg-transparent text-center text-xs outline-none" />
                                        <input type="number" value={row.kills} onChange={e => { const next = [...rows]; next[idx] = { ...row, kills: parseInt(e.target.value) || 0 }; setRows(next); }} className="bg-transparent text-center text-xs outline-none" />
                                        <input type="number" value={row.deaths} onChange={e => { const next = [...rows]; next[idx] = { ...row, deaths: parseInt(e.target.value) || 0 }; setRows(next); }} className="bg-transparent text-center text-xs outline-none" />
                                        <input type="number" value={row.assists} onChange={e => { const next = [...rows]; next[idx] = { ...row, assists: parseInt(e.target.value) || 0 }; setRows(next); }} className="bg-transparent text-center text-xs outline-none" />
                                        <div className="text-[10px] text-center text-foreground/40 font-mono tracking-tighter">{row.conf || "-"}</div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    );
                })}
            </div>
            <div className="flex items-center justify-between gap-4 pt-6 border-t border-white/5">
                <div className={`text-xs font-black uppercase tracking-widest ${status?.includes('Error') ? 'text-val-red' : 'text-val-blue'}`}>
                    {status}
                </div>
                <button
                    disabled={saving || !matchId}
                    onClick={saveCurrentMap}
                    className="px-12 py-4 bg-val-blue text-white font-display font-black uppercase tracking-widest text-sm rounded shadow-[0_0_30px_rgba(63,209,255,0.2)] hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50"
                >
                    {saving ? "Saving..." : "Save Map & Results"}
                </button>
            </div>
        </section>
    );
}


/**
 * Players Admin: add/edit players and assign permanent subs
 */
function PlayersAdmin() {
    const [players, setPlayers] = useState<Array<{ id: number; name: string; riot_id: string; uuid?: string; rank?: string; tracker_link?: string; default_team_id?: number | null }>>([]);
    const [teams, setTeams] = useState<Array<{ id: number; name: string }>>([]);
    const [filter, setFilter] = useState("");
    const [form, setForm] = useState<{ name: string; riot_id: string; uuid: string; rank: string; tracker_link: string; team_id: number | null }>({ name: "", riot_id: "", uuid: "", rank: "Unranked", tracker_link: "", team_id: null });
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        supabase.from('teams').select('id, name').order('name').then(({ data }) => setTeams((data as any[]) || []));
        supabase.from('players').select('id, name, riot_id, uuid, rank, tracker_link, default_team_id').order('name').then(({ data }) => setPlayers((data as any[]) || []));
    }, []);

    const refresh = async () => {
        const { data } = await supabase.from('players').select('id, name, riot_id, rank, default_team_id').order('name');
        setPlayers((data as any[]) || []);
    };

    const addPlayer = async () => {
        if (!form.name.trim()) return;
        setSaving(true);
        try {
            await fetch('/api/admin/players/create', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: form.name.trim(),
                    riot_id: form.riot_id.trim() || null,
                    uuid: form.uuid.trim() || null,
                    rank: form.rank,
                    tracker_link: form.tracker_link.trim() || null,
                    default_team_id: form.team_id || null
                })
            } as any);
            setForm({ name: "", riot_id: "", uuid: "", rank: "Unranked", tracker_link: "", team_id: null });
            await refresh();
        } finally {
            setSaving(false);
        }
    };

    const deletePlayer = async (id: number, name: string) => {
        if (!confirm(`Delete player "${name}"? This will remove all their stats too.`)) return;
        setSaving(true);
        try {
            await fetch('/api/admin/players/delete', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id })
            } as any);
            setPlayers(prev => prev.filter(p => p.id !== id));
        } finally {
            setSaving(false);
        }
    };

    const filtered = players.filter(p => {
        const s = filter.toLowerCase();
        return !s || p.name.toLowerCase().includes(s) || (p.riot_id || "").toLowerCase().includes(s);
    });

    return (
        <section className="space-y-6">
            <h2 className="font-display text-xl font-black text-val-blue uppercase italic">Players Admin</h2>
            <div className="glass p-8 space-y-4">
                <h3 className="font-display text-lg font-black uppercase">Add Player</h3>
                <div className="grid md:grid-cols-2 gap-4">
                    <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Name (@discord)" className="bg-white/5 border border-white/10 rounded p-2 text-sm" />
                    <input value={form.riot_id} onChange={e => setForm({ ...form, riot_id: e.target.value })} placeholder="Riot ID" className="bg-white/5 border border-white/10 rounded p-2 text-sm" />
                    <input value={form.uuid} onChange={e => setForm({ ...form, uuid: e.target.value })} placeholder="UUID" className="bg-white/5 border border-white/10 rounded p-2 text-sm" />
                    <select value={form.rank} onChange={e => setForm({ ...form, rank: e.target.value })} className="bg-white/5 border border-white/10 rounded p-2 text-sm">
                        {["Unranked", "Iron/Bronze", "Silver", "Gold", "Platinum", "Diamond", "Ascendant", "Immortal 1/2", "Immortal 3/Radiant"].map(r => <option key={r} value={r}>{r}</option>)}
                    </select>
                    <input value={form.tracker_link} onChange={e => setForm({ ...form, tracker_link: e.target.value })} placeholder="Tracker Link" className="bg-white/5 border border-white/10 rounded p-2 text-sm" />
                    <select value={form.team_id || 0} onChange={e => setForm({ ...form, team_id: parseInt(e.target.value) || null })} className="bg-white/5 border border-white/10 rounded p-2 text-sm">
                        <option value={0}>No Team</option>
                        {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                </div>
                <button onClick={addPlayer} disabled={saving || !form.name.trim()} className="px-4 py-2 bg-val-blue text-white rounded text-xs font-black uppercase tracking-widest">
                    {saving ? "Saving..." : "Create Player"}
                </button>
            </div>

            <div className="glass p-8 space-y-4">
                <div className="flex items-center justify-between">
                    <h3 className="font-display text-lg font-black uppercase">Roster & Permanent Subs</h3>
                    <input value={filter} onChange={e => setFilter(e.target.value)} placeholder="Search by name or Riot ID" className="bg-white/5 border border-white/10 rounded p-2 text-sm w-64" />
                </div>
                <div className="overflow-x-auto">
                    <table className="min-w-[1100px] w-full text-sm">
                        <thead>
                            <tr className="text-left text-foreground/60">
                                <th className="py-2">Name</th>
                                <th className="py-2">Riot ID</th>
                                <th className="py-2">UUID</th>
                                <th className="py-2">Rank</th>
                                <th className="py-2">Tracker Link</th>
                                <th className="py-2">Team</th>
                                <th className="py-2">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.map(p => (
                                <tr key={p.id} className="border-t border-white/5">
                                    <td className="py-2">
                                        <input defaultValue={p.name} onBlur={e => fetch('/api/admin/players/update', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: p.id, update: { name: e.target.value } }) } as any)} className="bg-white/5 border border-white/10 rounded p-2 text-xs w-full" />
                                    </td>
                                    <td className="py-2">
                                        <input defaultValue={p.riot_id || ''} onBlur={e => fetch('/api/admin/players/update', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: p.id, update: { riot_id: e.target.value || null } }) } as any)} className="bg-white/5 border border-white/10 rounded p-2 text-xs w-full" />
                                    </td>
                                    <td className="py-2">
                                        <input defaultValue={p.uuid || ''} onBlur={e => fetch('/api/admin/players/update', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: p.id, update: { uuid: e.target.value || null } }) } as any)} className="bg-white/5 border border-white/10 rounded p-2 text-xs w-full" />
                                    </td>
                                    <td className="py-2">
                                        <select defaultValue={p.rank || 'Unranked'} onChange={e => fetch('/api/admin/players/update', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: p.id, update: { rank: e.target.value } }) } as any)} className="bg-white/5 border border-white/10 rounded p-2 text-xs w-full">
                                            {["Unranked", "Iron/Bronze", "Silver", "Gold", "Platinum", "Diamond", "Ascendant", "Immortal 1/2", "Immortal 3/Radiant"].map(r => <option key={r} value={r}>{r}</option>)}
                                        </select>
                                    </td>
                                    <td className="py-2">
                                        <input defaultValue={p.tracker_link || ''} onBlur={e => fetch('/api/admin/players/update', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: p.id, update: { tracker_link: e.target.value || null } }) } as any)} className="bg-white/5 border border-white/10 rounded p-2 text-xs w-full" />
                                    </td>
                                    <td className="py-2">
                                        <select defaultValue={p.default_team_id || 0} onChange={e => fetch('/api/admin/players/update', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: p.id, update: { default_team_id: parseInt(e.target.value) || null } }) } as any)} className="bg-white/5 border border-white/10 rounded p-2 text-xs w-full">
                                            <option value={0}>No Team</option>
                                            {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                                        </select>
                                    </td>
                                    <td className="py-2">
                                        <div className="flex gap-2">
                                            <button onClick={async () => { await refresh(); }} className="px-3 py-1 bg-white/10 rounded text-[10px] font-black uppercase tracking-widest">↻</button>
                                            <button onClick={() => deletePlayer(p.id, p.name)} className="px-3 py-1 bg-val-red/20 hover:bg-val-red text-val-red hover:text-white rounded text-[10px] font-black uppercase tracking-widest transition-all">Delete</button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </section>
    );
}
