
const URL = 'https://tekwoxehaktajyizaacj.supabase.co';
const ANON_KEY = 'process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY';

async function listMatches() {
    const res = await fetch(URL + '/rest/v1/matches?match_type=eq.playoff&select=id,playoff_round,bracket_pos,team1_id,team2_id,status,score_t1,score_t2,winner_id,bracket_label&order=playoff_round.asc,bracket_pos.asc', {
        headers: { 'apikey': ANON_KEY, 'Authorization': 'Bearer ' + ANON_KEY }
    });
    const data = await res.json();
    console.log(JSON.stringify(data, null, 2));
}

listMatches();
