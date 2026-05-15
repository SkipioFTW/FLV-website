"use client";

import { motion } from "framer-motion";
import React from "react";

type Direction = "up" | "down" | "left" | "right";

interface ScrollRevealProps {
    children: React.ReactNode;
    direction?: Direction;
    delay?: number;
    duration?: number;
    className?: string;
    once?: boolean;
    amount?: number;
}

const getInitial = (direction: Direction): { opacity: number; x?: number; y?: number } => {
    const distance = 40;
    switch (direction) {
        case "up": return { opacity: 0, y: distance };
        case "down": return { opacity: 0, y: -distance };
        case "left": return { opacity: 0, x: distance };
        case "right": return { opacity: 0, x: -distance };
    }
};

export default function ScrollReveal({
    children,
    direction = "up",
    delay = 0,
    duration = 0.6,
    className = "",
    once = true,
    amount = 0.3,
}: ScrollRevealProps) {
    return (
        <motion.div
            initial={getInitial(direction)}
            whileInView={{ opacity: 1, x: 0, y: 0 }}
            viewport={{ once, amount }}
            transition={{
                duration,
                delay,
                ease: [0.25, 0.46, 0.45, 0.94],
            }}
            className={className}
        >
            {children}
        </motion.div>
    );
}

/**
 * Staggered container — wraps children that each get a staggered delay
 */
export function StaggerContainer({
    children,
    className = "",
    staggerDelay = 0.1,
}: {
    children: React.ReactNode;
    className?: string;
    staggerDelay?: number;
}) {
    return (
        <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.2 }}
            variants={{
                hidden: {},
                visible: {
                    transition: {
                        staggerChildren: staggerDelay,
                    },
                },
            }}
            className={className}
        >
            {children}
        </motion.div>
    );
}

export function StaggerItem({
    children,
    className = "",
}: {
    children: React.ReactNode;
    className?: string;
}) {
    return (
        <motion.div
            variants={{
                hidden: { opacity: 0, y: 30 },
                visible: {
                    opacity: 1,
                    y: 0,
                    transition: { duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] },
                },
            }}
            className={className}
        >
            {children}
        </motion.div>
    );
}
