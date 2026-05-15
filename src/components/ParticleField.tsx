"use client";

import { useMemo } from "react";

interface ParticleFieldProps {
    count?: number;
    className?: string;
}

interface Particle {
    id: number;
    left: string;
    top: string;
    size: number;
    duration: string;
    delay: string;
    color: string;
    opacity: number;
}

export default function ParticleField({ count = 30, className = "" }: ParticleFieldProps) {
    const particles = useMemo<Particle[]>(() => {
        return Array.from({ length: count }, (_, i) => ({
            id: i,
            left: `${Math.random() * 100}%`,
            top: `${Math.random() * 100}%`,
            size: Math.random() * 3 + 1,
            duration: `${Math.random() * 20 + 15}s`,
            delay: `${Math.random() * -20}s`,
            color: Math.random() > 0.6
                ? "rgba(255, 70, 85, 0.6)"
                : "rgba(63, 209, 255, 0.4)",
            opacity: Math.random() * 0.5 + 0.2,
        }));
    }, [count]);

    return (
        <div className={`absolute inset-0 overflow-hidden pointer-events-none ${className}`}>
            {particles.map((p) => (
                <div
                    key={p.id}
                    className="particle"
                    style={{
                        left: p.left,
                        top: p.top,
                        width: `${p.size}px`,
                        height: `${p.size}px`,
                        backgroundColor: p.color,
                        animationDuration: p.duration,
                        animationDelay: p.delay,
                        opacity: p.opacity,
                        boxShadow: `0 0 ${p.size * 3}px ${p.color}`,
                    }}
                />
            ))}
        </div>
    );
}
