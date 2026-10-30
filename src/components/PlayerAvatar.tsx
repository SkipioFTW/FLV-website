'use client';

import { VALORANT_AGENT_PORTRAITS } from '@/lib/valorantAgents';

type PlayerStat = { player_id: number; player_name: string; agent: string };

interface Props {
    p: PlayerStat;
    onClick?: () => void;
    selected?: boolean;
    size?: number;
}

export default function PlayerAvatar({ p, onClick, selected, size = 32 }: Props) {
    const portrait = VALORANT_AGENT_PORTRAITS[p.agent];
    return (
        <div
            onClick={onClick}
            role={onClick ? 'button' : undefined}
            tabIndex={onClick ? 0 : undefined}
            className={`flex flex-col items-center gap-1 w-16 shrink-0 transition-opacity ${onClick ? 'cursor-pointer' : ''} ${onClick && !selected ? 'opacity-50 hover:opacity-80' : 'opacity-100'}`}
        >
            {portrait ? (
                <img
                    src={portrait}
                    alt={p.agent}
                    className="rounded-full object-cover"
                    style={{ width: size, height: size, border: `${selected ? 2 : 1}px solid ${selected ? '#ef4444' : 'rgba(255,255,255,0.2)'}` }}
                />
            ) : (
                <div className="rounded-full bg-white/10" style={{ width: size, height: size }} />
            )}
            <div className="text-[10px] font-bold truncate w-full text-center">{p.player_name}</div>
        </div>
    );
}
