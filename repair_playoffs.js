
const URL = "https://tekwoxehaktajyizaacj.supabase.co";
const ANON_KEY = "process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY";

async function repairPlayoffs() {
    const query = `${URL}/rest/v1/matches?group_name=eq.Playoffs&select=*`;
    const res = await fetch(query, {
        headers: { "apikey": ANON_KEY, "Authorization": `Bearer ${ANON_KEY}` }
    });
    const matches = await res.json();
    console.log('Found', matches.length, 'matches in Playoffs group.');

    for (const m of matches) {
        let updates = { match_type: 'playoff' };

        // Heuristic if round/pos missing: parse bracket_label like 'R2 #5'
        if (!m.playoff_round || !m.bracket_pos) {
            const label = m.bracket_label || '';
            const matchRound = label.match(/R(\d+)/i);
            const matchPos = label.match(/#(\d+)/);
            if (matchRound) updates.playoff_round = parseInt(matchRound[1]);
            if (matchPos) updates.bracket_pos = parseInt(matchPos[1]);
        }

        // Also force-fix existing round 1 and 2 if they seem off
        if (m.id >= 212 && m.id <= 219) {
            updates.playoff_round = 1;
            updates.bracket_pos = m.id - 211;
        } else if (m.id >= 220 && m.id <= 227) {
            updates.playoff_round = 2;
            updates.bracket_pos = m.id - 219;
        }

        console.log(`Updating match ${m.id} -> Round ${updates.playoff_round || m.playoff_round}, Pos ${updates.bracket_pos || m.bracket_pos}`);
        await fetch(`${URL}/rest/v1/matches?id=eq.${m.id}`, {
            method: 'PATCH',
            headers: {
                "apikey": ANON_KEY,
                "Authorization": `Bearer ${ANON_KEY}`,
                "Content-Type": "application/json",
                "Prefer": "return=minimal"
            },
            body: JSON.stringify(updates)
        });
    }
    console.log('Repair complete!');
}

repairPlayoffs();
