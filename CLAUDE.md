# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

FLV Portal — a tournament management/analytics web app for the French League Valorant (FLV) community. Three subsystems share one Supabase Postgres database:

1. **Web Portal** (`src/`) — Next.js 16 / React 19 app: public standings/leaderboards/player-team analytics, broadcast overlays for OBS, an AI analyst, and an admin panel.
2. **Skipio Discord Bot** (`Skipio-bot/`) — Python `discord.py` bot for slash commands, analytics, and match entry. Connects directly to Postgres via `psycopg2`, and proxies AI questions through the portal's `/api/chat`.
3. **ML Predictor** (`training/`, `src/lib/model/`, `src/lib/features/`) — Python-trained match-outcome model, served via `src/lib/model/infer.ts` and retrainable through a GitHub Actions workflow triggered from the admin panel.

## Commands

```bash
npm run dev      # Next.js dev server (localhost:3000)
npm run build    # Production build
npm run start    # Serve production build
npm run lint      # ESLint (eslint-config-next + custom no-unused-vars rule)
```

There is no test suite/runner configured in this repo — don't assume one exists.

Python sides (`Skipio-bot/`, `training/`) each have their own `requirements.txt`; install with `pip install -r requirements.txt` inside that directory before running `python main.py` (bot) or `python train.py` (model training).

## Environment

Copy `.env.example` → `.env.local`. Key vars: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `ADMIN_USER`/`ADMIN_PASSWORD`/`ADMIN_TOKEN`, `PREDICTOR_GH_TOKEN`/`PREDICTOR_GITHUB_OWNER`/`PREDICTOR_GITHUB_REPO` (model retrain workflow dispatch), `HENDRIK_API_KEY` (HenrikDev Valorant API), `GEMINI_API_KEY` (AI analyst), `BOT_SECRET` (shared secret for server-to-server callers of the maps parse/save API). `Skipio-bot/` and `tools/season-transition/` have their own `.env` files (gitignored) — see `Skipio-bot/BOT_SETUP.md`.

## Architecture

### Data layer — `src/lib/data.ts`
This single ~3400-line file is the source of truth for almost all Supabase reads (standings, leaderboard, player/team analytics, matches, Skipio ELO, meta analytics). **Every function takes an optional `seasonId` parameter.** Pattern used throughout:

```ts
const activeSeason = seasonId || await getDefaultSeason();
const isAllTime = activeSeason === 'all';
// S23 legacy data has season_id IS NULL — treated specially when activeSeason === 'S23'
```

When adding a new data-fetching function, follow this season-filter convention rather than inventing a new one — the bot's `database.py` mirrors the same `(season_id = %s OR (season_id IS NULL AND %s = 'S23'))` logic, so the two must stay in sync conceptually.

### Server/Client split
Pages under `src/app/(main)/**/page.tsx` are server components that call `lib/data.ts` directly and pass results as props into client components (`"use client"`) in `src/components/`. Don't fetch data client-side with `useEffect` when a server component can do it.

### Route groups
- `(main)` — standard pages: Navbar, AI Analyst widget, ambient background effects.
- `(overlays)` — bare layout (no chrome) for OBS browser-source overlays at `/overlay/*`.

### Admin auth
`src/lib/adminAuth.ts` — not JWT despite some docs saying so. It's an HMAC-SHA256 signed cookie (`admin_session` = `timestamp.signature`, signed with `ADMIN_TOKEN`, 12h freshness window). `isAuthorized(req)` is the gate every `src/app/api/admin/**/route.ts` handler must call.

**Exception:** `api/admin/maps/parse` and `api/admin/maps/save` have their own local `isAuthorized` that additionally accepts an `x-bot-secret` header matching `BOT_SECRET`. External repos depend on these two endpoints (and their response/request shapes): the **botlightvalorant** Discord bot (`/match report_result` captain match reporting) and the **FLV-Registration** staff panel, plus this repo's `Skipio-bot/cogs/match_report.py`. Don't rename or remove response fields (`team1Rows`/`team2Rows` row keys, `unmatched`, `t1_rounds`/`t2_rounds`) without checking those callers — additive changes only.

