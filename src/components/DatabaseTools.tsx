"use client";

import { useState } from "react";

export default function DatabaseTools() {
    const [loading, setLoading] = useState(false);
    const [status, setStatus] = useState<{ type: 'success' | 'error', msg: string } | null>(null);

    const handleReset = async () => {
        if (!confirm("Are you sure you want to reset ALL tables? This cannot be undone.")) return;
        setLoading(true);
        try {
            const res = await fetch('/api/admin/db/reset', { method: 'POST' });
            if (res.ok) setStatus({ type: 'success', msg: 'Database reset successfully' });
            else setStatus({ type: 'error', msg: 'Reset failed' });
        } catch (e) {
            setStatus({ type: 'error', msg: 'Network error' });
        } finally {
            setLoading(true);
            window.location.reload();
        }
    };

    const handleExport = async () => {
        window.open('/api/admin/db/export', '_blank');
    };

    const handleBackup = async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/admin/db/backup', { method: 'POST' });
            const data = await res.json();
            if (res.ok) setStatus({ type: 'success', msg: data.message || 'Backup complete' });
            else setStatus({ type: 'error', msg: data.error || 'Backup failed' });
        } catch (e) {
            setStatus({ type: 'error', msg: 'Network error' });
        } finally {
            setLoading(false);
        }
    };

    const handleRestore = async () => {
        if (!confirm("Restore database from GitHub backup? Current local data will be replaced.")) return;
        setLoading(true);
        try {
            const res = await fetch('/api/admin/db/restore', { method: 'POST' });
            if (res.ok) {
                setStatus({ type: 'success', msg: 'Restore complete' });
                window.location.reload();
            } else {
                setStatus({ type: 'error', msg: 'Restore failed' });
            }
        } catch (e) {
            setStatus({ type: 'error', msg: 'Network error' });
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="space-y-12 animate-in fade-in duration-500">
            <section className="space-y-6">
                <h3 className="font-display text-xl font-black text-val-red uppercase italic flex items-center gap-4">
                    ⚠️ Database Reset
                    <div className="h-px flex-1 bg-white/5" />
                </h3>
                <div className="glass p-8 border-val-red/20 space-y-4">
                    <p className="text-xs text-foreground/40 font-bold uppercase tracking-widest">
                        Danger Zone: This will wipe all match results, player stats, and teams.
                    </p>
                    <button
                        disabled={loading}
                        onClick={handleReset}
                        className="px-6 py-3 bg-val-red text-white font-display font-black uppercase tracking-widest text-xs rounded shadow-[0_0_20px_rgba(255,70,85,0.3)] hover:scale-[1.02] active:scale-[0.98] transition-all"
                    >
                        Reset Database
                    </button>
                </div>
            </section>

            <div className="grid md:grid-cols-2 gap-8">
                <section className="space-y-6">
                    <h3 className="font-display text-xl font-black text-val-blue uppercase italic flex items-center gap-4">
                        📤 Data Export
                        <div className="h-px flex-1 bg-white/5" />
                    </h3>
                    <div className="glass p-8 space-y-4">
                        <p className="text-xs text-foreground/40 font-bold uppercase tracking-widest">
                            Download the current database as a SQLite .db file.
                        </p>
                        <button
                            onClick={handleExport}
                            className="px-6 py-3 bg-val-blue text-white font-display font-black uppercase tracking-widest text-xs rounded shadow-[0_0_20px_rgba(63,209,255,0.3)] hover:scale-[1.02] active:scale-[0.98] transition-all"
                        >
                            Export DB Bytes
                        </button>
                    </div>
                </section>

                <section className="space-y-6">
                    <h3 className="font-display text-xl font-black text-val-blue uppercase italic flex items-center gap-4">
                        ☁️ Cloud Backup
                        <div className="h-px flex-1 bg-white/5" />
                    </h3>
                    <div className="glass p-8 space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                            <button
                                disabled={loading}
                                onClick={handleBackup}
                                className="py-3 bg-white/5 hover:bg-white/10 text-foreground font-display font-black uppercase tracking-widest text-[10px] rounded transition-all"
                            >
                                Backup to GitHub
                            </button>
                            <button
                                disabled={loading}
                                onClick={handleRestore}
                                className="py-3 bg-white/5 hover:bg-white/10 text-foreground font-display font-black uppercase tracking-widest text-[10px] rounded transition-all"
                            >
                                Restore from GitHub
                            </button>
                        </div>
                        {status && (
                            <div className={`mt-4 text-[10px] font-black uppercase tracking-widest ${status.type === 'success' ? 'text-val-blue' : 'text-val-red'}`}>
                                {status.msg}
                            </div>
                        )}
                    </div>
                </section>
            </div>
        </div>
    );
}
