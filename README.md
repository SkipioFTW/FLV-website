# FLV Valorant Tournament Portal

A premium tournament management and analytics platform for the French League Valorant (FLV) community.

![Next.js](https://img.shields.io/badge/Next.js-16-black)
![React](https://img.shields.io/badge/React-19-blue)
![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL-green)
![Vercel](https://img.shields.io/badge/Deployed-Vercel-black)

---

## ✨ Features

- **Live Standings** — Real-time group standings with custom point system
- **Player Analytics** — ACS, K/D, ADR, KAST, agent pool, performance trends
- **Team Analytics** — Map win rates, roster analysis, head-to-head comparisons
- **Skipio ELO** — Custom peer-normalized performance rating system
- **AI League Analyst** — Ask questions about any team, player, or matchup
- **Broadcast Overlays** — OBS-ready overlays for live tournament streaming
- **Match Predictions** — ML-powered match outcome predictions
- **Discord Bot** — Full-featured tournament bot with slash commands
- **Admin Panel** — Match management, data import, and database tools

## 🚀 Quick Start

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Production build
npm run build && npm run start
```

### Environment Variables

Copy `.env.example` to `.env.local` and fill in:

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_key
GEMINI_API_KEY=your_gemini_key
```

## 📁 Project Structure

```
├── src/
│   ├── app/              # Next.js App Router (pages + API)
│   ├── components/       # React components (25+)
│   └── lib/              # Data layer, AI, ML model
├── Skipio-bot/           # Discord bot (Python)
├── training/             # ML model training
├── tools/
│   ├── season-transition/ # Season migration scripts & guide
│   └── one-time/          # Archived utility scripts
└── docs/                  # Documentation & architecture diagrams
```

## 📚 Documentation

| Document | Description |
|----------|-------------|
| [Architecture](docs/ARCHITECTURE.md) | System overview with Mermaid diagrams |
| [Data Flow](docs/DATA_FLOW.md) | Database schema & query patterns |
| [Components](docs/COMPONENTS.md) | Component dependency map |
| [API Reference](docs/API_REFERENCE.md) | All API endpoints |
| [Bot Architecture](docs/bot/ARCHITECTURE.md) | Discord bot structure & commands |
| [Skipio ELO](docs/SKIPIO_ELO_SYSTEM.md) | Custom ELO system math |
| [Season Transition](tools/season-transition/SEASON_TRANSITION_GUIDE.md) | Step-by-step season migration guide |

## 🔄 Season Transition

When it's time to move to a new season (e.g. S24 → S25):

1. Read the [Season Transition Guide](tools/season-transition/SEASON_TRANSITION_GUIDE.md)
2. Update the migration scripts in `tools/season-transition/`
3. Run the migration
4. Verify on the portal

## 🛠 Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router) |
| UI | React 19, Tailwind CSS v4, Framer Motion |
| Database | Supabase (PostgreSQL) |
| AI | Google Gemini |
| Charts | Recharts |
| Icons | Lucide React |
| Bot | Python discord.py |
| Hosting | Vercel |

## 📄 License

Private — FLV Community use only.
