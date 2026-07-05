# 🤖 Skipio Discord Bot - Local Setup Guide

Follow these steps to get your Valorant Tournament bot running on your local machine.

## Features
- **Premium AI Integration**: Thread-based conversation via `/ask_ai` with contextual history.
- **Player Stats**: Quick overview using `/stats` or detailed breakdown using `/player_info`.
- **Standings & Leaderboards**: Track season-by-season rankings via `/standings` and `/leaderboard`.
- **Interactive Charts**: Render visual performance graphs with `/stats_chart`.
- **Matches**: Live match reporting and upcoming schedules via `/matches`.

## Prerequisites
1. **Python 3.10+** installed.
2. **Discord Developer Account** with a registered Bot application.
3. **Supabase Database** (PostgreSQL) access credentials.

## Step 1: Create your Environment File
In the `Skipio-bot` directory, create a new file named `.env`.

Add the following variables to it:
```env
DISCORD_TOKEN=your_discord_bot_token_here
GUILD_ID=your_discord_server_id_here
SUPABASE_DB_URL=postgres://postgres:[PASSWORD]@[HOST]:5432/postgres
PORTAL_URL=https://your-portal-url.vercel.app
BOT_SECRET=same-secret-as-portal-deployment
# optional: restrict /report_match to these role IDs (comma-separated)
REPORT_ROLE_IDS=
```

### How to get the values:
- **DISCORD_TOKEN**: Go to [Discord Developer Portal](https://discord.com/developers/applications), select your App -> Bot -> Reset Token.
- **GUILD_ID**: In Discord settings -> Advanced -> Enable "Developer Mode". Right-click your server icon and select "Copy Server ID".
- **SUPABASE_DB_URL**: Go to your Supabase Project -> Project Settings -> Database -> Connection String -> URI (use the Transaction mode ideally).
- **BOT_SECRET**: Must match the `BOT_SECRET` env var on the portal deployment — it authenticates the bot against `/api/admin/maps/parse` and `/api/admin/maps/save` for `/report_match`.
- **REPORT_ROLE_IDS**: Optional. If set, only members holding at least one of these roles can run `/report_match`; if empty, anyone can (unknown players still block a save).

## Match Reporting (`/report_match`)
Reports a full series for a scheduled match straight from Discord, using the same parse/save API as the admin panel:
- `match` — autocompletes non-completed matches of the active season.
- `map1`..`map5` — one tracker.gg link (or raw match ID) per map, in order. BO1 needs 1 map, BO3 2–3, BO5 3–5 (validated against the match's format).
- Map forfeit: pass `ff:<team tag>` (or `ff:1` / `ff:2`) instead of a link — the named team wins that map 13-0.
- Full match forfeit: use the `forfeit` option with the winning team's tag/name and leave the map fields empty (match saved 13-0, maps wiped, `is_forfeit` set — same as the admin panel).
- `region` — Valorant API region for stat lookup (defaults to `eu`).

The bot fetches each map via HenrikDev through the portal, then shows a preview embed (players, agents, ACS/K/D/A, 🔁 sub markers) with **Confirm / Cancel** buttons. Saving is blocked — with the offending Riot IDs listed — if any player in the match data isn't registered in the database; the reporter is told to contact a moderator. On confirm, every map is saved through `/api/admin/maps/save` (match totals, winner and playoff bracket advance automatically) and the final result embed is posted in the same channel.

## Step 2: Install Dependencies
Open your terminal in the `Skipio-bot` folder and run:
```bash
pip install -r requirements.txt
```

## Step 3: Run the Bot
```bash
python main.py
```

## Project Structure
- `main.py`: The entry point for starting the bot.
- `cogs/`: Contains command categories (Analytics, Matches, AI, Lifecycle).
- `utils/`: Helper functions for charts, autocomplete, and general logic.
- `ui/`: Discord UI components like buttons and embeds.
- `database.py`: Database connection management.
- `config.py`: Environment variable configuration.

## Troubleshooting
- **ModuleNotFoundError**: Ensure you ran `pip install -r requirements.txt`.
- **IndexError: tuple index out of range**: Check your parameters in database queries (Modulo operators must be escaped as `%%`).
- **Command errors**: If slash commands don't show up, wait a few minutes or re-invite the bot with the `applications.commands` scope.
