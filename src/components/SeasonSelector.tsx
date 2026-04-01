'use client';

import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { useCallback, useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown } from 'lucide-react';

interface Season {
    id: string;
    name: string;
}

interface Props {
    seasons: Season[];
    currentSeasonId: string;
}

export default function SeasonSelector({ seasons, currentSeasonId }: Props) {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    const currentSeason = seasons.find(s => s.id === currentSeasonId) || seasons[0];

    const createQueryString = useCallback(
        (name: string, value: string) => {
            const params = new URLSearchParams(searchParams.toString());
            params.set(name, value);
            return params.toString();
        },
        [searchParams]
    );

    const handleSeasonChange = (id: string) => {
        setIsOpen(false);
        router.push(pathname + '?' + createQueryString('season', id));
    };

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    return (
        <div className="relative" ref={dropdownRef}>
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="flex items-center gap-3 bg-white/5 border border-white/10 rounded-xl px-4 py-2 hover:bg-white/10 transition-all group"
            >
                <div className="flex flex-col items-start">
                    <span className="text-[10px] font-black uppercase tracking-[0.2em] text-foreground/40 leading-none mb-1">Season</span>
                    <span className="text-sm font-black uppercase tracking-tighter text-val-red group-hover:text-white transition-colors">
                        {currentSeason?.name.replace('Season ', '') || currentSeasonId.replace('S', '')}
                    </span>
                </div>
                <ChevronDown className={`w-4 h-4 text-foreground/20 group-hover:text-white transition-all ${isOpen ? 'rotate-180' : ''}`} />
            </button>

            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ opacity: 0, y: 10, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 10, scale: 0.95 }}
                        className="absolute top-full mt-2 right-0 w-48 glass rounded-xl border border-white/10 shadow-2xl overflow-hidden z-[100]"
                    >
                        <div className="p-2 space-y-1">
                            {seasons.map((season) => (
                                <button
                                    key={season.id}
                                    onClick={() => handleSeasonChange(season.id)}
                                    className={`w-full flex items-center justify-between px-4 py-3 rounded-lg text-xs font-bold uppercase tracking-widest transition-all ${
                                        currentSeasonId === season.id
                                            ? 'bg-val-red text-white'
                                            : 'text-foreground/60 hover:text-white hover:bg-white/5'
                                    }`}
                                >
                                    {season.name}
                                    {currentSeasonId === season.id && (
                                        <div className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                                    )}
                                </button>
                            ))}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
