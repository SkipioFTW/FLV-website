'use client';

import { useState } from 'react';
import StandingsView from './StandingsView';
import MetaAnalyticsComponent from './MetaAnalytics';
import { MetaAnalytics, StandingsRow } from '@/lib/data';

interface Props {
    groupedStandings: Map<string, StandingsRow[]>;
    metaData: MetaAnalytics;
}

export default function StandingsTabs({ groupedStandings, metaData }: Props) {
    const [activeTab, setActiveTab] = useState<'standings' | 'meta'>('standings');

    return (
        <div className="space-y-8">
            <div className="flex border-b border-white/10">
                <button
                    onClick={() => setActiveTab('standings')}
                    className={`px-8 py-4 font-display font-black uppercase tracking-widest text-sm transition-all relative ${
                        activeTab === 'standings' ? 'text-val-red' : 'text-foreground/40 hover:text-foreground'
                    }`}
                >
                    Standings
                    {activeTab === 'standings' && (
                        <div className="absolute bottom-0 left-0 w-full h-1 bg-val-red" />
                    )}
                </button>
                <button
                    onClick={() => setActiveTab('meta')}
                    className={`px-8 py-4 font-display font-black uppercase tracking-widest text-sm transition-all relative ${
                        activeTab === 'meta' ? 'text-val-red' : 'text-foreground/40 hover:text-foreground'
                    }`}
                >
                    Meta Analytics
                    {activeTab === 'meta' && (
                        <div className="absolute bottom-0 left-0 w-full h-1 bg-val-red" />
                    )}
                </button>
            </div>

            {activeTab === 'standings' ? (
                <StandingsView groupedStandings={groupedStandings} />
            ) : (
                <MetaAnalyticsComponent data={metaData} />
            )}
        </div>
    );
}
