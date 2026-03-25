# Application Overview

This repository hosts a **Next.js 13+** web portal for the Valorant S23 tournament. The core of the application lives in the `new_app_repo` folder and is organized as follows:

- **Pages** (`src/app/*`): Server‑component routes that render UI and call the API layer. Main pages include Home, Players, Matches, Standings, Leaderboard, Playoffs, Summary, and Predictions.
- **API routes** (`src/app/api/*`): Next.js API routes that handle data CRUD, admin actions, DB backup/reset, site‑flag toggles, and predictions. All routes are server‑side.
- **Components** (`src/components/*`): Reusable React components such as `Navbar`, `ActivityTracker`, `AIAnalyst`, and statistical views.
- **Data layer** (`src/lib/*`): Utilities for fetching data from Prisma/SQLite and helpers for type definitions.
- **Static assets**: Tailwind CSS (`globals.css`), fonts via `next/font`, and static images in `public/`.
- **AI / Prediction**: Live predictor API routes (`/api/predict`, `/api/predictions/upcoming`) and an older Python‑based model kept in `old prediction model/`.

## Build & Development Commands
| Purpose | Command | Notes |
|---------|---------|-------|
| Install dependencies | `npm install` | Run inside `new_app_repo`. |
| Dev server | `npm run dev` | Serves on `localhost:3000`. |
| Production build | `npm run build` | Generates `.next` output. |
| Serve build | `npm run start` | Runs the built app. |
| Lint | `npm run lint` | ESLint on TS/TSX files. |
| Type check | `npm run typecheck` | `tsc --noEmit`. |
| Format | `npm run format` | Prettier. |
| Run tests | `npm run test` | Jest or Vitest. |
| Run single test | `npm test path/to/test.tsx` | Jest style. |

## Typical API Flow
1. Frontend request → Next.js API route → Prisma/JSON → Response.
2. Admin actions use `/api/admin/*` with JWT authentication.
3. Prediction endpoints call either the Node‑based predictor or the legacy Python model.

## Key Architectural Decisions
- **App router** for server components and data‑first rendering.
- **Prisma + SQLite** for a lightweight DB in dev; can be swapped out.
- **AI Analyst component** overlays analytics via polling/WebSocket.
- **Separate legacy model folder** preserves old Python scripts.
- **Tailwind & Next.js font integration** for consistent styling.

---
This summary is stored in the repository for quick reference by future Claude Code sessions. Feel free to review or update it as the architecture evolves.