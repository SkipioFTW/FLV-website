/**
 * AI Chat Module — SQL Agent (v7.0)
 *
 * Instead of injecting a snapshot, this module gives the AI the Database Schema
 * and lets it run READ-ONLY SELECT queries to get real-time, precise data.
 *
 * Security:
 *  - Queries are validated server-side (SELECT-only, 2000 char limit)
 *  - Supabase exec_sql function further enforces READ-ONLY at DB level
 *  - Users cannot influence the SQL validation logic
 */

import { executeAIQuery } from './db';

// ─── Database Schema Context ──────────────────────────────────────────────────
// This is given to the AI so it knows what tables and columns exist.
// DO NOT include sensitive columns here.
const DB_SCHEMA = `
DATABASE SCHEMA (Valorant FLV League):

teams (id, name, tag, group_name)
players (id, name, riot_id, default_team_id)
matches (id, week, team1_id, team2_id, winner_id, status, match_type, score_t1, score_t2)
match_maps (match_id, map_index, map_name, team1_rounds, team2_rounds, winner_id)
match_stats_map (player_id, team_id, match_id, map_index, agent, acs, kills, deaths, assists, adr, kast, hs_pct, fk, fd, clutches)
match_rounds (match_id, map_index, round_number, winning_team_id)

KEY NOTES:
- 'standings' is NOT a table. To get standings, query 'matches' where status = 'completed'.
- 'matches.score_t1' and 'score_t2' are the number of MAPS won by each team in that match.
- To find the "Best Team", look at who has the most wins (winner_id) in the 'matches' table.
- Excluded teams: 'FAT1', 'FAT2' (Always exclude from standings/stats).
- Player stats (match_stats_map) are per-map. Always use AVG() and GROUP BY player_id.
- Current Season: S23.
`;

// ─── System Prompt ──────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `You are the Lead Analyst of the FLV Valorant League (S23).

STRICT OPERATING RULES:
1. **No External Knowledge**: This is a PRIVATE league. NEVER use your internal training data about VCT or pro teams (Fnatic, LOUD, etc.). 
2. **Mandatory SQL**: For any question about players, teams, or results, you MUST first output a SQL block to get the data. 
3. **If Query Fails/Empty**: If you find nothing, say "No data found for [Entity] in S23." Never guess.
4. **Logic**:
   - To find a player or team: Use \`ILIKE '%name%'\`.
   - To count wins/losses: Use the 'matches' table ONLY. 
   - A winner_id in 'matches' means that team won the WHOLE match (all maps).

YOUR WORKFLOW:
1. **REASONING**: Briefly state what you need to find.
2. **SQL**: Output a \`\`\`sql block.
(The system will provide the results, then you will give the final answer).

SQL RULES:
- Use \`ILIKE '%name%'\`.
- Use \`ROUND(AVG(...)::numeric, 2)\`.
- No semicolons needed.
- No dots in aliases (use \`avg_acs\`).

RESPONSE STRUCTURE (Final Answer):
**THE HEADLINE**: BOLD direct answer.
**ANALYSIS**: 2-3 bullet points with exact numbers.
**THE TAKE**: Short closing opinion.

${DB_SCHEMA}`;

// ─── Types ────────────────────────────────────────────────────────────────────
interface ChatMessage {
    role: 'user' | 'assistant';
    content: string;
}

interface ChatResponse {
    reply: string;
    error?: string;
}

// ─── SQL Parser ───────────────────────────────────────────────────────────────
function extractSQL(text: string): string | null {
    // 1. Match ```sql ... ``` or just ``` ... ``` blocks containing SELECT/WITH
    const fencedMatch = text.match(/```(?:sql\s*)?([\s\S]*?\b(SELECT|WITH)\b[\s\S]*?)```/i);
    if (fencedMatch) return fencedMatch[1].trim();

    // 2. Match raw SELECT ... or WITH ... blocks (ending in semicolon or end of string)
    const rawMatch = text.match(/\b((?:SELECT|WITH)\s[\s\S]+?)(?:;|$)/i);
    if (rawMatch) return rawMatch[1].trim();

    return null;
}

