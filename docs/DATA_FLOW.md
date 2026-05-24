# FLV Portal — Data Flow

This document explains how data flows through the application, from the Supabase database to the user's screen.

---

## Database Schema

> These tables match the live Supabase schema exactly. Substitutions are recorded
> inline in `match_stats_map` via `is_sub` / `subbed_for_id` — there is no
> separate substitutions table.

```mermaid
erDiagram
    SEASONS {
        text id PK "e.g. S24"
        text name "Season 24"
        boolean is_active
        int winner_id FK
    }

    TEAMS {
        int id PK
        text tag
        text name
        text group_name
        text captain
        text co_captain
        text logo_path
    }

    PLAYERS {
        int id PK
        text name
        text riot_id
        text rank
        text tracker_link
        text discord_handle
        text uuid "Discord snowflake"
        int default_team_id FK
    }

    MATCHES {
        int id PK
        int week
        text group_name
        int team1_id FK
        int team2_id FK
        int winner_id FK
        text season_id FK
        int score_t1
        int score_t2
        text status "scheduled|completed|live"
        text format "BO1|BO3|BO5"
        text maps_played
        text match_type "regular|playoff"
        int playoff_round
        int bracket_pos
        text bracket_label
        int is_forfeit
        boolean reported
        text channel_id
        text submitter_id
        text[] tracker_ids
    }

    MATCH_MAPS {
        int id PK
        int match_id FK
        int map_index
        text map_name
        int team1_rounds
        int team2_rounds
        int winner_id
        int is_forfeit
    }

    MATCH_STATS_MAP {
        int id PK
        int match_id FK
        int map_index
        int team_id FK
        int player_id FK
        int is_sub "1 if substitution"
        int subbed_for_id "original player id"
        text agent
        int acs
        int kills
        int deaths
        int assists
        float adr
        float kast
        float hs_pct
        int fk "first kills"
        int fd "first deaths"
        int mk "multi-kills"
        float dd_delta
        int plants
        int defuses
        int survived
        int traded
        int clutches
        jsonb clutches_details
        jsonb ability_casts
    }

    MATCH_ROUNDS {
        uuid id PK
        int match_id FK
        int map_index
        int round_number
        int winning_team_id FK
        text win_type
        boolean plant
        boolean defuse
        int economy_t1
        int economy_t2
    }

    MATCH_PLAYER_ROUNDS {
        uuid id PK
        int match_id FK
        int map_index
        int round_number
        int player_id FK
        int kills
        int damage
        text weapon
        int spent
    }

    TEAM_HISTORY {
        int id PK
        int team_id FK
        text season_id FK
        text captain
        text co_captain
        text group_name
    }

    PLAYER_HISTORY {
        int id PK
        int player_id FK
        text season_id FK
        text rank
    }

    PLAYER_TEAM_HISTORY {
        int id PK
        int player_id FK
        int team_id FK
        text season_id FK
        timestamp joined_at
        timestamp left_at
        boolean is_current
    }

    SEASONS ||--o{ MATCHES : "season_id"
    SEASONS ||--o{ TEAM_HISTORY : "season_id"
    SEASONS ||--o{ PLAYER_HISTORY : "season_id"
    SEASONS ||--o{ PLAYER_TEAM_HISTORY : "season_id"
    TEAMS ||--o{ MATCHES : "team1_id"
    TEAMS ||--o{ TEAM_HISTORY : "team_id"
    TEAMS ||--o{ PLAYER_TEAM_HISTORY : "team_id"
    TEAMS ||--o{ MATCH_ROUNDS : "winning_team_id"
    PLAYERS ||--o{ MATCH_STATS_MAP : "player_id"
    PLAYERS ||--o{ PLAYER_HISTORY : "player_id"
    PLAYERS ||--o{ PLAYER_TEAM_HISTORY : "player_id"
    PLAYERS ||--o{ MATCH_PLAYER_ROUNDS : "player_id"
    MATCHES ||--o{ MATCH_MAPS : "match_id"
    MATCHES ||--o{ MATCH_STATS_MAP : "match_id"
    MATCHES ||--o{ MATCH_ROUNDS : "match_id"
    MATCHES ||--o{ MATCH_PLAYER_ROUNDS : "match_id"
```

### Other tables (not part of the main data flow)

| Table | Purpose |
|-------|---------|
| `admins` | Admin panel credentials (username + bcrypt hash) |
| `agents` | Agent name lookup table |
| `ai_scenarios` | Stored AI-generated "What-If" scenarios |
| `league_snapshots` | Point-in-time JSON snapshots of all tournament data (used by AI) |
| `bot_replies` | Discord bot reply cache per user |
| `pending_matches` | Matches submitted by players awaiting admin approval |
| `pending_players` | Player registrations awaiting admin approval |
| `session_activity` | Active admin portal sessions |

---

## Data Fetching Flow

