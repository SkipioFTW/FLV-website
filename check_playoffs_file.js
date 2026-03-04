
const fs = require('fs');
const URL = 'https://tekwoxehaktajyizaacj.supabase.co';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRla3dveGVoYWt0YWp5aXphYWNqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA2NzcxMDAsImV4cCI6MjA4NjI1MzEwMH0.u9c2Kt8gWF_HxeIAzblT6p1NSLwjaeYFPglZoLj051U';

async function listPlayoffs() {
    const res = await fetch(URL + '/rest/v1/matches?group_name=eq.Playoffs&select=id,playoff_round,bracket_pos,team1:team1_id(name),team2:team2_id(name),status,winner_id,bracket_label&order=playoff_round.asc,bracket_pos.asc', {
        headers: { 'apikey': ANON_KEY, 'Authorization': 'Bearer ' + ANON_KEY }
    });
    const matches = await res.json();

    let out = 'ID | R | P | Team 1 | Team 2 | Winner | Label\n';
    out += '---|---|---|---|---|---|---\n';
    matches.forEach(m => {
        const t1 = m.team1 ? m.team1.name : 'TBD';
        const t2 = m.team2 ? m.team2.name : 'TBD';
        out += `${m.id} | ${m.playoff_round} | ${m.bracket_pos} | ${t1} | ${t2} | ${m.winner_id || '-'} | ${m.bracket_label || '-'}\n`;
    });
    fs.writeFileSync('playoffs_debug.txt', out, 'utf8');
    console.log('Wrote playoffs_debug.txt');
}

listPlayoffs();
