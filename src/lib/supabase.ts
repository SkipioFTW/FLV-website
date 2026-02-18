import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Type definitions for our database schema
export type Team = {
    id: number;
    tag: string;
    name: string;
    group_name: string;
    captain: string;
    co_captain?: string;
    logo_path?: string;
};

export type Player = {
    id: number;
    name: string;
    riot_id: string;
    rank: string;
    uuid?: string;
    default_team_id?: number;
};

export type Match = {
    id: number;
    week: number;
    group_name?: string;
    team1_id: number;
    team2_id: number;
    winner_id?: number;
    score_t1: number;
    score_t2: number;
    status: string;
    format: string;
    maps_played: number;
    match_type?: string;
    is_forfeit?: boolean;
};

export type MatchMap = {
    id: number;
    match_id: number;
    map_index: number;
    map_name: string;
    team1_rounds: number;
    team2_rounds: number;
    winner_id?: number;
};

export type MatchStatMap = {
    id: number;
    match_id: number;
    map_index: number;
    player_id: number;
    team_id: number;
    agent: string;
    acs: number;
    kills: number;
    deaths: number;
    assists: number;
    kast?: number;
    is_sub?: boolean;
};
