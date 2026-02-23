import { NextRequest, NextResponse } from 'next/server';
import { isAuthorized } from '@/lib/adminAuth';
import { supabaseServer } from '@/lib/supabaseServer';
import { getStandings, annotateElimination } from '@/lib/data';

/**
 * Heuristic scenario generator (replicated from production python)
 */
function generateHeuristic(groupName: string, team: any, standings: any[]) {
    const sorted = [...standings].filter(s => s.group_name === groupName).sort((a, b) => (b.Points - a.Points) || (b.PD - a.PD));
    const teamIdx = sorted.findIndex(s => s.id === team.id);
    const rank = teamIdx + 1;
    const points = team.Points;
    const pdiff = team.PD;
    const remaining = team.remaining;

    const sixth = sorted[5];
    const sixthPts = sixth ? sixth.Points : 0;
    const sixthPd = sixth ? sixth.PD : 0;
    const sixthName = sixth ? sixth.name : "TBD";

    const winPts = points + (remaining > 0 ? 15 : 0);
    const clinchOnWin = winPts > sixthPts || (winPts === sixthPts && pdiff >= sixthPd);
    const eliminatedOnLoss = (points < sixthPts && remaining === 0);

    let explanation = `Rank: ${rank}. Points: ${points}, PD: ${pdiff}. Remaining: ${remaining}. 6th: ${sixthName} (${sixthPts} pts). `;
    explanation += `If win: reach ${winPts} pts — ${clinchOnWin ? 'likely qualifies.' : 'needs favorable results.'} `;
    explanation += eliminatedOnLoss ? "If loss: eliminated." : "If loss: qualification depends on other results; risk high.";

    return explanation;
}

export async function POST(req: NextRequest) {
    if (!isAuthorized(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

    try {
        const { groupName, teamId } = await req.json();
        if (!groupName || !teamId) return NextResponse.json({ error: 'bad request' }, { status: 400 });

        const rawStandingsMap = await getStandings();
        const rawStandings = Array.from(rawStandingsMap.values()).flat();
        const annotated = await annotateElimination(rawStandings);
        const team = annotated.find(t => t.id === parseInt(teamId));

        if (!team) return NextResponse.json({ error: 'team not found' }, { status: 404 });

        const apiKey = process.env.GEMINI_API_KEY;
        const model = process.env.GEMINI_MODEL || "gemini-1.5-flash";
        let text = "";

        if (apiKey) {
            try {
                const sorted = annotated.filter(s => s.group_name === groupName).sort((a, b) => (b.Points - a.Points) || (b.PD - a.PD));
                const sixth = sorted[5];
                const sixthPts = sixth ? sixth.Points : 0;

                const prompt = `
You are an analyst for a league with groups. For Group ${groupName}, evaluate team "${team.name}".
Current points: ${team.Points}, point diff: ${team.PD}, remaining matches: ${team.remaining}, sixth-place points: ${sixthPts}.
Explain:
1) Chances to qualify for playoffs (top 6) this week.
2) Required scenarios (win/loss outcomes for them and close competitors).
3) Tie-break considerations based on point diff.
Output a concise, clear explanation suitable for a portal card.
`;
                const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        contents: [{ role: "user", parts: [{ text: prompt }] }]
                    })
                });

                if (response.ok) {
                    const data = await response.json();
                    text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
                }
            } catch (err) {
                console.error("Gemini API error:", err);
            }
        }

        if (!text) {
            text = generateHeuristic(groupName, team, annotated);
        }

        // Store in Supabase
        const { error: upsertError } = await supabaseServer
            .from('ai_scenarios')
            .upsert({
                team_id: team.id,
                group_name: groupName,
                scenario: text,
                updated_at: new Date().toISOString()
            }, { onConflict: 'team_id,group_name' });

        if (upsertError) throw upsertError;

        return NextResponse.json({ ok: true, scenario: text });
    } catch (error: any) {
        console.error("Scenario generation failed:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
