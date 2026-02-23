
const URL = "https://tekwoxehaktajyizaacj.supabase.co";
const ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRla3dveGVoYWt0YWp5aXphYWNqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA2NzcxMDAsImV4cCI6MjA4NjI1MzEwMH0.u9c2Kt8gWF_HxeIAzblT6p1NSLwjaeYFPglZoLj051U";

async function checkTeamsSchema() {
    const query = `${URL}/rest/v1/teams?limit=1`;
    const res = await fetch(query, {
        headers: { "apikey": ANON_KEY, "Authorization": `Bearer ${ANON_KEY}` }
    });

    if (!res.ok) {
        console.error('Error:', res.status, await res.text());
        return;
    }

    const data = await res.json();
    if (data.length > 0) {
        console.log('Columns in teams table:', Object.keys(data[0]));
    } else {
        console.log('No teams found to check schema.');
    }
}

checkTeamsSchema();
