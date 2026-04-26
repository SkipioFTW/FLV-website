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
const getDbSchema = (seasonId: string) => `
DATABASE SCHEMA (Valorant FLV League):

seasons (id, name, is_active)
teams (id, name, tag)
players (id, name, riot_id, default_team_id)
matches (id, week, team1_id, team2_id, winner_id, status, match_type, score_t1, score_t2, season_id, playoff_round, tracker_ids)
match_maps (match_id, map_index, map_name, team1_rounds, team2_rounds, winner_id)
match_stats_map (player_id, team_id, match_id, map_index, agent, acs, kills, deaths, assists, adr, kast, hs_pct, fk, fd, clutches)

HISTORICAL & SEASONAL TABLES:
team_history (team_id, season_id, group_name, captain_id)
player_history (player_id, season_id, rank)
player_team_history (player_id, team_id, season_id, is_current)

KEY NOTES:
- STANDINGS: Query 'matches' where status = 'completed' AND match_type = 'regular'.
- POINTS MATH: Winner gets 15 pts. Loser gets 0 pts. 
- TIE-BREAKERS: 1. Points, 2. Map Differential (Maps Won - Maps Lost), 3. Round Differential (PD).
- PLAYOFF ROUNDS: 1: Play-ins, 2: R16, 3: quarters, 4: semis, 5: GRAND FINAL.
- If asking for "The Final", filter by playoff_round = 5.
- ALWAYS filter by 'season_id' = '${seasonId}'.
- Excluded teams: 'FAT1', 'FAT2'.
`;

// ─── System Prompt ──────────────────────────────────────────────────────────
const getSystemPrompt = (seasonId: string) => `You are the Lead Analyst of the FLV Valorant League (v8.0 Intelligence).
You are analyzing Season ${seasonId}.

STRICT OPERATING RULES:
1. **No External Knowledge**: This is a PRIVATE league. NEVER use your internal training data about VCT or pro teams (Fnatic, LOUD, etc.). 
2. **Mandatory SQL**: For any question about players, teams, or results, you MUST first output a SQL block to get the data. 
3. **Season Filtering**: You MUST include \`season_id = '${seasonId}'\` in your WHERE clause when querying 'matches' or history tables.
4. **If Query Fails/Empty**: If you find nothing, say "No data found for [Entity] in ${seasonId}." Never guess.

LEAGUE INTELLIGENCE:
- **Standings Logic**: Points = Wins * 15. Losers get 0 pts.
- **Tie-breakers**: 1. Points, 2. Map Differential (Maps Won - Lost), 3. Round Differential (PD).
- **Match granularity**: 'matches.score_t1' are MAPS won. 'match_maps.team1_rounds' are ROUNDS won.
- **Captaincy**: Look for 'captain_id' in 'team_history' joining 'players'.

YOUR WORKFLOW:
1. **REASONING**: Briefly state what you need to find.
2. **SQL**: Output a \`\`\`sql block.
(The system will provide the results, then you will give the final answer).

SQL RULES:
- Use \`COALESCE(..., 0)\` and \`NULLIF(..., 0)\` for safety.
- Use \`ILIKE '%name%'\`.
- Use \`ROUND(AVG(...)::numeric, 2)\`.
- No semicolons needed.
- No dots in aliases (use \`avg_acs\`).

RESPONSE STRUCTURE (Final Answer):
**THE HEADLINE**: BOLD direct answer.
**ANALYSIS**: Bullet points with exact numbers from the data.
**INSIGHT**: 1 sentence about the performance or league context.

${getDbSchema(seasonId)}`;

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
    conversationHistory: ChatMessage[] = [],
    seasonId: string = 'S23'
): Promise<ChatResponse> {
    const apiKey = process.env.AI_API_KEY;
    const provider = (process.env.AI_PROVIDER || 'gemini').toLowerCase();

    if (!apiKey) {
        return { reply: '', error: 'AI_API_KEY is not configured.' };
    }

    try {
        // Step 1: Ask the AI for its response (may include a SQL block)
        const firstResponse = await callProvider(provider, apiKey, userMessage, conversationHistory, seasonId);

        // Step 2: Check if the AI generated a SQL query
        let sql = extractSQL(firstResponse);
        if (!sql) {
            // Direct conversational answer, no SQL needed
            return { reply: firstResponse };
        }

        // Step 3: Execute the validated query
        console.log(`[AI Chat] Season: ${seasonId} | SQL Query: ${sql.slice(0, 150)}...`);
        let { data, error: queryError } = await executeAIQuery(sql);

        // Step 3.5: Auto-Recovery (Retry once if SQL fails)
        if (queryError) {
            console.log(`[AI Chat] SQL Error detected: ${queryError}. Attempting recovery...`);
            const recoveryMessage = `SQL ERROR: ${queryError}\n\nPlease FIX your SQL query and try again. Ensure it follows all SQL rules.`;
            
            const secondAttemptResponse = await callProvider(
                provider,
                apiKey,
                recoveryMessage,
                [...conversationHistory, { role: 'user', content: userMessage }, { role: 'assistant', content: firstResponse }],
                seasonId
            );

            const newSql = extractSQL(secondAttemptResponse);
            if (newSql) {
                console.log(`[AI Chat] Retry SQL: ${newSql.slice(0, 150)}...`);
                const retryResult = await executeAIQuery(newSql);
                if (!retryResult.error) {
                    data = retryResult.data;
                    queryError = null;
                } else {
                    return { reply: `⚠️ Second query also failed: ${retryResult.error}` };
                }
            } else {
                return { reply: secondAttemptResponse }; // Conversation without SQL
            }
        }

        // Step 4: Ask the AI to formulate its final answer using the results
        const resultsJson = JSON.stringify(data?.slice(0, 30) ?? []); // Cap at 30 rows for better context
        const followupMessage = `DATA RESULTS:\n${resultsJson}\n\nProvide your FINAL ANALYTICS based ONLY on these results.`;

        const finalResponse = await callProvider(
            provider,
            apiKey,
            followupMessage,
            [...conversationHistory, { role: 'user', content: userMessage }, { role: 'assistant', content: firstResponse }],
            seasonId
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
    seasonId: string
): Promise<string> {
    const systemPrompt = getSystemPrompt(seasonId);

    if (provider === 'gemini') {
        return callGemini(apiKey, userMessage, history, 'gemini-2.0-flash', systemPrompt);
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

    return callOpenAICompatible(baseUrl, apiKey, model, userMessage, history, systemPrompt);
}

// ─── Gemini ───────────────────────────────────────────────────────────────────
async function callGemini(
    apiKey: string,
    userMessage: string,
    history: ChatMessage[],
    model: string = 'gemini-2.0-flash',
    systemPrompt: string
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
            systemInstruction: { parts: [{ text: systemPrompt }] },
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
    history: ChatMessage[],
    systemPrompt: string
): Promise<string> {
    const messages: any[] = [{ role: 'system', content: systemPrompt }];
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
