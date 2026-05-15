"use client";

import Link from "next/link";
import { type LucideIcon } from "lucide-react";

interface FeatureCardProps {
    title: string;
    description: string;
    href: string;
    icon: LucideIcon;
    accent?: "red" | "blue";
}

export default function FeatureCard({
    title,
    description,
    href,
    icon: Icon,
    accent = "red",
}: FeatureCardProps) {
    const accentColor = accent === "red" ? "val-red" : "val-blue";
    const glowColor = accent === "red"
        ? "rgba(255, 70, 85, 0.15)"
        : "rgba(63, 209, 255, 0.15)";

    return (
        <Link href={href} className="group block">
            <div
                className="relative glass-subtle rounded-xl p-6 md:p-8 overflow-hidden hover-lift hover-border-glow h-full transition-all duration-300"
            >
                {/* Accent glow on hover */}
                <div
                    className="absolute top-0 right-0 w-32 h-32 rounded-full blur-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 -translate-y-1/2 translate-x-1/2"
                    style={{ backgroundColor: glowColor }}
                />

                {/* Icon */}
                <div className={`w-12 h-12 rounded-lg bg-${accentColor}/10 flex items-center justify-center mb-4 group-hover:bg-${accentColor}/20 transition-colors duration-300`}>
                    <Icon className={`w-6 h-6 text-${accentColor}`} />
                </div>

                {/* Content */}
                <h3 className="font-display text-lg font-bold uppercase tracking-wider mb-2 group-hover:text-white transition-colors">
                    {title}
                </h3>
                <p className="text-foreground/50 text-sm leading-relaxed group-hover:text-foreground/70 transition-colors">
                    {description}
                </p>

                {/* Arrow indicator */}
                <div className="mt-4 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-foreground/30 group-hover:text-val-red transition-all duration-300">
                    <span>Explore</span>
                    <svg
                        className="w-4 h-4 group-hover:translate-x-1 transition-transform duration-300"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2}
                    >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M17 8l4 4m0 0l-4 4m4-4H3" />
                    </svg>
                </div>

                {/* Corner accent */}
                <div className={`absolute top-0 right-0 w-16 h-[2px] bg-${accentColor}/40 opacity-0 group-hover:opacity-100 transition-opacity duration-300`} />
                <div className={`absolute top-0 right-0 w-[2px] h-16 bg-${accentColor}/40 opacity-0 group-hover:opacity-100 transition-opacity duration-300`} />
            </div>
        </Link>
    );
}
