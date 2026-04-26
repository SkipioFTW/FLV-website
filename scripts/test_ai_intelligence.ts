const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');

const envPath = path.resolve(__dirname, '../.env.local');
dotenv.config({ path: envPath });

const { chatWithAI } = require('../src/lib/ai/chat');

async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function runTests() {
  console.log("--- AI INTELLIGENCE TEST (v8.0) ---");

  const tests = [
    {
      q: "Who was the winner of Season 23?",
      season: "S23",
      expect: "ATOR Black"
    },
    {
      q: "Who are the current leaders in Season 24?",
      season: "S24",
      expect: "RISE Dawn"
    }
  ];

  for (const t of tests) {
    console.log(`\n[Test] Q: "${t.q}" | Season: ${t.season}`);
    try {
        const res = await chatWithAI(t.q, null, [], t.season);
        
        if (res.error) {
          console.error(`❌ AI Error: ${res.error}`);
        } else {
            console.log(`[AI Response]:\n${res.reply.slice(0, 500)}...`);
            
            if (res.reply.toLowerCase().includes(t.expect.toLowerCase())) {
              console.log(`✅ Passed: Contains "${t.expect}"`);
            } else {
              console.error(`❌ Failed: Expected "${t.expect}" not found.`);
            }
        }
    } catch (e) {
        console.error(`❌ Execution Error: ${e.message}`);
    }
    console.log("Waiting 45 seconds to avoid rate limits...");
    await sleep(45000);
  }
}

runTests().catch(console.error);
