const fs = require('fs');

const URL = 'https://tekwoxehaktajyizaacj.supabase.co';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRla3dveGVoYWt0YWp5aXphYWNqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA2NzcxMDAsImV4cCI6MjA4NjI1MzEwMH0.u9c2Kt8gWF_HxeIAzblT6p1NSLwjaeYFPglZoLj051U';

async function fetchMatch(id) {
    const res = await fetch(`${URL}/rest/v1/matches?id=eq.${id}&select=*`, {
        headers: { 'apikey': ANON_KEY, 'Authorization': `Bearer ${ANON_KEY}` }
    });
    const data = await res.json();
    return data && data.length > 0 ? data[0] : null;
}

async function updateMatch(id, updates) {
    await fetch(`${URL}/rest/v1/matches?id=eq.${id}`, {
        method: 'PATCH',
        headers: {
            'apikey': ANON_KEY,
            'Authorization': `Bearer ${ANON_KEY}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=minimal'
        },
        body: JSON.stringify(updates)
    });
    console.log(`Updated match ${id}:`, updates);
}

async function insertMatch(data) {
    await fetch(`${URL}/rest/v1/matches`, {
        method: 'POST',
        headers: {
            'apikey': ANON_KEY,
            'Authorization': `Bearer ${ANON_KEY}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=minimal'
        },
        body: JSON.stringify(data)
    });
    console.log(`Inserted match:`, data);
}

async function deleteMatch(id) {
    await fetch(`${URL}/rest/v1/matches?id=eq.${id}`, {
        method: 'DELETE',
        headers: {
            'apikey': ANON_KEY,
            'Authorization': `Bearer ${ANON_KEY}`
        }
    });
    console.log(`Deleted match ${id}`);
}

async function repair() {
    console.log('Starting repair...');

    // 1. Delete the corrupted match 268 (R3 #4)
    const badMatch = await fetchMatch(268);
    if (badMatch) {
        await deleteMatch(268);
    }

    // 2. We need to correctly advance the winner of match 223 (R2 #4)
    // Match 223 winner is 17 (Gooner Academy)
    // It should go to R3 #2 (since pos 4 / 2 = 2)
    // isTeam1 = pos < siblingPos ? 4 < 3 (false) -> team2_id

    // Check if R3 #2 exists
    const res = await fetch(`${URL}/rest/v1/matches?match_type=eq.playoff&playoff_round=eq.3&bracket_pos=eq.2&select=*`, {
        headers: { 'apikey': ANON_KEY, 'Authorization': `Bearer ${ANON_KEY}` }
    });
    const r3m2 = await res.json();

    if (r3m2 && r3m2.length > 0) {
        // Update existing R3 #2
        await updateMatch(r3m2[0].id, { team2_id: 17 });
    } else {
        // Insert new R3 #2
        await insertMatch({
            week: 0,
            group_name: 'Playoffs',
            team1_id: null,
            team2_id: 17,
            status: 'scheduled',
            format: 'BO3',
            maps_played: 0,
            match_type: 'playoff',
            playoff_round: 3,
            bracket_pos: 2,
            bracket_label: `R3 #2`
        });
    }

    console.log('Repair complete!');
}

repair();