// ─── Provider Router ─────────────────────────────────────────────────────────
export async function chatWithAI(
    userMessage: string,
    _snapshot: any,         // kept for backward-compat with route.ts, not used
    conversationHistory: ChatMessage[] = []
): Promise<ChatResponse> {
    const apiKey = process.env.AI_API_KEY;
    const provider = (process.env.AI_PROVIDER || 'gemini').toLowerCase();

    if (!apiKey) {
        return { reply: '', error: 'AI_API_KEY is not configured.' };
    }

    try {
        // Step 1: Ask the AI for its response (may include a SQL block)
        const firstResponse = await callProvider(provider, apiKey, userMessage, conversationHistory, null);

        // Step 2: Check if the AI generated a SQL query
        const sql = extractSQL(firstResponse);
        if (!sql) {
            // Direct conversational answer, no SQL needed
            return { reply: firstResponse };
        }

        // Step 3: Execute the validated query
        console.log(`AI SQL Query: ${sql.slice(0, 200)}...`);
        const { data, error: queryError } = await executeAIQuery(sql);

        if (queryError) {
            console.error('AI SQL blocked:', queryError);
            return { reply: `⚠️ Query Error: ${queryError}` };
        }

        // Step 4: Ask the AI to formulate its final answer using the results
        const resultsJson = JSON.stringify(data?.slice(0, 30) ?? []); // Cap at 30 rows for better context
        const followupMessage = `DATA RESULTS:\n${resultsJson}\n\nProvide your FINAL ANALYTICS based ONLY on these results.`;

        const finalResponse = await callProvider(
            provider,
            apiKey,
            followupMessage,
            [...conversationHistory, { role: 'user', content: userMessage }, { role: 'assistant', content: firstResponse }],
            null
        );

        return { reply: finalResponse };

    } catch (err: any) {
        console.error('AI chat error:', err);
        const errLower = (err.message || '').toLowerCase();
        const isQuotaError = errLower.includes('429') || errLower.includes('quota') || errLower.includes('rate_limited') || errLower.includes('rate_limit_exceeded');

        if (isQuotaError) {
            return {
                reply: '⚠️ **Rate Limit Exceeded.** Wait 60 seconds and try again. If this persists, switch your `AI_PROVIDER` to `deepseek` or `groq`.',
                error: err.message
            };
        }
        return { reply: '', error: err.message || 'Unknown AI error' };
    }
}

// ─── Central Provider Dispatcher ─────────────────────────────────────────────
async function callProvider(
    provider: string,
    apiKey: string,
    userMessage: string,
    history: ChatMessage[],
    _unused: null
): Promise<string> {
    if (provider === 'gemini') {
        return callGemini(apiKey, userMessage, history);
    }

    const providerUrls: Record<string, string> = {
        groq: 'https://api.groq.com/openai/v1/chat/completions',
        mistral: 'https://api.mistral.ai/v1/chat/completions',
        deepseek: 'https://api.deepseek.com/chat/completions',
    };
    const providerModels: Record<string, string> = {
        groq: 'llama-3.1-8b-instant',
        mistral: 'mistral-small-latest',
        deepseek: 'deepseek-chat',
    };

    const baseUrl = providerUrls[provider] || (process.env.AI_BASE_URL || 'https://api.openai.com/v1/chat/completions');
    const model = process.env.AI_MODEL || providerModels[provider] || 'gpt-4o-mini';

    return callOpenAICompatible(baseUrl, apiKey, model, userMessage, history);
}

// ─── Gemini ───────────────────────────────────────────────────────────────────
async function callGemini(
    apiKey: string,
    userMessage: string,
    history: ChatMessage[],
    model: string = 'gemini-2.0-flash'
): Promise<string> {
    const useModel = process.env.AI_MODEL || model;
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${useModel}:generateContent?key=${apiKey}`;

    const contents: any[] = [];
    history.forEach(msg => {
        contents.push({ role: msg.role === 'user' ? 'user' : 'model', parts: [{ text: msg.content }] });
    });
    contents.push({ role: 'user', parts: [{ text: userMessage }] });

    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
            contents,
            generationConfig: { maxOutputTokens: 1024, temperature: 0.5 },
        }),
    });

    if (!res.ok) throw new Error(`Gemini API error ${res.status}: ${await res.text()}`);
    const data = await res.json();
    return data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

// ─── OpenAI-Compatible ────────────────────────────────────────────────────────
async function callOpenAICompatible(
    baseUrl: string,
    apiKey: string,
    model: string,
    userMessage: string,
    history: ChatMessage[]
): Promise<string> {
    const messages: any[] = [{ role: 'system', content: SYSTEM_PROMPT }];
    history.forEach(msg => messages.push({ role: msg.role, content: msg.content }));
    messages.push({ role: 'user', content: userMessage });

    const res = await fetch(baseUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify({ model, messages, max_tokens: 1024, temperature: 0.5 }),
    });

    if (!res.ok) throw new Error(`LLM API error ${res.status}: ${await res.text()}`);
    const data = await res.json();
    return data?.choices?.[0]?.message?.content || '';
}
