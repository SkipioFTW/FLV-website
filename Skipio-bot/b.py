import discord
from discord.ext import commands, tasks
from discord import app_commands
import os
import asyncio
import functools
import psycopg2
from psycopg2 import pool
from dotenv import load_dotenv
import pandas as pd

# Load environment variables
load_dotenv()

# --- CONFIGURATION ---
DISCORD_TOKEN = os.getenv("DISCORD_TOKEN")
GUILD_ID = os.getenv("GUILD_ID", None) 
if GUILD_ID:
    GUILD_ID = int(GUILD_ID)

DB_URL = os.getenv("SUPABASE_DB_URL") or os.getenv("DB_CONNECTION_STRING")

# --- DATABASE CONNECTION POOLING ---

class UnifiedCursorWrapper:
    def __init__(self, cur):
        self.cur = cur
    def execute(self, sql, params=None):
        return self.cur.execute(sql, params)
    def __getattr__(self, name):
        return getattr(self.cur, name)
    def __iter__(self):
        return iter(self.cur)
    def __enter__(self):
        return self
    def __exit__(self, exc_type, exc_val, exc_tb):
        if hasattr(self.cur, "close"):
            self.cur.close()

class UnifiedDBWrapper:
    def __init__(self, conn, close_callback=None):
        self.conn = conn
        self.close_callback = close_callback
    def cursor(self):
        return UnifiedCursorWrapper(self.conn.cursor())
    def commit(self):
        self.conn.commit()
    def close(self):
        if self.close_callback:
            self.close_callback()
        else:
            self.conn.close()
    def __getattr__(self, name):
        return getattr(self.conn, name)
    def __enter__(self):
        return self
    def __exit__(self, exc_type, exc_val, exc_tb):
        self.close()

# Global Connection Pool
pg_pool = None

def get_db_connection_pool():
    global pg_pool
    if pg_pool: return pg_pool
    if DB_URL:
        db_url_str = str(DB_URL).strip().strip('"').strip("'")
        try:
            params = db_url_str
            if "sslmode" not in db_url_str:
                params += "?sslmode=require" if "?" not in db_url_str else "&sslmode=require"
            pg_pool = psycopg2.pool.ThreadedConnectionPool(1, 10, params)
            print("InfoBot: Database connection pool created.")
            return pg_pool
        except Exception as e:
            print(f"InfoBot: Failed to create connection pool: {e}")
    return None

def get_conn():
    pool = get_db_connection_pool()
    if pool:
        for attempt in range(3): # Try up to 3 times to get a valid connection
            try:
                conn = pool.getconn()
                
                # Check 1: Is it marked closed locally?
                if conn.closed:
                    print(f"InfoBot: Discarding locally closed connection (Attempt {attempt+1})")
                    try: pool.putconn(conn, close=True)
                    except: pass
                    continue # Try again

                # Check 2: Server-side ping
                try:
                    with conn.cursor() as cur:
                        cur.execute("SELECT 1")
                except Exception as ping_err:
                    print(f"InfoBot: Connection ping failed: {ping_err} (Attempt {attempt+1})")
                    try: pool.putconn(conn, close=True)
                    except: pass
                    continue # Try again
                
                # If we get here, connection is good
                def return_to_pool():
                    try: pool.putconn(conn)
                    except: 
                        try: conn.close()
                        except: pass
                
                return UnifiedDBWrapper(conn, close_callback=return_to_pool)

            except Exception as e:
                print(f"InfoBot: Error getting connection from pool: {e}")
                # If pool is exhausted or other error, we might fall through to direct connect if configured,
                # or just return None.
    
    # Fallback to direct connection if pool failed or not available
    if DB_URL:
        try:
            print("InfoBot: Falling back to direct connection.")
            conn = psycopg2.connect(DB_URL, sslmode='require', connect_timeout=10)
            return UnifiedDBWrapper(conn)
        except Exception as e:
            print(f"InfoBot: Direct connection failed: {e}")
    return None

