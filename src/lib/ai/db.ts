/**
 * Secure AI SQL Executor (v7.0)
 *
 * This utility allows the AI Agent to query the database STRICTLY using SELECT.
 * Any attempt to use INSERT, UPDATE, DELETE, DROP, ALTER, or TRUNCATE will be rejected.
 */
import { supabase } from '../supabase';

// High-risk keywords that are NEVER allowed, even nested inside SELECT.
const BLOCKED_KEYWORDS = ['insert', 'update', 'delete', 'drop', 'alter', 'truncate', 'create', 'grant', 'revoke', 'exec', 'execute'];

export interface QueryResult {
    data: any[] | null;
    error: string | null;
}

/**
 * Validates and executes a read-only SQL query.
 * Throws if the query is not a SELECT or contains dangerous keywords.
 */
export async function executeAIQuery(sql: string): Promise<QueryResult> {
    const normalized = sql.trim().toLowerCase();

    // 1. Must start with SELECT
    if (!normalized.startsWith('select')) {
        return { data: null, error: 'Security Error: Only SELECT queries are allowed.' };
    }

    // 2. Block any high-risk keywords
    for (const kw of BLOCKED_KEYWORDS) {
        // Use word-boundary check to avoid false positives like "deletedat"
        const regex = new RegExp(`\\b${kw}\\b`);
        if (regex.test(normalized)) {
            return { data: null, error: `Security Error: Keyword '${kw.toUpperCase()}' is not allowed.` };
        }
    }

    // 3. Limit query size to prevent abuse
    if (sql.length > 2000) {
        return { data: null, error: 'Security Error: Query is too long (> 2000 chars).' };
    }

    try {
        // Call the server-side function (created in Supabase SQL editor)
        const { data, error } = await supabase.rpc('exec_sql', { query_text: sql });
        if (error) throw error;
        return { data: Array.isArray(data) ? data : [], error: null };
    } catch (err: any) {
        console.error('AI SQL Error:', err.message);
        return { data: null, error: `DB Error: ${err.message}` };
    }
}
