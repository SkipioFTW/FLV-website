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
```

### How to get the values:
- **DISCORD_TOKEN**: Go to [Discord Developer Portal](https://discord.com/developers/applications), select your App -> Bot -> Reset Token.
- **GUILD_ID**: In Discord settings -> Advanced -> Enable "Developer Mode". Right-click your server icon and select "Copy Server ID".
- **SUPABASE_DB_URL**: Go to your Supabase Project -> Project Settings -> Database -> Connection String -> URI (use the Transaction mode ideally).

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