# --- ASYNC HELPERS ---

async def run_in_executor(func, *args):
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(None, functools.partial(func, *args))

@tasks.loop(seconds=60)
async def keep_alive():
    """Background task to keep the database connection pool warm."""
    try:
        with get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT 1")
    except:
        pass

# --- BOT SETUP ---

intents = discord.Intents.default()
intents.message_content = True

class MyBot(commands.Bot):
    def __init__(self):
        super().__init__(command_prefix="!", intents=intents)
    async def setup_hook(self):
        if GUILD_ID:
            guild = discord.Object(id=GUILD_ID)
            self.tree.copy_global_to(guild=guild)
            await self.tree.sync(guild=guild)
        else:
            await self.tree.sync()
        print("InfoBot: Commands synced.")

bot = MyBot()

@bot.event
async def on_ready():
    print(f"InfoBot logged in as {bot.user}")
    if not keep_alive.is_running():
        keep_alive.start()

# --- INFO COMMANDS ---

@bot.tree.command(name="standings", description="View current group standings")
async def standings(interaction: discord.Interaction, group: str):
    try:
        await interaction.response.defer()
    except:
        return

    try:
        print(f"InfoBot: Standings command started for group {group}")
        with get_conn() as conn:
            if not conn: 
                print("InfoBot: get_conn() returned None")
                return await interaction.followup.send("❌ DB Connection Error.")
            print("InfoBot: Got connection from get_conn()")
            
            query = """
            WITH team_matches AS (
                SELECT
                    m.team1_id as team_id,
                    CASE 
                        WHEN m.winner_id = m.team1_id THEN 1
                        WHEN m.winner_id = m.team2_id THEN 0
                        WHEN COALESCE(mm.team1_rounds, 0) > COALESCE(mm.team2_rounds, 0) THEN 1
                        ELSE 0
                    END as win,
                    CASE 
                        WHEN m.winner_id = m.team2_id THEN 1
                        WHEN m.winner_id = m.team1_id THEN 0
                        WHEN COALESCE(mm.team2_rounds, 0) > COALESCE(mm.team1_rounds, 0) THEN 1
                        ELSE 0
                    END as loss,
                    CASE
                        WHEN m.winner_id = m.team1_id THEN 15
                        WHEN m.winner_id = m.team2_id THEN 
                            CASE WHEN m.is_forfeit = 1 THEN 0 ELSE LEAST(COALESCE(mm.team1_rounds, 0), 12) END
                        WHEN COALESCE(mm.team1_rounds, 0) > COALESCE(mm.team2_rounds, 0) THEN 15
                        ELSE LEAST(COALESCE(mm.team1_rounds, 0), 12)
                    END as points,
                    CASE
                        WHEN m.winner_id = m.team2_id THEN 15
                        WHEN m.winner_id = m.team1_id THEN 
                            CASE WHEN m.is_forfeit = 1 THEN 0 ELSE LEAST(COALESCE(mm.team1_rounds, 0), 12) END
                        WHEN COALESCE(mm.team2_rounds, 0) > COALESCE(mm.team1_rounds, 0) THEN 15
                        ELSE LEAST(COALESCE(mm.team2_rounds, 0), 12)
                    END as points_against
                FROM public.matches m
                LEFT JOIN public.match_maps mm ON m.id = mm.match_id AND mm.map_index = 0
                WHERE m.status = 'completed' AND m.match_type = 'regular'
                UNION ALL
                SELECT
                    m.team2_id as team_id,
                    CASE 
                        WHEN m.winner_id = m.team2_id THEN 1
                        WHEN m.winner_id = m.team1_id THEN 0
                        WHEN COALESCE(mm.team2_rounds, 0) > COALESCE(mm.team1_rounds, 0) THEN 1
                        ELSE 0
                    END as win,
                    CASE 
                        WHEN m.winner_id = m.team1_id THEN 1
                        WHEN m.winner_id = m.team2_id THEN 0
                        WHEN COALESCE(mm.team1_rounds, 0) > COALESCE(mm.team2_rounds, 0) THEN 1
                        ELSE 0
                    END as loss,
                    CASE
                        WHEN m.winner_id = m.team2_id THEN 15
                        WHEN m.winner_id = m.team1_id THEN 
                            CASE WHEN m.is_forfeit = 1 THEN 0 ELSE LEAST(COALESCE(mm.team2_rounds, 0), 12) END
                        WHEN COALESCE(mm.team2_rounds, 0) > COALESCE(mm.team1_rounds, 0) THEN 15
                        ELSE LEAST(COALESCE(mm.team2_rounds, 0), 12)
                    END as points,
                    CASE
                        WHEN m.winner_id = m.team1_id THEN 15
                        WHEN m.winner_id = m.team2_id THEN 
                            CASE WHEN m.is_forfeit = 1 THEN 0 ELSE LEAST(COALESCE(mm.team1_rounds, 0), 12) END
                        WHEN COALESCE(mm.team1_rounds, 0) > COALESCE(mm.team2_rounds, 0) THEN 15
                        ELSE LEAST(COALESCE(mm.team1_rounds, 0), 12)
                    END as points_against
                FROM public.matches m
                LEFT JOIN public.match_maps mm ON m.id = mm.match_id AND mm.map_index = 0
                WHERE m.status = 'completed' AND m.match_type = 'regular'
            )
            SELECT t.name, t.tag, COUNT(tm.team_id) as played, SUM(tm.win) as wins, SUM(tm.loss) as losses, SUM(tm.points) as points, (SUM(tm.points) - SUM(tm.points_against)) as pd
            FROM public.teams t
            LEFT JOIN team_matches tm ON t.id = tm.team_id
            WHERE t.group_name ILIKE %s
            GROUP BY t.id, t.name, t.tag
            ORDER BY points DESC, pd DESC
            """
            print("InfoBot: Creating cursor")
            cursor = conn.cursor()
            print(f"InfoBot: Executing standings query for group {group}")
            cursor.execute(query, (group,))
            print("InfoBot: Query executed, fetching results")
            rows = cursor.fetchall()
            print(f"InfoBot: Rows fetched: {len(rows)}")
            
            if not rows:
                print(f"InfoBot: No rows found for group {group}")
                return await interaction.followup.send(f"❌ No data for group `{group}`.")
            
            msg = f"🏆 **Group {group.upper()} Standings**\n```\nRank  Team                         P  W  L  Pts  PD\n"
            for i, (name, tag, played, wins, losses, points, pd_val) in enumerate(rows, start=1):
                msg += f"{i:>2}    {name[:26]:<26}  {played or 0:>2} {wins or 0:>2} {losses or 0:>2} {points or 0:>3} {pd_val or 0:>3}\n"
            msg += "```"
            await interaction.followup.send(msg)
            
    except Exception as e:
        print(f"InfoBot: Standings Command Error - {e}")
        await interaction.followup.send(f"❌ Error: {str(e)}")

