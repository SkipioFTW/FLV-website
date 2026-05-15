# FLV Portal — Application Summary

> **Last Updated:** May 2026 | **Current Season:** S24 | **Stack:** Next.js 16 + Supabase

## What Is This?

The **FLV (French League Valorant) Tournament Portal** is a full-stack web application for managing and analyzing a Valorant tournament. It provides public-facing standings, leaderboards, and player analytics, plus admin tools for match management and an AI-powered analyst.

## Quick Start

```bash
npm install          # Install dependencies
npm run dev          # Start dev server on localhost:3000
npm run build        # Production build
npm run start        # Serve production build
```

## Architecture

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 16 (App Router), React 19, Tailwind v4, Framer Motion |
| Backend | Next.js API Routes (serverless) |
| Database | Supabase (PostgreSQL) |
| AI | Google Gemini (SQL Agent mode) |
| Bot | Python discord.py (Skipio) |
| Hosting | Vercel |

## Key Pages

| Route | Description |
|-------|-------------|
| `/` | Landing page with scroll experience |
| `/standings` | Team standings by group |
| `/leaderboard` | Player stat rankings |
| `/matches` | Match browser with scoreboards |
| `/players` | Player search & deep analytics |
| `/teams` | Team search & analytics |
| `/playoffs` | Playoff bracket |
| `/skipio` | Custom ELO leaderboard |
| `/admin` | Admin panel (auth-gated) |

## Project Structure

```
src/app/         → Pages & API routes
src/components/  → React components (25+)
src/lib/         → Data layer, AI, ML model
Skipio-bot/      → Discord bot
training/        → ML model training
tools/           → Season transition & utility scripts
docs/            → Documentation & diagrams
```

## Documentation Index

- [ARCHITECTURE.md](docs/ARCHITECTURE.md) — System architecture with Mermaid diagrams
- [DATA_FLOW.md](docs/DATA_FLOW.md) — Database schema & data fetching patterns
- [COMPONENTS.md](docs/COMPONENTS.md) — Component dependency map
- [API_REFERENCE.md](docs/API_REFERENCE.md) — All API routes documented
- [Bot Architecture](docs/bot/ARCHITECTURE.md) — Discord bot architecture
- [Skipio ELO System](docs/SKIPIO_ELO_SYSTEM.md) — Custom ELO math docs
- [Season Transition Guide](tools/season-transition/SEASON_TRANSITION_GUIDE.md) — How to move between seasons

## Key Design Decisions

- **App Router** for server components and data-first rendering
- **Supabase** (PostgreSQL) as the single source of truth for all data
- **Season-aware queries** — every data function accepts `seasonId` parameter
- **AI SQL Agent** — the AI analyst queries the database directly via `exec_sql` RPC
- **Server/Client split** — pages fetch data server-side, pass to client components for interactivity