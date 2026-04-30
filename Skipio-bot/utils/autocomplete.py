import discord
from discord import app_commands
from typing import List
from database import get_conn
from .helpers import run_in_executor

def _fetch_team_choices(query: str) -> List[app_commands.Choice[str]]:
    try:
        with get_conn() as conn:
            cursor = conn.cursor()
            q = f"%{query}%"
            cursor.execute("SELECT name, tag FROM teams WHERE name ILIKE %s OR tag ILIKE %s ORDER BY name LIMIT 25", (q, q))
            teams = cursor.fetchall()
            return [app_commands.Choice(name=f"{name} ({tag})", value=name) for name, tag in teams]
    except:
        return []

def _fetch_player_choices(query: str) -> List[app_commands.Choice[str]]:
    try:
        with get_conn() as conn:
            cursor = conn.cursor()
            q = f"%{query}%"
            cursor.execute("SELECT name, riot_id FROM players WHERE name ILIKE %s OR riot_id ILIKE %s ORDER BY name LIMIT 25", (q, q))
            players = cursor.fetchall()
            return [app_commands.Choice(name=f"{name} ({riot_id})", value=name) for name, riot_id in players]
    except:
        return []

def _fetch_match_choices(query: str) -> List[app_commands.Choice[str]]:
    try:
        with get_conn() as conn:
            cursor = conn.cursor()
            q = f"%{query}%"
            cursor.execute("""
                SELECT m.id, t1.tag, t2.tag, m.week, m.season_id 
                FROM matches m 
                JOIN teams t1 ON m.team1_id = t1.id 
                JOIN teams t2 ON m.team2_id = t2.id 
                WHERE t1.tag ILIKE %s OR t2.tag ILIKE %s OR t1.name ILIKE %s OR t2.name ILIKE %s
                ORDER BY m.id DESC LIMIT 25
            """, (q, q, q, q))
            matches = cursor.fetchall()
            return [app_commands.Choice(name=f"Match #{m_id}: {t1_tag} vs {t2_tag} (W{week} {sid})", value=str(m_id)) for m_id, t1_tag, t2_tag, week, sid in matches]
    except Exception as e:
        print(f"Error fetching match choices: {e}")
        return []

def _fetch_rank_choices(query: str) -> List[app_commands.Choice[str]]:
    ranks = [
        "Radiant", "Immortal 3/Radiant", "Immortal 1/2", "Ascendant", 
        "Diamond", "Platinum", "Gold", "Silver", "Iron/Bronze"
    ]
    if query:
        filtered = [r for r in ranks if query.lower() in r.lower()]
    else:
        filtered = ranks
    return [app_commands.Choice(name=r, value=r) for r in filtered[:25]]

async def team_autocomplete(interaction: discord.Interaction, current: str) -> List[app_commands.Choice[str]]:
    return await run_in_executor(_fetch_team_choices, current)

async def player_autocomplete(interaction: discord.Interaction, current: str) -> List[app_commands.Choice[str]]:
    return await run_in_executor(_fetch_player_choices, current)

async def match_autocomplete(interaction: discord.Interaction, current: str) -> List[app_commands.Choice[str]]:
    return await run_in_executor(_fetch_match_choices, current)

async def rank_autocomplete(interaction: discord.Interaction, current: str) -> List[app_commands.Choice[str]]:
    return _fetch_rank_choices(current)

def _fetch_season_choices(query: str) -> List[app_commands.Choice[str]]:
    try:
        with get_conn() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT id, name FROM seasons ORDER BY id DESC")
            seasons = cursor.fetchall()
            options = [app_commands.Choice(name="All Time", value="all")]
            options.extend([app_commands.Choice(name=name, value=sid) for sid, name in seasons])
            if query:
                return [o for o in options if query.lower() in o.name.lower()][:25]
            return options[:25]
    except:
        return [app_commands.Choice(name="All Time", value="all")]

async def season_autocomplete(interaction: discord.Interaction, current: str) -> List[app_commands.Choice[str]]:
    return await run_in_executor(_fetch_season_choices, current)