@bot.tree.command(name="leaderboard", description="Show top players by ACS")
async def leaderboard(interaction: discord.Interaction, min_games: int = 0):
    await interaction.response.defer()
    try:
        with get_conn() as conn:
            if not conn: return await interaction.followup.send("❌ DB Error.")
            cursor = conn.cursor()
            cursor.execute("""
                SELECT p.name, p.riot_id, p.uuid, t.tag as team, COUNT(DISTINCT msm.match_id) as games, AVG(msm.acs) as avg_acs, SUM(msm.kills) as total_kills, SUM(msm.deaths) as total_deaths
                FROM match_stats_map msm
                JOIN matches m ON msm.match_id = m.id
                JOIN players p ON msm.player_id = p.id
                LEFT JOIN teams t ON p.default_team_id = t.id
                WHERE m.status = 'completed'
                GROUP BY p.id, p.name, p.riot_id, p.uuid, t.tag
                HAVING COUNT(DISTINCT msm.match_id) >= %s
                ORDER BY avg_acs DESC LIMIT 10
            """, (min_games,))
            rows = cursor.fetchall()
            if not rows: return await interaction.followup.send("No data found.")
            embed = discord.Embed(title="🏆 Leaderboard (ACS)", color=discord.Color.blue())
            for i, (name, rid, uuid, team, games, acs, k, d) in enumerate(rows, start=1):
                kd = k / d if d > 0 else k
                display_name = f"<@{uuid}>" if uuid else name
                embed.add_field(name=f"#{i} {name}", value=f"User: {display_name} | Riot Id: `{rid}` \nTeam: `{team or 'FA'}` | Games: `{games}` | ACS: `{round(acs, 1)}` | KD: `{round(kd, 2)}`", inline=False)
            await interaction.followup.send(embed=embed)
    except Exception as e:
        print(f"InfoBot: Leaderboard Command Error - {e}")
        await interaction.followup.send(f"❌ Error: {str(e)}")

