'use client';

import { RoundWinIcon } from './WinTypeIcons';

interface Props {
    rounds: { round_number: number; winning_team_id: number; win_type: string }[];
    team1Id: number;
    selected?: number | null;
    onSelect?: (roundNumber: number) => void;
}

export default function RoundStrip({ rounds, team1Id, selected, onSelect }: Props) {
    return (
        <div className="flex gap-1.5 overflow-x-auto pb-2">
            {rounds.map(r => (
                <button
                    key={r.round_number}
                    type="button"
                    disabled={!onSelect}
                    onClick={() => onSelect?.(r.round_number)}
                    title={`Round ${r.round_number} — ${r.win_type}`}
                    className={`flex flex-col items-center gap-1 w-7 shrink-0 transition-all ${r.winning_team_id === team1Id ? 'text-val-blue' : 'text-val-red'} ${selected === r.round_number ? 'opacity-100 scale-110' : 'opacity-50'} ${onSelect ? 'cursor-pointer hover:opacity-100' : 'cursor-default'}`}
                >
                    <RoundWinIcon type={r.win_type} className="w-4 h-4" />
                    <span className="text-[9px] text-foreground/40">{r.round_number}</span>
                </button>
            ))}
        </div>
    );
}
