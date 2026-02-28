import { NextRequest, NextResponse } from 'next/server';
import { chatWithAI } from '@/lib/ai/chat';

/**
 * POST /api/chat (v7.0 — SQL Agent)
 *
 * The snapshot is no longer needed. The AI now queries
 * the database directly via the secure exec_sql function.
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

        if (message.length > 500) {
            return NextResponse.json({ error: 'Message too long (max 500 chars)' }, { status: 400 });
        }

        // Validate conversation history
        const validHistory = Array.isArray(history)
            ? history
                .filter((h: any) => h.role && h.content && typeof h.content === 'string')
                .slice(-6) // Keep last 6 messages (3 turns) to limit context
                .map((h: any) => ({ role: h.role as 'user' | 'assistant', content: h.content.slice(0, 1000) }))
            : [];

        console.log(`[AI Chat] Provider: ${process.env.AI_PROVIDER || 'gemini'} | History: ${validHistory.length} msgs`);

        // Call the AI Agent (no snapshot needed — it queries the DB directly)
        const result = await chatWithAI(message.trim(), null, validHistory);

        if (result.error) {
            if (result.reply) {
                // Recovery reply (e.g., rate-limit instructions)
                return NextResponse.json({ reply: result.reply });
            }
            return NextResponse.json({ error: result.error }, { status: 500 });
        }

        return NextResponse.json({ reply: result.reply });
    } catch (err: any) {
        console.error('[AI Chat] API Error:', err);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