@bot.tree.command(name="player_info", description="Look up detailed player stats")
async def player_info(interaction: discord.Interaction, name: str):
    await interaction.response.defer()
    try:
        # Check if input is a mention <@123...>
        import re
        mention_match = re.match(r"^<@!?(\d+)>$", name.strip())
        
        with get_conn() as conn:
            if not conn: return await interaction.followup.send("❌ DB Error.")
            cursor = conn.cursor()
            
            if mention_match:
                uuid = mention_match.group(1)
                cursor.execute("SELECT p.id, p.name, p.riot_id, p.rank, p.uuid, t.name, t.tag FROM players p LEFT JOIN teams t ON p.default_team_id = t.id WHERE p.uuid = %s LIMIT 1", (uuid,))
            else:
                cursor.execute("SELECT p.id, p.name, p.riot_id, p.rank, p.uuid, t.name, t.tag FROM players p LEFT JOIN teams t ON p.default_team_id = t.id WHERE p.name ILIKE %s OR p.riot_id ILIKE %s LIMIT 1", (name, name))
            
            row = cursor.fetchone()
            if not row: return await interaction.followup.send(f"❌ Player `{name}` not found.")
            pid, pname, rid, prank, puuid, tname, ttag = row
            cursor.execute("SELECT COUNT(*), AVG(acs), SUM(kills), SUM(deaths), SUM(assists) FROM match_stats_map msm JOIN matches m ON msm.match_id = m.id WHERE msm.player_id = %s AND m.status = 'completed'", (pid,))
            agg = cursor.fetchone()
            maps, acs, k, d, a = agg[0] or 0, agg[1] or 0, agg[2] or 0, agg[3] or 0, agg[4] or 0
            cursor.execute("SELECT agent, COUNT(*) as c, AVG(acs) FROM match_stats_map msm JOIN matches m ON msm.match_id = m.id WHERE msm.player_id = %s AND m.status = 'completed' GROUP BY agent ORDER BY c DESC LIMIT 3", (pid,))
            agents = cursor.fetchall()
            cursor.execute("SELECT m.week, t1.tag, t2.tag, msm.acs, msm.kills, msm.deaths FROM match_stats_map msm JOIN matches m ON msm.match_id = m.id JOIN teams t1 ON m.team1_id = t1.id JOIN teams t2 ON m.team2_id = t2.id WHERE msm.player_id = %s AND m.status = 'completed' ORDER BY m.id DESC LIMIT 3", (pid,))
            history = cursor.fetchall()

            embed = discord.Embed(title=f"👤 {pname}", color=discord.Color.green())
            desc = f"**Team:** {tname} [{ttag}]" if tname else "*Free Agent*"
            if puuid: desc += f"\n**User:** <@{puuid}>"
            embed.description = desc
            embed.add_field(name="Riot ID", value=f"`{rid or 'N/A'}`", inline=True)
            embed.add_field(name="Rank", value=f"`{prank or 'Unranked'}`", inline=True)
            embed.add_field(name="Maps", value=f"`{maps}`", inline=True)
            embed.add_field(name="📊 Stats", value=f"ACS: `{round(acs, 1)}` | K/D: `{round(k/(d if d>0 else 1), 2)}` | AST: `{a}`", inline=False)
            if agents:
                embed.add_field(name="🎭 Top Agents", value="\n".join([f"• {an}: {c} maps ({round(aa)} ACS)" for an, c, aa in agents]), inline=True)
            if history:
                embed.add_field(name="🎮 Recent", value="\n".join([f"W{w}: {t1} v {t2} | **{ha}** ACS ({hk}/{hd})" for w, t1, t2, ha, hk, hd in history]), inline=False)
            await interaction.followup.send(embed=embed)
    except Exception as e:
        print(f"InfoBot: Player Info Command Error - {e}")
        await interaction.followup.send(f"❌ Error: {str(e)}")

