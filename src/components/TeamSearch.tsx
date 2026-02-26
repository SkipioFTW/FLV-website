'use client';

import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface Team {
    id: number;
    name: string;
    tag: string;
}

interface Props {
    teams: Team[];
    onSelect: (id: number) => void;
    currentId: number | null;
}

export default function TeamSearch({ teams, onSelect, currentId }: Props) {
    const [query, setQuery] = useState('');
    const [isOpen, setIsOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    const filteredTeams = query.trim() === ''
        ? teams.slice(0, 10)
        : teams.filter(t =>
            t.name.toLowerCase().includes(query.toLowerCase()) ||
            t.tag.toLowerCase().includes(query.toLowerCase())
        ).slice(0, 10);

    const currentTeam = teams.find(t => t.id === currentId);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    return (
        <div className="relative w-full max-w-md" ref={containerRef}>
            <div
                className="glass rounded-lg border border-white/10 flex items-center px-4 py-3 cursor-text focus-within:border-val-blue transition-all"
                onClick={() => setIsOpen(true)}
            >
                <div className="flex-1">
                    <input
                        type="text"
                        placeholder="Search Team Name or Tag..."
                        value={query || (isOpen ? '' : (currentTeam?.name || ''))}
                        onChange={(e) => {
                            setQuery(e.target.value);
                            setIsOpen(true);
                        }}
                        onFocus={() => setIsOpen(true)}
                        className="bg-transparent border-none outline-none w-full text-foreground font-bold uppercase tracking-wider"
                    />
                </div>
                <div className="text-foreground/40">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                </div>
            </div>

            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 10 }}
                        className="absolute z-50 left-0 right-0 mt-2 glass rounded-xl border border-white/10 shadow-2xl overflow-hidden max-h-[300px] overflow-y-auto"
                    >
                        {filteredTeams.length > 0 ? (
                            filteredTeams.map(t => (
                                <button
                                    key={t.id}
                                    onClick={() => {
                                        onSelect(t.id);
                                        setQuery('');
                                        setIsOpen(false);
                                    }}
                                    className={`w-full text-left px-4 py-3 flex items-center justify-between hover:bg-val-blue/10 transition-colors ${t.id === currentId ? 'bg-val-blue/5 text-val-blue' : ''}`}
                                >
                                    <div>
                                        <div className="font-bold uppercase tracking-wider">{t.name}</div>
                                        <div className="text-[10px] font-black text-foreground/40 italic">{t.tag}</div>
                                    </div>
                                    {t.id === currentId && (
                                        <div className="w-2 h-2 rounded-full bg-val-blue" />
                                    )}
                                </button>
                            ))
                        ) : (
                            <div className="px-4 py-8 text-center text-foreground/40 italic">
                                No teams found matching "{query}"
                            </div>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
