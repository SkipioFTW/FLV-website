
const URL = 'https://tekwoxehaktajyizaacj.supabase.co';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRla3dveGVoYWt0YWp5aXphYWNqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA2NzcxMDAsImV4cCI6MjA4NjI1MzEwMH0.u9c2Kt8gWF_HxeIAzblT6p1NSLwjaeYFPglZoLj051U';

async function listMatches() {
    const res = await fetch(URL + '/rest/v1/matches?match_type=eq.playoff&select=id,playoff_round,bracket_pos,team1_id,team2_id,status,score_t1,score_t2,winner_id,bracket_label&order=playoff_round.asc,bracket_pos.asc', {
        headers: { 'apikey': ANON_KEY, 'Authorization': 'Bearer ' + ANON_KEY }
    });
    const data = await res.json();
    console.log(JSON.stringify(data, null, 2));
}

listMatches();
