/**
 * AI Chat Module
 *
 * Handles communication with the external LLM API.
 * Uses Gemini Flash free tier by default, configurable via env vars.
 *
 * Safety:
 *  - No SQL generation
 *  - No schema exposure
 *  - Strict system prompt
 *  - Token-limited responses
 */

import type { LeagueSnapshot } from './snapshot';

const SYSTEM_PROMPT = `You are the official analyst of the FLV Valorant League (Season 23).

LEAGUE DATA COMPACT KEY REFERENCE:
- ov: overview (t: teams, p: players, m: matches)
- st: standings (g: group, r: rank, n: name, t: tag, w: wins, l: losses, p: points, pa: points against, pd: point diff)
- ts: team_stats (n: name, t: tag, rd: round diff, p_wr: pistol win rate%, r_wr: round win rate%)
- ps: player_stats (n: name, t: team tag, m: matches played, acs: avg acs, k: kills, d: deaths, a: assists, kd: k/d ratio, adr: avg adr, kast: kast%, hs: hs%, fk: first kills, fd: first deaths, ei: entry impact, c: clutches, ag: top agents used with games and winrate%)
- ld: leaders (acs: top acs, kd: top k/d, ei: top entry impact)
- as: agent_stats (n: name, pr: pick rate%, acs: avg acs)
- res: recent_results (w: week, t1: team 1, t2: team 2, s: score, win: winner tag)

RULES:
- Use the COMPACT KEY REFERENCE above to interpret the league snapshot provided below.
- You MUST ONLY answer using the provided league data snapshot.
- If data is missing (like a specific head-to-head not in 'res'), say it's not in the current snapshot.
- Analytical, professional, and grounded in numbers.
- Respond in the user's language.`;

interface ChatMessage {
    role: 'user' | 'assistant';
    content: string;
}

interface ChatResponse {
    reply: string;
    error?: string;
}

/**
 * Send a chat message to the LLM with the league snapshot as context.
 * Supports Gemini (Google AI Studio) and OpenAI-compatible APIs.
 */
export async function chatWithAI(
    userMessage: string,
    snapshot: LeagueSnapshot,
    conversationHistory: ChatMessage[] = []
): Promise<ChatResponse> {
    const apiKey = process.env.AI_API_KEY;
    const provider = (process.env.AI_PROVIDER || 'gemini').toLowerCase();

    if (!apiKey) {
        return { reply: '', error: 'AI_API_KEY is not configured.' };
    }

    // Build the context block (compact JSON)
    const snapshotJson = JSON.stringify(snapshot);

    try {
        if (provider === 'gemini') {
            return await callGemini(apiKey, snapshotJson, userMessage, conversationHistory);
        } else if (provider === 'groq') {
            return await callOpenAICompatible(
                'https://api.groq.com/openai/v1/chat/completions',
                apiKey,
                process.env.AI_MODEL || 'llama-3.3-70b-versatile',
                snapshotJson,
                userMessage,
                conversationHistory
            );
        } else {
            // Generic OpenAI-compatible endpoint
            const baseUrl = process.env.AI_BASE_URL || 'https://api.openai.com/v1/chat/completions';
            const model = process.env.AI_MODEL || 'gpt-4o-mini';
            return await callOpenAICompatible(baseUrl, apiKey, model, snapshotJson, userMessage, conversationHistory);
        }
    } catch (err: any) {
        console.error('AI chat error:', err);
        return { reply: '', error: err.message || 'Unknown AI error' };
    }
}

// ─── Gemini (Google AI Studio Free Tier) ─────────────────────────────

async function callGemini(
    apiKey: string,
    snapshotJson: string,
    userMessage: string,
    history: ChatMessage[]
): Promise<ChatResponse> {
    const model = process.env.AI_MODEL || 'gemini-2.0-flash';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    // Build conversation contents
    const contents: any[] = [];

    // System instruction is passed via systemInstruction field
    const systemInstruction = {
        parts: [{ text: `${SYSTEM_PROMPT}\n\n--- LEAGUE DATA SNAPSHOT ---\n${snapshotJson}\n--- END SNAPSHOT ---` }]
    };

    // Add conversation history
    history.forEach(msg => {
        contents.push({
            role: msg.role === 'user' ? 'user' : 'model',
            parts: [{ text: msg.content }]
        });
    });

    // Add current user message
    contents.push({
        role: 'user',
        parts: [{ text: userMessage }]
    });

    const body = {
        systemInstruction,
        contents,
        generationConfig: {
            maxOutputTokens: 2048,
            temperature: 0.7,
        },
    };

    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });

    if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Gemini API error ${res.status}: ${errText}`);
    }

    const data = await res.json();
    const reply = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    return { reply };
}

// ─── OpenAI-Compatible (Groq, OpenAI, etc.) ──────────────────────────

async function callOpenAICompatible(
    baseUrl: string,
    apiKey: string,
    model: string,
    snapshotJson: string,
    userMessage: string,
    history: ChatMessage[]
): Promise<ChatResponse> {
    const messages: any[] = [
        {
            role: 'system',
            content: `${SYSTEM_PROMPT}\n\n--- LEAGUE DATA SNAPSHOT ---\n${snapshotJson}\n--- END SNAPSHOT ---`,
        },
    ];

    // Add conversation history
    history.forEach(msg => {
        messages.push({ role: msg.role, content: msg.content });
    });

    // Add current user message
    messages.push({ role: 'user', content: userMessage });

    const body = {
        model,
        messages,
        max_tokens: 2048,
        temperature: 0.7,
    };

    const res = await fetch(baseUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
    });

    if (!res.ok) {
        const errText = await res.text();
        throw new Error(`LLM API error ${res.status}: ${errText}`);
    }

    const data = await res.json();
    const reply = data?.choices?.[0]?.message?.content || '';
    return { reply };
}
