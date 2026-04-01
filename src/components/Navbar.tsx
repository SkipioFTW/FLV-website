"use client";

import React, { useState, useEffect, Suspense, useRef } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { useSearchParams, usePathname } from "next/navigation";
import { getSeasons, getDefaultSeason } from "@/lib/data";
import SeasonSelector from "./SeasonSelector";
import { Menu, MoreHorizontal, ChevronRight, LayoutGrid, Trophy, Users, Shield, Zap, Info, Lock } from "lucide-react";

const mainNavItems = [
    { name: "Overview", href: "/", icon: LayoutGrid },
    { name: "Matches", href: "/matches", icon: Zap },
    { name: "Standings", href: "/standings", icon: Trophy },
    { name: "Leaderboard", href: "/leaderboard", icon: Trophy },
    { name: "Players", href: "/players", icon: Users },
    { name: "Teams", href: "/teams", icon: Shield },
];

const moreNavItems = [
    { name: "Match Summary", href: "/summary" },
    { name: "Subs", href: "/substitutions" },
    { name: "Predictions", href: "/predictions" },
    { name: "Playoffs", href: "/playoffs" },
];

function NavbarContent() {
    const [hoveredPath, setHoveredPath] = useState<string | null>(null);
    const [seasons, setSeasons] = useState<{ id: string, name: string }[]>([]);
    const [currentSeasonId, setCurrentSeasonId] = useState<string>("");
    const [isMoreOpen, setIsMoreOpen] = useState(false);
    const [isMobileOpen, setIsMobileOpen] = useState(false);
    const searchParams = useSearchParams();
    const pathname = usePathname();
    const moreRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const loadSeasons = async () => {
            const data = await getSeasons();
            setSeasons(data);
            
            const seasonFromUrl = searchParams.get('season');
            if (seasonFromUrl) {
                setCurrentSeasonId(seasonFromUrl);
            } else {
                const def = await getDefaultSeason();
                setCurrentSeasonId(def);
            }
        };
        loadSeasons();
    }, [searchParams]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (moreRef.current && !moreRef.current.contains(event.target as Node)) {
                setIsMoreOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const getFullHref = (href: string) => {
        const season = searchParams.get('season');
        return season ? `${href}?season=${season}` : href;
    };

    return (
        <nav className="fixed top-0 left-0 w-full z-50 px-6 py-4">
            <div className="max-w-7xl mx-auto flex items-center justify-between glass px-6 py-2.5 rounded-2xl border border-white/5 shadow-2xl relative">
                {/* Logo */}
                <Link href={getFullHref('/')} className="flex items-center gap-3 group shrink-0 mr-4">
                    <div className="w-9 h-9 bg-val-red rotate-45 flex items-center justify-center group-hover:rotate-90 transition-transform duration-500">
                        <div className="w-4 h-4 bg-white -rotate-45" />
                    </div>
                    <span className="font-display text-lg font-bold tracking-tighter uppercase leading-none hidden lg:block">
                        {currentSeasonId === 'all' ? 'Career' : currentSeasonId} <span className="text-val-red">Portal</span>
                    </span>
                </Link>

                {/* Desktop Nav - Main Items */}
                <div className="hidden md:flex items-center gap-0.5 overflow-hidden">
                    {mainNavItems.map((item) => (
                        <Link
                            key={item.name}
                            href={getFullHref(item.href)}
                            className={`relative px-3.5 py-2 text-[11px] font-black tracking-widest uppercase transition-colors duration-300 ${
                                pathname === item.href ? "text-val-red" : "text-foreground/60 hover:text-foreground"
                            }`}
                            onMouseEnter={() => setHoveredPath(item.href)}
                            onMouseLeave={() => setHoveredPath(null)}
                        >
                            <span className="relative z-10">{item.name}</span>
                            {hoveredPath === item.href && (
                                <motion.div
                                    layoutId="nav-hover"
                                    className="absolute inset-0 bg-white/5 rounded-lg"
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    exit={{ opacity: 0 }}
                                    transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                                />
                            )}
                            {pathname === item.href && (
                                <motion.div
                                    layoutId="nav-active"
                                    className="absolute bottom-0 left-3.5 right-3.5 h-0.5 bg-val-red"
                                    transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                                />
                            )}
                        </Link>
                    ))}

                    {/* More Dropdown */}
                    <div className="relative" ref={moreRef}>
                        <button
                            onClick={() => setIsMoreOpen(!isMoreOpen)}
                            className={`flex items-center gap-1.5 px-3.5 py-2 text-[11px] font-black tracking-widest uppercase transition-all ${
                                isMoreOpen ? "text-white bg-white/5 rounded-lg" : "text-foreground/40 hover:text-foreground"
                            }`}
                        >
                            More <MoreHorizontal className="w-3.5 h-3.5" />
                        </button>

                        <AnimatePresence>
                            {isMoreOpen && (
                                <motion.div
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: 10 }}
                                    className="absolute top-full mt-2 right-0 w-48 glass border border-white/10 rounded-xl shadow-2xl overflow-hidden py-1.5 z-50"
                                >
                                    {moreNavItems.map((item) => (
                                        <Link
                                            key={item.name}
                                            href={getFullHref(item.href)}
                                            onClick={() => setIsMoreOpen(false)}
                                            className="flex items-center justify-between px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-foreground/60 hover:text-white hover:bg-white/5 transition-colors"
                                        >
                                            {item.name}
                                            <ChevronRight className="w-3 h-3 opacity-20" />
                                        </Link>
                                    ))}
                                    <div className="my-1.5 h-px bg-white/5 mx-2" />
                                    <Link
                                        href="/admin"
                                        onClick={() => setIsMoreOpen(false)}
                                        className="flex items-center gap-2 px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-val-red/80 hover:text-val-red hover:bg-val-red/5 transition-colors"
                                    >
                                        <Lock className="w-3 h-3" /> Admin Panel
                                    </Link>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                </div>

                <div className="flex items-center gap-3 shrink-0 ml-auto">
                    {seasons.length > 0 && (
                        <SeasonSelector seasons={seasons} currentSeasonId={currentSeasonId} />
                    )}

                    {/* Mobile Toggle */}
                    <button
                        onClick={() => setIsMobileOpen(!isMobileOpen)}
                        className="md:hidden w-10 h-10 flex items-center justify-center bg-white/5 border border-white/10 rounded-xl hover:bg-white/10 transition-colors"
                    >
                        <Menu className="w-5 h-5 text-foreground" />
                    </button>
                </div>

                {/* Mobile Menu (Overlay) */}
                <AnimatePresence>
                    {isMobileOpen && (
                        <motion.div
                            initial={{ opacity: 0, x: '100%' }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: '100%' }}
                            className="fixed inset-0 bg-val-deep z-[60] flex flex-col p-8"
                        >
                            <div className="flex items-center justify-between mb-12">
                                <div className="font-display text-2xl font-black uppercase italic tracking-tighter">
                                    {currentSeasonId} <span className="text-val-red">Menu</span>
                                </div>
                                <button
                                    onClick={() => setIsMobileOpen(false)}
                                    className="w-10 h-10 flex items-center justify-center bg-white/5 border border-white/10 rounded-full hover:bg-white/10 transition-colors text-2xl"
                                >
                                    ×
                                </button>
                            </div>

                            <div className="flex flex-col gap-2 overflow-y-auto">
                                {[...mainNavItems, ...moreNavItems].map((item) => (
                                    <Link
                                        key={item.name}
                                        href={getFullHref(item.href)}
                                        onClick={() => setIsMobileOpen(false)}
                                        className="px-6 py-4 glass border border-white/5 rounded-xl text-lg font-black uppercase tracking-widest hover:border-val-red/30 transition-all flex items-center justify-between group"
                                    >
                                        {item.name}
                                        <ChevronRight className="w-5 h-5 text-val-red group-hover:translate-x-1 transition-transform" />
                                    </Link>
                                ))}
                                <Link
                                    href="/admin"
                                    onClick={() => setIsMobileOpen(false)}
                                    className="px-6 py-4 bg-val-red/10 border border-val-red/20 rounded-xl text-lg font-black uppercase tracking-widest text-val-red flex items-center justify-between"
                                >
                                    Admin Panel
                                    <Lock className="w-5 h-5" />
                                </Link>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </nav>
    );
}

export default function Navbar() {
    return (
        <Suspense fallback={null}>
            <NavbarContent />
        </Suspense>
    );
}
