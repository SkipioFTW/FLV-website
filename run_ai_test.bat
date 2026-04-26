@echo off
set NODE_OPTIONS=--env-file=.env.local
npx tsx scripts/test_ai_intelligence.ts
