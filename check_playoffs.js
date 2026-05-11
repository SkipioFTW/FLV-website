
const URL = 'https://tekwoxehaktajyizaacj.supabase.co';
const ANON_KEY = 'process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY';

async function listPlayoffs() {
    const res = await fetch(URL + '/rest/v1/matches?group_name=eq.Playoffs&select=id,playoff_round,bracket_pos,team1:team1_id(name),team2:team2_id(name),status,winner_id,bracket_label&order=playoff_round.asc,bracket_pos.asc', {
        headers: { 'apikey': ANON_KEY, 'Authorization': 'Bearer ' + ANON_KEY }
    });
    const matches = await res.json();

    console.log('ID | R | P | Team 1 | Team 2 | Winner | Label');
    console.log('---|---|---|---|---|---|---');
    matches.forEach(m => {
        const t1 = m.team1 ? m.team1.name : 'TBD';
        const t2 = m.team2 ? m.team2.name : 'TBD';
        console.log(`${m.id} | ${m.playoff_round} | ${m.bracket_pos} | ${t1} | ${t2} | ${m.winner_id || '-'} | ${m.bracket_label || '-'}`);
    });
}

listPlayoffs();
