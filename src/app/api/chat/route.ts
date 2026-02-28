import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { chatWithAI } from '@/lib/ai/chat';
import type { LeagueSnapshot } from '@/lib/ai/snapshot';

/**
 * POST /api/chat
 *
 * Body: { message: string, history?: { role: 'user'|'assistant', content: string }[] }
 * Returns: { reply: string }
 */
export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { message, history } = body;

        if (!message || typeof message !== 'string' || message.trim().length === 0) {
            return NextResponse.json({ error: 'Message is required' }, { status: 400 });
        }

        // Enforce message length limit to prevent prompt abuse
        if (message.length > 1000) {
            return NextResponse.json({ error: 'Message too long (max 1000 characters)' }, { status: 400 });
        }

        // 1. Load the active snapshot from Supabase
        const { data: snapRows, error: snapErr } = await supabase
            .from('league_snapshots')
            .select('data')
            .eq('is_active', true)
            .order('created_at', { ascending: false })
            .limit(1);

        if (snapErr) {
            console.error('Snapshot fetch error:', snapErr);
            return NextResponse.json({ error: 'Failed to load league data' }, { status: 500 });
        }

        if (!snapRows || snapRows.length === 0) {
            return NextResponse.json(
                { error: 'No league data snapshot available. An admin must generate one first.' },
                { status: 503 }
            );
        }

        const snapshot = snapRows[0].data as LeagueSnapshot;

        // 2. Validate conversation history
        const validHistory = Array.isArray(history)
            ? history
                .filter((h: any) => h.role && h.content && typeof h.content === 'string')
                .slice(-10) // Keep last 10 messages to limit context size
                .map((h: any) => ({ role: h.role as 'user' | 'assistant', content: h.content.slice(0, 2000) }))
            : [];

        // 3. Call the AI
        const result = await chatWithAI(message.trim(), snapshot, validHistory);

        if (result.error) {
            return NextResponse.json({ error: result.error }, { status: 500 });
        }

        return NextResponse.json({ reply: result.reply });
    } catch (err: any) {
        console.error('Chat API error:', err);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
