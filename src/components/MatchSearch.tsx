'use client';

import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface Team {
    id: number;
    name: string;
    tag: string;
}

interface Match {
    id: number;
    week: number;
    match_type: string;
    group_name: string;
    team1: Team;
    team2: Team;
}

interface Props {
    matches: Match[];
    onSelect: (id: number) => void;
    currentId: number | null;
}

export default function MatchSearch({ matches, onSelect, currentId }: Props) {
    const [query, setQuery] = useState('');
    const [isOpen, setIsOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    const filteredMatches = query.trim() === ''
        ? matches.slice(0, 50)
        : matches.filter(m =>
            m.team1.name.toLowerCase().includes(query.toLowerCase()) ||
            m.team2.name.toLowerCase().includes(query.toLowerCase()) ||
            m.team1.tag.toLowerCase().includes(query.toLowerCase()) ||
            m.team2.tag.toLowerCase().includes(query.toLowerCase()) ||
            String(m.id).includes(query)
        ).slice(0, 50);

    const currentMatch = matches.find(m => m.id === currentId);

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
        <div className="relative w-full" ref={containerRef}>
            <div
                className="glass rounded-lg border border-white/10 flex items-center px-4 py-2 cursor-text focus-within:border-val-blue transition-all"
                onClick={() => setIsOpen(true)}
            >
                <div className="flex-1">
                    <div className="text-[10px] font-black uppercase tracking-widest text-foreground/40 mb-0.5">Search Match</div>
                    <input
                        type="text"
                        placeholder="Team name or ID..."
                        value={isOpen ? query : (currentMatch ? `${currentMatch.team1.tag} vs ${currentMatch.team2.tag}` : query)}
                        onChange={(e) => {
                            setQuery(e.target.value);
                            setIsOpen(true);
                        }}
                        onFocus={() => setIsOpen(true)}
                        className="bg-transparent border-none outline-none w-full text-foreground font-bold text-sm"
                    />
                </div>
                <div className="text-foreground/40">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
                        className="absolute z-50 left-0 right-0 mt-2 glass rounded-xl border border-white/10 shadow-2xl overflow-hidden max-h-[400px] overflow-y-auto"
                    >
                        {filteredMatches.length > 0 ? (
                            filteredMatches.map(m => (
                                <button
                                    key={m.id}
                                    onClick={() => {
                                        onSelect(m.id);
                                        setQuery('');
                                        setIsOpen(false);
                                    }}
                                    className={`w-full text-left px-4 py-3 border-b border-white/5 last:border-0 hover:bg-val-blue/10 transition-colors ${m.id === currentId ? 'bg-val-blue/5 text-val-blue' : ''}`}
                                >
                                    <div className="flex items-center justify-between gap-4">
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 mb-1">
                                                <span className="text-[10px] font-black uppercase px-1.5 py-0.5 bg-white/5 rounded text-foreground/40">ID {m.id}</span>
                                                <span className="text-[10px] font-black uppercase px-1.5 py-0.5 bg-val-red/10 rounded text-val-red">
                                                    {m.match_type === 'playoff' ? 'Playoff' : `Week ${m.week}`}
                                                </span>
                                            </div>
                                            <div className="font-bold truncate">
                                                {m.team1.name} <span className="text-foreground/40 font-normal mx-1">vs</span> {m.team2.name}
                                            </div>
                                            <div className="text-[10px] text-foreground/40 uppercase tracking-widest mt-0.5">
                                                {m.group_name}
                                            </div>
                                        </div>
                                        {m.id === currentId && (
                                            <div className="w-2 h-2 rounded-full bg-val-blue flex-shrink-0" />
                                        )}
                                    </div>
                                </button>
                            ))
                        ) : (
                            <div className="px-4 py-8 text-center text-foreground/40 italic">
                                No matches found matching "{query}"
                            </div>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
