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
// ─── Simple In-Memory Cache ──────────────────────────────────────────
let cachedSnapshot: { data: LeagueSnapshot, at: number } | null = null;
const CACHE_TTL = 60 * 1000; // 60 seconds

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { message, history } = body;

        if (!message || typeof message !== 'string' || message.trim().length === 0) {
            return NextResponse.json({ error: 'Message is required' }, { status: 400 });
        }

        if (message.length > 1000) {
            return NextResponse.json({ error: 'Message too long' }, { status: 400 });
        }

        // 1. Get snapshot (Try cache first)
        let snapshot: LeagueSnapshot | null = null;

        if (cachedSnapshot && (Date.now() - cachedSnapshot.at < CACHE_TTL)) {
            console.log('AI Chat: Snapshot Cache HIT');
            snapshot = cachedSnapshot.data;
        } else {
            console.log('AI Chat: Snapshot Cache MISS - Fetching from Supabase');
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
                    { error: 'No snapshot available.' },
                    { status: 503 }
                );
            }

            snapshot = snapRows[0].data as LeagueSnapshot;
            cachedSnapshot = { data: snapshot, at: Date.now() };
        }

        // 2. Validate conversation history
        const validHistory = Array.isArray(history)
            ? history
                .filter((h: any) => h.role && h.content && typeof h.content === 'string')
                .slice(-10) // Keep last 10 messages to limit context size
                .map((h: any) => ({ role: h.role as 'user' | 'assistant', content: h.content.slice(0, 2000) }))
            : [];

        console.log(`AI Chat: Calling Provider: ${process.env.AI_PROVIDER || 'gemini'} | History Items: ${validHistory.length}`);

        // 3. Call the AI
        const result = await chatWithAI(message.trim(), snapshot, validHistory);

        if (result.error) {
            // If we have a recovery reply (e.g. 429 instructions), return it as a success response
            if (result.reply) {
                return NextResponse.json({ reply: result.reply, error: result.error });
            }
            return NextResponse.json({ error: result.error }, { status: 500 });
        }

        return NextResponse.json({ reply: result.reply });
    } catch (err: any) {
        console.error('Chat API error:', err);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
