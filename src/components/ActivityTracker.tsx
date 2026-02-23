"use client";

import { useEffect } from "react";

export default function ActivityTracker() {
    useEffect(() => {
        // Ping activity on mount
        fetch("/api/activity").catch(() => { });

        // Ping every 4 minutes (session_activity counts last 5 mins)
        const interval = setInterval(() => {
            fetch("/api/activity").catch(() => { });
        }, 4 * 60 * 1000);

        return () => clearInterval(interval);
    }, []);

    return null;
}
