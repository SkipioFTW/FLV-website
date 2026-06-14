# FLV Portal — API Reference

All API routes are located under `src/app/api/`. They are server-side Next.js route handlers.

---

## Public APIs

### `GET /api/activity`
Tracks visitor activity on the portal.

| Field | Value |
|-------|-------|
| **Auth** | None |
| **Purpose** | Records IP-based session activity for analytics |
| **Response** | `{ ok: true }` |

---

### `POST /api/chat`
AI League Analyst — natural language Q&A about the tournament.

| Field | Value |
|-------|-------|
| **Auth** | None |
| **Purpose** | Query the AI analyst about teams, players, and matchups |
| **Request** | `{ message: string, history?: ChatMessage[], seasonId?: string }` |
| **Response** | `{ reply: string }` |
| **Rate Limit** | Message max 500 chars, history limited to last 10 messages |
| **AI Backend** | Google Gemini 2.5 Flash by default (configurable via `AI_PROVIDER`/`AI_MODEL`/`AI_API_KEY`; also supports `groq`, `mistral`, `deepseek`, `openrouter`, or any OpenAI-compatible endpoint via `AI_BASE_URL`) |

The AI agent can query the database directly via a secure `exec_sql` RPC function, issuing up to 3 SQL queries per question for multi-step analysis.

---

### `GET /api/predict`
Match prediction using the ML model.

| Field | Value |
|-------|-------|
| **Auth** | None |
| **Params** | `team1_id` (int), `team2_id` (int) |
| **Response** | `{ team1_id, team2_id, probability_team1_win: number, features: Record<string, number> }` |
| **Model** | Logistic regression v5 (dynamic features) or B-ratings fallback |

---

### `GET /api/predictions/upcoming`
Fetches upcoming match predictions.

| Field | Value |
|-------|-------|
| **Auth** | None |
| **Response** | Array of upcoming matches with prediction probabilities |

---

### `GET /api/site/flags`
Feature flag management.

| Field | Value |
|-------|-------|
| **Auth** | None (read) |
| **Response** | `{ flags: Record<string, boolean> }` |

---

## GitHub Integration APIs

### `GET /api/github/matches`
Lists match JSON files from the GitHub repository.

| Field | Value |
|-------|-------|
| **Auth** | None |
| **Response** | Array of available match files |

### `GET /api/github/matches/[id]`
Fetches a specific match JSON from GitHub.

| Field | Value |
|-------|-------|
| **Params** | `id` — match file identifier |
| **Response** | Raw match JSON from `assets/matches/` |

### `POST /api/github/matches/resolve`
Resolves a GitHub match URL to structured data.

---

## Admin APIs

All admin endpoints require JWT authentication via HTTP-only cookies. Login first via `/api/admin/login`.

### Authentication

#### `POST /api/admin/login`
| Field | Value |
|-------|-------|
| **Request** | `{ username: string, password: string }` |
| **Response** | Sets HTTP-only JWT cookie, returns `{ success: true }` |

#### `POST /api/admin/logout`
Clears the auth cookie.

#### `GET /api/admin/me`
Returns the currently authenticated admin user info.

---

### Match Management

#### `POST /api/admin/matches/create`
Creates a new match.

#### `POST /api/admin/matches/update`
Updates an existing match (scores, winner, status).

#### `POST /api/admin/matches/delete`
Deletes a match by ID.

#### `POST /api/admin/matches/bulk`
Bulk import matches from a schedule.

---

### Player Management

#### `POST /api/admin/players/create`
Creates a new player.

#### `POST /api/admin/players/update`
Updates player info (name, rank, team, etc.).

#### `POST /api/admin/players/delete`
Deletes a player by ID.

---

### Map Data

#### `POST /api/admin/maps/save`
Saves per-map stats, round data, and player stats for a match.

---

### Database Operations

#### `POST /api/admin/db/backup`
Creates a database backup snapshot.

#### `POST /api/admin/db/export`
Exports database tables to JSON.

#### `POST /api/admin/db/restore`
Restores database from a backup.

#### `POST /api/admin/db/reset`
⚠️ Resets database to clean state. Use with extreme caution.

---

### AI & Model

#### `POST /api/admin/scenarios`
Retrieves saved AI-generated scenarios.

#### `POST /api/admin/scenarios/generate`
Generates new "What-If" scenarios via Gemini AI.

#### `POST /api/admin/model/retrain`
Triggers retraining of the prediction model.

#### `POST /api/model/reload`
Reloads the prediction model from training output files.

---

### Snapshots

#### `POST /api/admin/snapshot/generate`
Generates a text snapshot of all tournament data for AI context.

---

### Feature Flags

#### `POST /api/admin/site/flags`
Updates site-wide feature flags (admin-only write access).
