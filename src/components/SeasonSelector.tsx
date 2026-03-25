'use client';

import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { useCallback } from 'react';

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

    const createQueryString = useCallback(
        (name: string, value: string) => {
            const params = new URLSearchParams(searchParams.toString());
            params.set(name, value);
            return params.toString();
        },
        [searchParams]
    );

    const handleSeasonChange = (id: string) => {
        router.push(pathname + '?' + createQueryString('season', id));
    };

    return (
        <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-full px-3 py-1.5 ml-4">
            <span className="text-[10px] font-black uppercase tracking-widest text-foreground/40 px-1">Season</span>
            <div className="flex gap-1">
                {seasons.map((season) => (
                    <button
                        key={season.id}
                        onClick={() => handleSeasonChange(season.id)}
                        className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-tighter transition-all ${
                            currentSeasonId === season.id
                                ? 'bg-val-red text-white shadow-lg shadow-val-red/20'
                                : 'text-foreground/40 hover:text-foreground hover:bg-white/5'
                        }`}
                    >
                        {season.id.replace('S', '')}
                    </button>
                ))}
            </div>
        </div>
    );
}
