/**
 * AI Chat Module — SQL Agent (v9.0)
 *
 * Instead of injecting a snapshot, this module gives the AI the Database Schema
 * and lets it run READ-ONLY SELECT queries to get real-time, precise data.
 * For complex questions, the agent can issue up to MAX_SQL_ROUNDS queries in
 * sequence (e.g. one to find a player, another to pull their match history).
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
- STANDINGS: Use the STANDINGS TEMPLATE from your instructions — do not derive it from scratch.
- POINTS MATH: Winner gets 15 pts. Loser gets min(total rounds won across the match's maps, 12) pts (a "moral victory" cap, NOT 0).
- TIE-BREAKERS: 1. Points DESC, 2. PD (Points - Points Against) DESC.
- PLAYOFF ROUNDS: 1: Play-ins, 2: R16, 3: quarters, 4: semis, 5: GRAND FINAL.
- If asking for "The Final", filter by playoff_round = 5.
- ALWAYS filter by 'season_id' = '${seasonId}'.
- Excluded teams: 'FAT1', 'FAT2'.
`;

// ─── System Prompt ──────────────────────────────────────────────────────────
const getSystemPrompt = (seasonId: string) => `You are "Skipio", the Lead Analyst of the FLV Valorant League (v9.0 Intelligence).
You are analyzing Season ${seasonId}.

PERSONALITY:
- You've watched every map of this league and you know the standings, rivalries, and storylines cold.
- Voice: a sharp, witty color commentator — confident, a little cheeky, occasional light banter or trash talk. Think hype-caster energy, not a corporate report.
- Keep THE HEADLINE and ANALYSIS strictly factual (numbers must come from query results), but let personality loose in INSIGHT — a stat-backed jab, a hype line, or a dry joke about a brutal scoreline.
- 'FAT1'/'FAT2' are admin/test placeholders, not real teams — if someone asks about them, you can joke that they're the league's "ghost teams" with a flawless 0-0 record against nobody.
- Match energy to the question: a quick lookup gets a snappy one-liner, a deep stat breakdown gets a fuller analysis. Don't force jokes where they don't fit.

STRICT OPERATING RULES:
1. **No External Knowledge**: This is a PRIVATE league. NEVER use your internal training data about VCT or pro teams (Fnatic, LOUD, etc.).
2. **Mandatory SQL**: For any question about players, teams, or results, you MUST first output a SQL block to get the data.
3. **Season Filtering**: You MUST include \`season_id = '${seasonId}'\` in your WHERE clause when querying 'matches' or history tables.
4. **If Query Fails/Empty**: If you find nothing, say "No data found for [Entity] in ${seasonId}." Never guess.

LEAGUE INTELLIGENCE:
- **Standings Logic**: The match winner earns 15 pts. The loser earns min(total rounds won across all the match's maps, 12) pts — a "moral victory" cap, NOT 0.
- **PD (Point Differential)**: PD = total Points earned - total Points conceded across a team's matches.
- **Tie-breakers**: 1. Points DESC, 2. PD DESC.
- **Match granularity**: 'matches.score_t1' are MAPS won. 'match_maps.team1_rounds'/'team2_rounds' are ROUNDS won per map — sum across all of a match's maps for total rounds.
- **Captaincy**: Look for 'captain_id' in 'team_history' joining 'players'.
- **STANDINGS TEMPLATE**: For "standings"/"how is S## doing"/league-overview questions, use this EXACT query as your SQL (the season filter is already filled in for ${seasonId}). Add \`AND t.name ILIKE '%TeamName%'\` to the final WHERE for a single team, or \`LIMIT n\` after ORDER BY for a top-N. Do NOT try to derive standings from scratch — it is error-prone:

\`\`\`sql
WITH match_rounds AS (
    SELECT match_id, SUM(team1_rounds) as total_r1, SUM(team2_rounds) as total_r2
    FROM match_maps
    GROUP BY match_id
),
team_matches AS (
    SELECT m.team1_id as team_id,
        CASE WHEN m.winner_id = m.team1_id THEN 1 ELSE 0 END as win,
        CASE WHEN m.winner_id = m.team1_id THEN 15 ELSE LEAST(COALESCE(mr.total_r1, 0), 12) END as earned_pts,
        CASE WHEN m.winner_id = m.team2_id THEN 15 ELSE LEAST(COALESCE(mr.total_r2, 0), 12) END as against_pts
    FROM matches m
    LEFT JOIN match_rounds mr ON m.id = mr.match_id
    WHERE m.status = 'completed' AND m.match_type = 'regular' AND m.season_id = '${seasonId}'
    UNION ALL
    SELECT m.team2_id,
        CASE WHEN m.winner_id = m.team2_id THEN 1 ELSE 0 END,
        CASE WHEN m.winner_id = m.team2_id THEN 15 ELSE LEAST(COALESCE(mr.total_r2, 0), 12) END,
        CASE WHEN m.winner_id = m.team1_id THEN 15 ELSE LEAST(COALESCE(mr.total_r1, 0), 12) END
    FROM matches m
    LEFT JOIN match_rounds mr ON m.id = mr.match_id
    WHERE m.status = 'completed' AND m.match_type = 'regular' AND m.season_id = '${seasonId}'
)
SELECT t.name, t.tag,
    COUNT(tm.team_id) as played,
    COALESCE(SUM(tm.win), 0) as wins,
    COUNT(tm.team_id) - COALESCE(SUM(tm.win), 0) as losses,
    COALESCE(SUM(tm.earned_pts), 0) as points,
    COALESCE(SUM(tm.earned_pts), 0) - COALESCE(SUM(tm.against_pts), 0) as pd
FROM teams t
LEFT JOIN team_matches tm ON t.id = tm.team_id
WHERE t.name NOT IN ('FAT1', 'FAT2')
GROUP BY t.id, t.name, t.tag
HAVING COUNT(tm.team_id) > 0
ORDER BY points DESC, pd DESC
\`\`\`

YOUR WORKFLOW (multi-step is allowed for complex questions):
1. **REASONING**: Briefly state what you need to find.
2. **SQL**: Output ONE \`\`\`sql block.
3. The system runs it and returns the results to you. If that's enough to answer, give your FINAL ANSWER (no SQL block, follow RESPONSE STRUCTURE below). If you genuinely need more data (e.g. a follow-up lookup or a second comparison), output ANOTHER \`\`\`sql block — you have up to 3 queries total for one question.
4. Once you've run your last needed query, ALWAYS give a FINAL ANSWER (no SQL) — never leave the user without a response.

SQL RULES:
- Use \`COALESCE(..., 0)\` and \`NULLIF(..., 0)\` for safety.
- Use \`ILIKE '%name%'\`.
- Use \`ROUND(AVG(...)::numeric, 2)\`.
- No semicolons needed.
- No dots in aliases (use \`avg_acs\`).

RESPONSE STRUCTURE (Final Answer):
**THE HEADLINE**: BOLD direct answer.
**ANALYSIS**: Bullet points with exact numbers from the data.
**INSIGHT**: 1-2 sentences in your analyst voice — context, a stat-backed jab, or hype.

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
// Max number of SQL queries the agent may run for a single user question.
const MAX_SQL_ROUNDS = 3;

export async function chatWithAI(
    userMessage: string,
    _snapshot: any,         // kept for backward-compat with route.ts, not used
    conversationHistory: ChatMessage[] = [],
    seasonId: string
): Promise<ChatResponse> {
    const apiKey = process.env.AI_API_KEY;
    const provider = (process.env.AI_PROVIDER || 'gemini').toLowerCase();

    if (!apiKey) {
        return { reply: '', error: 'AI_API_KEY is not configured.' };
    }

    try {
        const history: ChatMessage[] = [...conversationHistory];
        let nextMessage = userMessage;

        for (let round = 0; round < MAX_SQL_ROUNDS; round++) {
            const response = await callProvider(provider, apiKey, nextMessage, history, seasonId);
            const sql = extractSQL(response);

            if (!sql) {
                const looksFinal = /\*\*\s*THE HEADLINE\s*\*\*/i.test(response);
                if (looksFinal || round === MAX_SQL_ROUNDS - 1) {
                    // Conversational reply or final answer — nothing more to do
                    return { reply: response };
                }
                // Model stalled mid-thought without SQL or a final answer — nudge it to finish.
                console.log(`[AI Chat] Round ${round + 1} produced neither SQL nor a final answer. Nudging...`);
                history.push({ role: 'user', content: nextMessage });
                history.push({ role: 'assistant', content: response });
                nextMessage = `You didn't include a SQL block or a FINAL ANSWER. Either output ONE \`\`\`sql block now, or give your FINAL ANSWER following the RESPONSE STRUCTURE (starting with **THE HEADLINE**).`;
                continue;
            }

            history.push({ role: 'user', content: nextMessage });
            history.push({ role: 'assistant', content: response });

            console.log(`[AI Chat] Season: ${seasonId} | Round ${round + 1} SQL: ${sql.slice(0, 150)}...`);
            const { data, error: queryError } = await executeAIQuery(sql);

            if (queryError) {
                console.log(`[AI Chat] SQL Error detected: ${queryError}. Asking model to fix it...`);
                nextMessage = `SQL ERROR: ${queryError}\n\nPlease FIX your SQL query and try again. Ensure it follows all SQL rules.`;
                continue;
            }

            const resultsJson = JSON.stringify(data?.slice(0, 30) ?? []); // Cap at 30 rows for better context
            const isLastRound = round === MAX_SQL_ROUNDS - 1;
            nextMessage = isLastRound
                ? `DATA RESULTS:\n${resultsJson}\n\nThis was your last available query. Provide your FINAL ANSWER now based on all results gathered so far.`
                : `DATA RESULTS:\n${resultsJson}\n\nIf this fully answers the question, give your FINAL ANSWER now (no SQL block, follow RESPONSE STRUCTURE). If you need more data, output ONE more SQL block.`;
        }

        // The model kept requesting SQL through the last round — force a final answer.
        const finalResponse = await callProvider(provider, apiKey, nextMessage, history, seasonId);
        const strayQuery = extractSQL(finalResponse);
        if (strayQuery) {
            const stripped = finalResponse.replace(/```[\s\S]*?```/g, '').trim();
            return { reply: stripped || "I gathered some data but ran out of queries to fully break it down — try narrowing your question a bit." };
        }
        return { reply: finalResponse };

    } catch (err: any) {
        console.error('AI chat error:', err);
        const errLower = (err.message || '').toLowerCase();
        const isQuotaError = errLower.includes('429') || errLower.includes('quota') || errLower.includes('rate_limited') || errLower.includes('rate_limit_exceeded');

        if (isQuotaError) {
            return {
                reply: '⚠️ **Rate Limit Exceeded.** Wait 60 seconds and try again. If this persists, switch your `AI_PROVIDER` to `deepseek`, `groq`, or `openrouter`.',
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
        return callGemini(apiKey, userMessage, history, 'gemini-2.5-flash', systemPrompt);
    }

    const providerUrls: Record<string, string> = {
        groq: 'https://api.groq.com/openai/v1/chat/completions',
        mistral: 'https://api.mistral.ai/v1/chat/completions',
        deepseek: 'https://api.deepseek.com/chat/completions',
        openrouter: 'https://openrouter.ai/api/v1/chat/completions',
    };
    const providerModels: Record<string, string> = {
        groq: 'llama-3.1-8b-instant',
        mistral: 'mistral-small-latest',
        deepseek: 'deepseek-chat',
        openrouter: 'deepseek/deepseek-chat-v3-0324:free',
    };

    const baseUrl = providerUrls[provider] || (process.env.AI_BASE_URL || 'https://api.openai.com/v1/chat/completions');
    const model = process.env.AI_MODEL || providerModels[provider] || 'gpt-4o-mini';

    // OpenRouter uses these to attribute free-tier usage; harmless if omitted elsewhere.
    const extraHeaders = provider === 'openrouter'
        ? { 'HTTP-Referer': 'https://flv-website.vercel.app', 'X-Title': 'FLV AI Analyst' }
        : undefined;

    return callOpenAICompatible(baseUrl, apiKey, model, userMessage, history, systemPrompt, extraHeaders);
}

// ─── Gemini ───────────────────────────────────────────────────────────────────
async function callGemini(
    apiKey: string,
    userMessage: string,
    history: ChatMessage[],
    model: string = 'gemini-2.5-flash',
    systemPrompt: string
): Promise<string> {
    const useModel = process.env.AI_MODEL || model;

    const contents: any[] = [];
    history.forEach(msg => {
        contents.push({ role: msg.role === 'user' ? 'user' : 'model', parts: [{ text: msg.content }] });
    });
    contents.push({ role: 'user', parts: [{ text: userMessage }] });

    const fetchModel = (modelName: string) => {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;
        const generationConfig: Record<string, unknown> = { maxOutputTokens: 2048, temperature: 0.6 };
        // 2.5 models default to "thinking", which silently eats into maxOutputTokens
        // and can truncate the visible reply before it produces any text. Disable it
        // (2.5 Flash/Flash-Lite support a budget of 0; 2.5 Pro does not).
        if (modelName.includes('2.5') && !modelName.includes('pro')) {
            generationConfig.thinkingConfig = { thinkingBudget: 0 };
        }
        return fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                systemInstruction: { parts: [{ text: systemPrompt }] },
                contents,
                generationConfig,
            }),
        });
    };

    let res = await fetchModel(useModel);

    // Newer free-tier models occasionally return 503 "overloaded" under high demand.
    // Retry once after a short delay, then fall back to 2.0-flash (less contended).
    if (!res.ok && (res.status === 503 || res.status === 500)) {
        await new Promise(r => setTimeout(r, 1000));
        res = await fetchModel(useModel);
    }
    if (!res.ok && (res.status === 503 || res.status === 500) && useModel !== 'gemini-2.0-flash') {
        console.log(`[AI Chat] ${useModel} overloaded (${res.status}), falling back to gemini-2.0-flash`);
        res = await fetchModel('gemini-2.0-flash');
    }

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
    systemPrompt: string,
    extraHeaders?: Record<string, string>
): Promise<string> {
    const messages: any[] = [{ role: 'system', content: systemPrompt }];
    history.forEach(msg => messages.push({ role: msg.role, content: msg.content }));
    messages.push({ role: 'user', content: userMessage });

    const res = await fetch(baseUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
            ...extraHeaders,
        },
        body: JSON.stringify({ model, messages, max_tokens: 2048, temperature: 0.6 }),
    });

    if (!res.ok) throw new Error(`LLM API error ${res.status}: ${await res.text()}`);
    const data = await res.json();
    return data?.choices?.[0]?.message?.content || '';
}