```mermaid
sequenceDiagram
    participant Browser
    participant NextPage as Next.js Page (Server)
    participant DataTS as lib/data.ts
    participant Supabase as Supabase DB

    Browser->>NextPage: GET /standings?season=S24
    NextPage->>DataTS: getStandings("S24")
    DataTS->>Supabase: SELECT * FROM team_history WHERE season_id='S24'
    Supabase-->>DataTS: team IDs + groups
    DataTS->>Supabase: SELECT * FROM teams WHERE id IN (...)
    Supabase-->>DataTS: team details
    DataTS->>Supabase: SELECT * FROM matches WHERE season_id='S24' AND status='completed'
    Supabase-->>DataTS: completed matches
    DataTS->>Supabase: SELECT * FROM match_maps WHERE match_id IN (...)
    Supabase-->>DataTS: round data per map
    DataTS-->>DataTS: Calculate points (15/min(rounds,12))
    DataTS-->>NextPage: Map<groupName, StandingsRow[]>
    NextPage-->>Browser: Rendered HTML with standings
```

---

## Core Data Functions (`lib/data.ts`)

The `data.ts` file (~3400 lines) is the heart of the data layer. All functions accept an optional `seasonId` parameter for multi-season support.

### Season Management

| Function | Returns | Description |
|----------|---------|-------------|
| `getDefaultSeason()` | `string` | Returns the latest season ID (e.g. "S24") |
| `getSeasons()` | `Season[]` | All seasons + synthetic "All Time" entry |

### Standings & Team Data

| Function | Returns | Description |
|----------|---------|-------------|
| `getStandings(seasonId?)` | `Map<string, StandingsRow[]>` | Grouped standings with W/L/Points/PD |
| `getTeamPerformance(teamId, seasonId?)` | `TeamPerformance` | Full team analytics |
| `getGlobalStats(seasonId?)` | `GlobalStats` | Active teams, matches, players, points |

### Player Data

| Function | Returns | Description |
|----------|---------|-------------|
| `getLeaderboard(minGames?, matchType?, seasonId?)` | `LeaderboardPlayer[]` | Ranked player stats |
| `getPlayerStats(playerId, seasonId?)` | `PlayerStats` | Individual player deep stats |
| `getMetaAnalytics(seasonId?)` | `MetaAnalytics` | Agent & map meta analysis |

### Match Data

| Function | Returns | Description |
|----------|---------|-------------|
| `getMatches(seasonId?)` | `MatchEntry[]` | All matches with team details |
| `getMatchDetails(matchId)` | `MatchDetail` | Full scoreboard with per-map stats |
| `parseTrackerJson(json, ...)` | `TrackerResult` | Parse Tracker.gg JSON into match data |

### Prediction & ELO

| Function | Returns | Description |
|----------|---------|-------------|
| `getSkipioLeaderboard(seasonId?)` | `SkipioEntry[]` | ELO rankings with tier labels |
| `determineArchetype(agent)` | `string` | Maps agent to role (Duelist, etc.) |

---

## Points System

The tournament uses a custom points system:

```
Winner:  15 points
Loser:   min(rounds_won, 12) points
Draw:    min(rounds_won, 12) points each
```

**Standings Sort Order:**
1. Total Points (descending)
2. Point Differential — `PD = Points - Points Against` (descending)

---

## Season Filtering Logic

All season-aware queries follow this pattern:

```typescript
// Default: latest season
const activeSeason = seasonId || await getDefaultSeason();
const isAllTime = activeSeason === 'all';

// Build query
let query = supabase.from('matches').select('*').eq('status', 'completed');

if (!isAllTime) {
    // S23 legacy: matches created before multi-season support have season_id = NULL.
    // The transition script tags these as 'S23'. Once transition.py has been run,
    // the OR clause below is no longer needed — but it is kept as a safety net.
    const filter = activeSeason === 'S23'
        ? 'season_id.eq.S23,season_id.is.null'
        : `season_id.eq.${activeSeason}`;
    query = query.or(filter);
}
```

This pattern is used in `getStandings`, `getLeaderboard`, `getMatches`, and all other
season-aware functions.

> **Note for S25+:** After running `tools/season-transition/transition.py` for S24→S25,
> all S24 matches will have `season_id = 'S24'` set explicitly. No matches should ever
> have `season_id = NULL` again. The S23 special-case branch above becomes a no-op for
> any future season but is harmless to keep.

---

## Skipio ELO System

See [SKIPIO_ELO_SYSTEM.md](./SKIPIO_ELO_SYSTEM.md) for the complete mathematical foundation.

**Summary:**
1. Calculate Raw Performance Score (RPS) from ACS, K/D, ADR, KAST
2. Normalize against peer groups (rank-based global avg + lobby avg)
3. Compute ELO: `1000 + (avg_blended - 100) × 20`
4. Tier assignment: Godlike (1400+) → Struggling (<850)
