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

RULES:
- You MUST ONLY answer using the provided league data snapshot below.
- If the user asks about data not present in the snapshot, say "That information is not available in the current league data."
- Be analytical, insightful, and professional.
- Use specific numbers and stats to back up your analysis.
- When comparing players or teams, reference concrete metrics (ACS, K/D, ADR, entry impact, etc.).
- Keep your answers concise but comprehensive.
- You may offer opinions or predictions, but always ground them in the provided data.
- You can use the head-to-head records and match results to analyze team matchups.
- NEVER fabricate statistics or numbers. Only use data from the snapshot.
- Respond in the same language as the user's question.`;

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
