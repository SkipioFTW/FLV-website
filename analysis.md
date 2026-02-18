# Production Dashboard Technical Analysis

This document provides a detailed breakdown of the `visitor_dashboard.py` file found in the `production` folder. It maps existing features, logic, and data structures to prepare for a migration to a modern tech stack.

## 1. System Architecture Overview
The current dashboard is built using **Streamlit**, a Python-based framework for rapid UI development. It follows a monolithic structure where UI, business logic, and database interactions co-exist in a single large file (~6,000 lines).

### Core Stack
- **Frontend/UI**: Streamlit (Components & Custom CSS)
- **Backend Logic**: Python
- **Database**: Dual-support for **PostgreSQL (Supabase)** and **SQLite**.
- **External Integration**:
    - **GitHub API**: Fetches `match_[matchID].json` from `assets/matches` for auto-parsing.
    - **Tracker.gg**: Scraping and JSON parsing for player stats.
    - **Gemini API**: Generates team-specific AI Scenarios.

---

## 2. Database Schema & Data Models
The system manages a complex Valorant tournament ecosystem.

| Table | Purpose | Key Fields |
| :--- | :--- | :--- |
| `teams` | Organization info | `id`, `tag`, `name`, `group_name`, `captain`, `logo_path` |
| `players` | Individual profiles | `id`, `name`, `riot_id`, `rank`, `uuid`, `default_team_id` |
| `matches` | Game scheduling | `id`, `week`, `team1_id`, `team2_id`, `winner_id`, `status` |
| `match_maps` | Individual map scores | `match_id`, `map_index`, `map_name`, `team1_rounds`, `team2_rounds` |
| `match_stats_map` | Detailed player stats | `match_id`, `map_index`, `player_id`, `agent`, `acs`, `kills`, etc. |
| `admins` | Authenticated users | `username`, `password_hash`, `salt`, `role` |
| `session_activity` | Security tracking | `session_id`, `ip_address`, `last_activity`, `role` |
| `pending_matches` | Bot submissions | `team_a`, `team_b`, `url`, `status`, `submitted_by` |

---

## 3. Feature Breakdown (Section by Section)

### A. Navigation & Routing
- **Pseudo-Routing**: Uses `st.session_state['page']` to switch between views (Overview, Matches, Leaderboard, Profiles, Playoffs, Admin).
- **Custom Header**: A fixed-position CSS-based navbar replaces the default Streamlit sidebar.

### B. Overview & Standings
- **Points Logic**: Calculates Wins/Losses/Draws. Includes a specialized "Points System" (15 for win, capped round count for loss).
- **Tie-breakers**: RD (Round Diff) and PD (Point Diff) calculations.

### C. Matches & Scoreboards
- **Week Selection**: Filter matches by week.
- **Detailed View**: Expandable rows showing per-map results and full scoreboards with agents.
- **Tracker Integration**: Functional parsing of Tracker.gg JSON to auto-populate stats.

### D. Playoff Brackets
- **Dynamic Visualization**: A custom CSS-grid based bracket supporting Round of 24 up to the Final.
- **Interactive Slots**: Displays TBD until matches are scheduled.

### E. Admin Panel (The "Brain")
- **Live Monitoring**: Real-time count of active users and their IP addresses.
- **Queue Processing**: Interface to approve or reject match/player requests submitted via Discord.
- **AI Tools**: Gemini-powered scenario generator that predicts "What if" outcomes for teams.
- **Data Management**: Full DB export/import, GitHub cloud backup, and schema reset tools.
- **Match Editor**: A highly complex form with OCR/JSON auto-fill for map scores and player stats.

### F. GitHub Data Synchronization
- **Match JSON Fetching**: The `fetch_match_from_github` function calls the GitHub REST API to retrieve match details stored in `assets/matches/match_[matchID].json`.
- **Auto-Fill Logic**: These JSONs are parsed by `parse_tracker_json` to automatically fill the Match Editor form, providing high-accuracy data entry for admins.
- **Repository Backups**: Includes logic to backup/restore the entire database to/from GitHub.

---

## 4. UI/UX & Aesthetics
- **Theme**: Dark mode "Valorant" aesthetics (Orbitron font, Red/Blue highlights).
- **Glassmorphism**: Backdrop blur on navbars and cards.
- **Mobile Support**: Custom CSS media queries to fix Streamlit's layout issues on small screens.

---

## 5. Critical Logic & "Gotchas"
- **Session Security**: Uses a fingerprinting technique (User-Agent + Headers) to maintain persistent session IDs across IP rotations.
- **Throttled Tracking**: Only writes user activity to the DB every 60 seconds to prevent lag.
- **Dynamic Schema**: The code includes functions (`ensure_column`) to automatically upgrade DB tables if the schema changes.
- **Dual DB Support**: Heavy reliance on a `UnifiedDBWrapper` to switch between SQLite and Postgres syntax.

---

## 6. Migration Strategy Features
To reach **Feature Parity** in the new stack, we must implement:
1. **SSG/SSR**: Pre-render standings and profiles for speed.
2. **Real-time**: Use Supabase Listeners for the Admin Queue and Live User count.
3. **Complex Forms**: React Hook Form for the multi-map Match Editor.
4. **Auth**: Supabase Auth (replaces the custom HMAC-based logic).