@bot.tree.command(name="team_info", description="Look up team stats and roster")
async def team_info(interaction: discord.Interaction, name: str):
    await interaction.response.defer()
    try:
        with get_conn() as conn:
            if not conn: return await interaction.followup.send("❌ DB Error.")
            cursor = conn.cursor()
            cursor.execute("SELECT id, name, tag, group_name FROM teams WHERE name ILIKE %s OR tag ILIKE %s LIMIT 1", (name, name))
            row = cursor.fetchone()
            if not row: return await interaction.followup.send(f"❌ Team `{name}` not found.")
            tid, tname, ttag, tgroup = row
            cursor.execute("SELECT name, riot_id, uuid FROM players WHERE default_team_id = %s", (tid,))
            roster = cursor.fetchall()
            cursor.execute("SELECT map_name, COUNT(*), SUM(CASE WHEN winner_id = %s THEN 1 ELSE 0 END) FROM match_maps WHERE (match_id IN (SELECT id FROM matches WHERE team1_id = %s OR team2_id = %s)) GROUP BY map_name ORDER BY 2 DESC", (tid, tid, tid))
            maps = cursor.fetchall()
            cursor.execute("SELECT m.week, t1.tag, t2.tag, m.score_t1, m.score_t2, m.winner_id FROM matches m JOIN teams t1 ON m.team1_id = t1.id JOIN teams t2 ON m.team2_id = t2.id WHERE (m.team1_id = %s OR m.team2_id = %s) AND m.status = 'completed' ORDER BY m.id DESC LIMIT 3", (tid, tid))
            history = cursor.fetchall()

            embed = discord.Embed(title=f"🛡️ {tname}", color=discord.Color.blue())
            embed.description = f"**Tag:** `{ttag}` | **Group:** `{tgroup}`"
            if roster: 
                roster_str = []
                for p, r, u in roster:
                    p_disp = f"<@{u}>" if u else p
                    roster_str.append(f"• {p_disp} ({r})")
                embed.add_field(name="👥 Roster", value="\n".join(roster_str), inline=False)
            if maps: embed.add_field(name="🗺️ Maps", value="\n".join([f"• {mn}: {round((w/p*100) if p>0 else 0)}% ({w}-{p-w})" for mn, p, w in maps]), inline=True)
            if history: embed.add_field(name="🏁 Recent", value="\n".join([f"W{w}: {t1} {s1}-{s2} {t2} (**{'W' if wid==tid else 'L'}**)" for w, t1, t2, s1, s2, wid in history]), inline=False)
            await interaction.followup.send(embed=embed)
    except Exception as e:
        print(f"InfoBot: Team Info Command Error - {e}")
        await interaction.followup.send(f"❌ Error: {str(e)}")

if __name__ == "__main__":
    bot.run(DISCORD_TOKEN)
