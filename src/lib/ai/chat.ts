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

const SYSTEM_PROMPT = `You are the Lead Analyst of the FLV Valorant League. Your job is to provide punchy, professional, and data-driven insights to the fans.

RESPONSE STRUCTURE:
1. **THE HEADLINE**: A direct, 1-sentence answer to the user's question in BOLD.
2. **ANALYSIS**: 2-3 bullet points with specific stats from the snapshot that support your headline. Reference Map Stats or Historical Trends if relevant.
3. **THE TAKE**: A brief closing sentence with a "pro" opinion or prediction.

STYLE RULES:
- Be punchy and authoritative. No robotic preambles.
- Use **BOLD** for Team Tags (e.g. **UNC**, **GT**) and Player Names.
- Use metric abbreviations: ACS, K/D, ADR, FK/FD.
- You now have access to the last 100 matches and map-specific win rates. Use this for trend analysis!
- Keep total response length under 150 words.

LEAGUE DATA COMPACT KEY REFERENCE:
- ov: overview (t: teams, p: players, m: matches)
- st: standings (g: group, r: rank, n: name, t: tag, w: wins, l: losses, p: points, pa: points against, pd: point diff)
- ts: team_stats (n: name, t: tag, rd: round diff, p_wr: pistol win rate%, r_wr: round win rate%)
- ps: player_stats (n: name, t: team tag, m: matches played, acs: avg acs, k: kills, d: deaths, a: assists, kd: k/d ratio, adr: avg adr, kast: kast%, hs: hs%, fk: first kills, fd: first deaths, ei: entry impact, c: clutches, ag: top agents used with games and winrate%)
- ms: map_stats (n: name, g: games played, wr: win rate%)
- ld: leaders (acs: top acs, kd: top k/d, ei: top entry impact)
- as: agent_stats (n: name, pr: pick rate%, acs: avg acs)
- res: recent_results (w: week, t1: team 1, t2: team 2, s: score, win: winner tag)

RULES:
- Use the COMPACT KEY REFERENCE above to interpret the league snapshot provided below.
- You MUST ONLY answer using the provided league data snapshot.
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

    const aiModelEnv = process.env.AI_MODEL;

    try {
        if (provider === 'gemini') {
            const model = (aiModelEnv && aiModelEnv.includes('gemini')) ? aiModelEnv : 'gemini-2.0-flash';
            return await callGemini(apiKey, snapshotJson, userMessage, conversationHistory, model);
        } else if (provider === 'groq') {
            const model = (aiModelEnv && (aiModelEnv.includes('llama') || aiModelEnv.includes('mixtral'))) ? aiModelEnv : 'llama-3.1-8b-instant';
            return await callOpenAICompatible(
                'https://api.groq.com/openai/v1/chat/completions',
                apiKey,
                model,
                snapshotJson,
                userMessage,
                conversationHistory
            );
        } else if (provider === 'mistral') {
            const model = (aiModelEnv && aiModelEnv.includes('mistral')) ? aiModelEnv : 'mistral-small-latest';
            return await callOpenAICompatible(
                'https://api.mistral.ai/v1/chat/completions',
                apiKey,
                model,
                snapshotJson,
                userMessage,
                conversationHistory
            );
        } else if (provider === 'deepseek') {
            const model = (aiModelEnv && aiModelEnv.includes('deepseek')) ? aiModelEnv : 'deepseek-chat';
            return await callOpenAICompatible(
                'https://api.deepseek.com/chat/completions',
                apiKey,
                model,
                snapshotJson,
                userMessage,
                conversationHistory
            );
        } else {
            // Generic OpenAI-compatible endpoint
            const baseUrl = process.env.AI_BASE_URL || 'https://api.openai.com/v1/chat/completions';
            const model = aiModelEnv || 'gpt-4o-mini';
            return await callOpenAICompatible(baseUrl, apiKey, model, snapshotJson, userMessage, conversationHistory);
        }
    } catch (err: any) {
        console.error('AI chat error:', err);
        const errLower = (err.message || '').toLowerCase();
        const isQuotaError = errLower.includes('429') || errLower.includes('quota') || errLower.includes('rate_limited') || errLower.includes('rate_limit_exceeded');
        const isTPMError = errLower.includes('tpm') || errLower.includes('tokens per minute');

        if (isQuotaError || isTPMError) {
            return {
                reply: "⚠️ **Monthly/Rate Limit Exceeded.** Your current AI provider (Mistral Free) has hit its limit.\n\n**Solutions:**\n1. **Wait 60 seconds** and try again (if it's a per-minute limit).\n2. **Switch to DeepSeek** for unlimited high-capacity access ($1 lasts months). Set `AI_PROVIDER=deepseek`.\n3. Check if your Mistral **Monthly 1M Token limit** is exhausted.",
                error: err.message
            };
        }
        return { reply: '', error: err.message || 'Unknown AI error' };
    }
}

// ─── Gemini (Google AI Studio Free Tier) ─────────────────────────────

async function callGemini(
    apiKey: string,
    snapshotJson: string,
    userMessage: string,
    history: ChatMessage[],
    model: string = 'gemini-2.0-flash'
): Promise<ChatResponse> {
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
