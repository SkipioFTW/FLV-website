"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Trophy, Users, Zap, BarChart3, Brain, Shield, Swords, Target } from "lucide-react";
import ScrollReveal, { StaggerContainer, StaggerItem } from "@/components/ScrollReveal";
import AnimatedCounter from "@/components/AnimatedCounter";
import ParticleField from "@/components/ParticleField";
import FeatureCard from "@/components/FeatureCard";
import type { GlobalStats } from "@/lib/data";

interface LandingClientProps {
    seasonNumber: string;
    stats: GlobalStats;
    topPlayer: { name: string; team: string; value: string; label: string };
    bestTeam: { name: string; value: string; label: string };
}

export default function LandingClient({
    seasonNumber,
    stats,
    topPlayer,
    bestTeam,
}: LandingClientProps) {
    return (
        <>
            {/* ═══════════════════════════════════════════
                SECTION 1: HERO
                ═══════════════════════════════════════════ */}
            <section className="relative flex flex-col items-center justify-center min-h-screen px-6 pt-28 pb-20 overflow-hidden">
                {/* Particle background */}
                <ParticleField count={25} />

                {/* Animated rings */}
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[70vw] h-[70vw] max-w-3xl max-h-3xl -z-10 opacity-15 pointer-events-none">
                    <div className="w-full h-full animate-[spin_60s_linear_infinite] border border-val-red/30 rounded-full flex items-center justify-center">
                        <div className="w-[75%] h-[75%] animate-[spin_40s_linear_infinite_reverse] border border-val-blue/20 rounded-full flex items-center justify-center">
                            <div className="w-[60%] h-[60%] animate-[spin_30s_linear_infinite] border border-white/10 rounded-full" />
                        </div>
                    </div>
                </div>

                {/* Decorative crosshair */}
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 -z-10 opacity-[0.04] pointer-events-none">
                    <svg width="400" height="400" viewBox="0 0 400 400">
                        <line x1="200" y1="0" x2="200" y2="400" stroke="currentColor" strokeWidth="1" />
                        <line x1="0" y1="200" x2="400" y2="200" stroke="currentColor" strokeWidth="1" />
                        <circle cx="200" cy="200" r="60" fill="none" stroke="currentColor" strokeWidth="1" />
                        <circle cx="200" cy="200" r="120" fill="none" stroke="currentColor" strokeWidth="0.5" />
                    </svg>
                </div>

                <div className="max-w-5xl w-full text-center relative z-10">
                    {/* Subtitle */}
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.6, delay: 0.1 }}
                    >
                        <span className="inline-flex items-center gap-2 px-4 py-1.5 glass-subtle rounded-full text-xs font-bold uppercase tracking-[0.2em] text-val-red/80 mb-6">
                            <span className="w-1.5 h-1.5 bg-val-red rounded-full animate-pulse" />
                            Tournament Portal
                        </span>
                    </motion.div>

                    {/* Main title */}
                    <motion.h1
                        className="font-display text-5xl md:text-8xl font-black tracking-tighter uppercase leading-[0.9] mb-6 mt-4"
                        initial={{ opacity: 0, y: 30 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.7, delay: 0.25 }}
                    >
                        <span className="block text-shadow-red drop-shadow-[0_0_30px_rgba(255,70,85,0.3)]">
                            Season {seasonNumber}
                        </span>
                        <span className="block text-val-blue text-shadow-blue drop-shadow-[0_0_30px_rgba(63,209,255,0.3)]">
                            Leaderboards
                        </span>
                    </motion.h1>

                    {/* Description */}
                    <motion.p
                        className="max-w-2xl mx-auto text-foreground/50 text-lg md:text-xl mb-10 font-medium font-sans"
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.6, delay: 0.45 }}
                    >
                        Track your progress, analyze match statistics, and dominate the competition in the most advanced Valorant tournament portal.
                    </motion.p>

                    {/* CTA Buttons */}
                    <motion.div
                        className="flex flex-wrap items-center justify-center gap-4"
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.6, delay: 0.6 }}
                    >
                        <Link
                            href="/standings"
                            className="group relative px-8 py-4 bg-val-red hover:bg-val-red/90 text-white font-bold uppercase tracking-widest rounded-sm transition-all duration-300 transform hover:scale-105 active:scale-95 overflow-hidden"
                        >
                            <span className="relative z-10">View Standings</span>
                            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700" />
                            <div className="absolute inset-0 shadow-[0_0_30px_rgba(255,70,85,0.4)] opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                        </Link>
                        <Link
                            href="/matches"
                            className="px-8 py-4 glass hover:bg-white/10 text-foreground font-bold uppercase tracking-widest rounded-sm transition-all duration-300 transform hover:scale-105 active:scale-95 hover-border-glow"
                        >
                            Explore Matches
                        </Link>
                    </motion.div>
                </div>

                {/* Scroll indicator */}
                <motion.div
                    className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 1.2, duration: 0.6 }}
                >
                    <span className="text-[10px] font-bold uppercase tracking-widest text-foreground/30">Scroll</span>
                    <motion.div
                        className="w-5 h-8 rounded-full border border-foreground/20 flex items-start justify-center p-1"
                        animate={{ opacity: [0.3, 0.6, 0.3] }}
                        transition={{ duration: 2, repeat: Infinity }}
                    >
                        <motion.div
                            className="w-1 h-2 bg-val-red/60 rounded-full"
                            animate={{ y: [0, 12, 0] }}
                            transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                        />
                    </motion.div>
                </motion.div>
            </section>

            {/* Divider */}
            <div className="section-divider" />

            {/* ═══════════════════════════════════════════
                SECTION 2: LIVE STATS
                ═══════════════════════════════════════════ */}
            <section className="py-24 px-6 relative overflow-hidden">
                <div className="max-w-6xl mx-auto">
                    <ScrollReveal className="text-center mb-16">
                        <h2 className="font-display text-3xl md:text-5xl font-black uppercase tracking-tighter mb-3">
                            Season <span className="text-val-red">{seasonNumber}</span> at a Glance
                        </h2>
                        <p className="text-foreground/40 text-sm uppercase tracking-widest font-bold">
                            Live tournament statistics
                        </p>
                    </ScrollReveal>

                    <StaggerContainer className="grid grid-cols-2 md:grid-cols-4 gap-6">
                        {[
                            { label: "Active Teams", value: stats.activeTeams, icon: Shield, accent: "red" as const },
                            { label: "Matches Played", value: stats.matchesPlayed, icon: Swords, accent: "blue" as const },
                            { label: "Live Players", value: stats.livePlayers, icon: Users, accent: "red" as const },
                            { label: "Total Points", value: stats.totalPoints, icon: Target, accent: "blue" as const },
                        ].map((stat) => (
                            <StaggerItem key={stat.label}>
                                <div className="glass-subtle rounded-xl p-6 text-center hover-lift hover-border-glow group">
                                    <stat.icon className={`w-5 h-5 mx-auto mb-3 text-${stat.accent === "red" ? "val-red" : "val-blue"}/60 group-hover:text-${stat.accent === "red" ? "val-red" : "val-blue"} transition-colors`} />
                                    <div className="font-display text-3xl md:text-4xl font-black text-foreground mb-1">
                                        <AnimatedCounter target={stat.value} duration={2200} />
                                    </div>
                                    <div className="text-foreground/40 text-[10px] font-bold uppercase tracking-[0.2em] font-sans">
                                        {stat.label}
                                    </div>
                                </div>
                            </StaggerItem>
                        ))}
                    </StaggerContainer>
                </div>
            </section>

            {/* Divider */}
            <div className="section-divider-glow" />

            {/* ═══════════════════════════════════════════
                SECTION 3: FEATURE SHOWCASE
                ═══════════════════════════════════════════ */}
            <section className="py-24 px-6 relative overflow-hidden">
                <div className="max-w-6xl mx-auto">
                    <ScrollReveal className="text-center mb-16">
                        <h2 className="font-display text-3xl md:text-5xl font-black uppercase tracking-tighter mb-3">
                            Your <span className="text-val-blue">Arsenal</span>
                        </h2>
                        <p className="text-foreground/40 text-sm uppercase tracking-widest font-bold">
                            Every tool you need to dominate
                        </p>
                    </ScrollReveal>

                    <StaggerContainer className="grid grid-cols-1 md:grid-cols-2 gap-5" staggerDelay={0.12}>
                        <StaggerItem>
                            <FeatureCard
                                title="Standings & Rankings"
                                description="Live tournament standings with point differentials, win streaks, and group breakdowns. See exactly where your team sits."
                                href="/standings"
                                icon={Trophy}
                                accent="red"
                            />
                        </StaggerItem>
                        <StaggerItem>
                            <FeatureCard
                                title="Player Leaderboard"
                                description="Per-map performance metrics, ACS rankings, K/D ratios, and the custom Skipio ELO system that rewards consistency."
                                href="/leaderboard"
                                icon={BarChart3}
                                accent="blue"
                            />
                        </StaggerItem>
                        <StaggerItem>
                            <FeatureCard
                                title="Deep Analytics"
                                description="Dive into player and team analytics with agent usage, map win rates, round economy breakdowns, and performance trends."
                                href="/players"
                                icon={Zap}
                                accent="blue"
                            />
                        </StaggerItem>
                        <StaggerItem>
                            <FeatureCard
                                title="AI League Analyst"
                                description="Ask Skipio AI about any team, player, or matchup. Get intelligent insights powered by real tournament data."
                                href="/standings"
                                icon={Brain}
                                accent="red"
                            />
                        </StaggerItem>
                    </StaggerContainer>
                </div>
            </section>

            {/* Divider */}
            <div className="section-divider" />

            {/* ═══════════════════════════════════════════
                SECTION 4: SEASON HIGHLIGHTS
                ═══════════════════════════════════════════ */}
            <section className="py-24 px-6 relative overflow-hidden">
                {/* Ambient glow */}
                <div className="absolute top-1/2 left-1/4 -translate-y-1/2 w-[300px] h-[300px] bg-val-red/5 rounded-full blur-[100px] pointer-events-none" />

                <div className="max-w-6xl mx-auto">
                    <ScrollReveal className="text-center mb-16">
                        <h2 className="font-display text-3xl md:text-5xl font-black uppercase tracking-tighter mb-3">
                            Season <span className="text-val-red">{seasonNumber}</span> Highlights
                        </h2>
                        <p className="text-foreground/40 text-sm uppercase tracking-widest font-bold">
                            The players and teams defining this season
                        </p>
                    </ScrollReveal>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto">
                        {/* Top Player Card */}
                        <ScrollReveal direction="left" delay={0.1}>
                            <div className="glass rounded-xl p-8 hover-lift hover-border-glow group relative overflow-hidden">
                                <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-val-red/60 to-transparent" />
                                <div className="flex items-start justify-between mb-4">
                                    <div>
                                        <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-val-red/60 mb-1">
                                            ★ MVP Player
                                        </div>
                                        <div className="font-display text-2xl font-black uppercase tracking-tight">
                                            {topPlayer.name}
                                        </div>
                                        <div className="text-foreground/40 text-xs font-bold uppercase tracking-widest mt-0.5">
                                            {topPlayer.team}
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <div className="font-display text-3xl font-black text-val-red">
                                            {topPlayer.value}
                                        </div>
                                        <div className="text-foreground/30 text-[10px] font-bold uppercase tracking-widest">
                                            {topPlayer.label}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </ScrollReveal>

                        {/* Best Team Card */}
                        <ScrollReveal direction="right" delay={0.2}>
                            <div className="glass rounded-xl p-8 hover-lift hover-border-glow group relative overflow-hidden">
                                <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-val-blue/60 to-transparent" />
                                <div className="flex items-start justify-between mb-4">
                                    <div>
                                        <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-val-blue/60 mb-1">
                                            ★ Top Team
                                        </div>
                                        <div className="font-display text-2xl font-black uppercase tracking-tight">
                                            {bestTeam.name}
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <div className="font-display text-3xl font-black text-val-blue">
                                            {bestTeam.value}
                                        </div>
                                        <div className="text-foreground/30 text-[10px] font-bold uppercase tracking-widest">
                                            {bestTeam.label}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </ScrollReveal>
                    </div>
                </div>
            </section>

            {/* Divider */}
            <div className="section-divider-glow" />

            {/* ═══════════════════════════════════════════
                SECTION 5: FOOTER CTA
                ═══════════════════════════════════════════ */}
            <section className="py-24 px-6 relative overflow-hidden">
                <div className="max-w-4xl mx-auto text-center">
                    <ScrollReveal>
                        <h2 className="font-display text-3xl md:text-5xl font-black uppercase tracking-tighter mb-4">
                            Ready to <span className="val-gradient-text">Compete</span>?
                        </h2>
                        <p className="text-foreground/40 text-lg mb-10 max-w-xl mx-auto">
                            Dive into the data. Study the meta. Find your edge. Every stat tells a story.
                        </p>
                    </ScrollReveal>

                    <ScrollReveal delay={0.2}>
                        <div className="flex flex-wrap items-center justify-center gap-4">
                            <Link
                                href="/leaderboard"
                                className="group relative px-10 py-5 bg-val-red hover:bg-val-red/90 text-white font-bold uppercase tracking-widest rounded-sm transition-all duration-300 transform hover:scale-105 active:scale-95 overflow-hidden"
                            >
                                <span className="relative z-10 flex items-center gap-2">
                                    <Trophy className="w-4 h-4" />
                                    View Leaderboard
                                </span>
                                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700" />
                            </Link>
                            <Link
                                href="/players"
                                className="px-10 py-5 glass hover:bg-white/10 text-foreground font-bold uppercase tracking-widest rounded-sm transition-all duration-300 transform hover:scale-105 active:scale-95 hover-border-glow"
                            >
                                Explore Players
                            </Link>
                        </div>
                    </ScrollReveal>
                </div>

                {/* Bottom branding */}
                <ScrollReveal delay={0.4} className="mt-20">
                    <div className="text-center">
                        <div className="text-foreground/15 text-[10px] font-bold uppercase tracking-[0.3em]">
                            Built for the FLV Community
                        </div>
                    </div>
                </ScrollReveal>
            </section>
        </>
    );
}