### AI Analyst — SQL agent (`src/lib/ai/chat.ts`, `src/lib/ai/db.ts`)
The AI doesn't get a data snapshot — it's given the DB schema + standings rules in the system prompt and issues its own read-only `SELECT` queries (up to `MAX_SQL_ROUNDS`) via `executeAIQuery`, which calls the Supabase `exec_sql` RPC (enforces SELECT-only at the DB level too). Standings math is non-trivial (winner 15 pts, loser `min(rounds_won, 12)` pts, PD tiebreak) — there's an exact "STANDINGS TEMPLATE" SQL block embedded in the system prompt; extend that template rather than letting the model derive standings from scratch, since it has previously gotten this wrong. `FAT1`/`FAT2` are admin/test placeholder teams to exclude from real analysis, not satire — keep them excluded in any new query logic.

The Discord bot doesn't talk to Gemini directly; `/ask_ai` proxies through the portal's `/api/chat` so both surfaces share one prompt/agent.

### ML prediction pipeline
`src/lib/features/buildFeatures.ts` / `buildDynamicFeatures.ts` build model inputs from the same Supabase tables `lib/data.ts` reads; `src/lib/model/infer.ts` + `registry.ts` load/serve the trained model for `/api/predict`. Retraining isn't done in-process — the admin panel's "retrain" action (`/api/admin/model/retrain`) dispatches the `train.yml` GitHub Actions workflow (via `PREDICTOR_GH_TOKEN`), which runs `training/train.py` and commits the new model artifact; `/api/model/reload` then hot-reloads it.

### Database schema essentials
Core tables: `seasons`, `teams`, `players`, `matches`, `match_maps`, `match_stats_map` (per-player-per-map stats), `match_rounds`, `match_player_rounds`. Multi-season history is tracked via `team_history`, `player_history`, `player_team_history` rather than mutating the base tables. There is no separate substitutions table — subs are inline in `match_stats_map` via `is_sub`/`subbed_for_id`. Full ER diagram: `docs/DATA_FLOW.md`.

### External integrations
- **GitHub** (`src/app/api/github/matches/**`) — match JSON submission/resolution flow, also used by the GitHub Actions retrain dispatch.
- **HenrikDev API** (`src/app/api/henrikdev/match/route.ts`) — pulls live Valorant match data by tracker ID.
- **Tracker.gg JSON** — parsed by `parseTrackerJson` / `parseHenrikDevJson` in `lib/data.ts` into match/map/player stat rows (this is how match results get imported).

### Match result import flow
All match entry paths converge on the same two endpoints: `POST /api/admin/maps/parse` (fetches tracker/HenrikDev data, matches Riot IDs against the `players` table, detects subs, returns per-team stat rows + `unmatched` Riot IDs) then `POST /api/admin/maps/save` per map (writes `match_maps`/`match_stats_map`/`match_rounds`/`match_player_rounds`, recomputes match totals/winner, advances playoff brackets). The admin panel's Unified Score Editor does this client-side; Discord bots call the endpoints with `x-bot-secret`. Match-level forfeits are not saved through this flow — they're a direct `matches` update (13-0, `is_forfeit=1`, `maps_played=0`, map detail rows wiped).

## Documentation map

Read these before making non-trivial changes in their area — they're kept accurate and detailed:
- `docs/ARCHITECTURE.md` — full system diagram, directory structure, route map
- `docs/DATA_FLOW.md` — ER diagram, season-filter pattern, points system
- `docs/COMPONENTS.md` — component dependency tree, server vs. client split
- `docs/bot/ARCHITECTURE.md` — Skipio bot cogs/commands/chart generation
- `docs/SKIPIO_ELO_SYSTEM.md` — Skipio ELO math
- `tools/season-transition/SEASON_TRANSITION_GUIDE.md` — required reading before any S(N)→S(N+1) migration; pairs with `tools/season-transition/transition.py` and `migration_template.sql`
