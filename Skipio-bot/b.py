import discord
from discord.ext import commands, tasks
from discord import app_commands
import os
import asyncio
import functools
import psycopg2
from psycopg2 import pool
from dotenv import load_dotenv
import requests
import re
import pandas as pd
from datetime import datetime
import matplotlib.pyplot as plt
import seaborn as sns
import io

# Load environment variables
load_dotenv()

# --- CONFIGURATION ---
DISCORD_TOKEN = os.getenv("DISCORD_TOKEN")
GUILD_ID = os.getenv("GUILD_ID", None) 
if GUILD_ID:
    GUILD_ID = int(GUILD_ID)

DB_URL = os.getenv("SUPABASE_DB_URL") or os.getenv("DB_CONNECTION_STRING")
PORTAL_URL = os.getenv("PORTAL_URL", "https://valorant-portal.vercel.app")

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

def get_default_season():
    try:
        with get_conn() as conn:
            if not conn: return "S24"
            cursor = conn.cursor()
            cursor.execute("SELECT id FROM seasons WHERE is_active = true ORDER BY id DESC LIMIT 1")
            row = cursor.fetchone()
            return row[0] if row else "S24"
    except:
        return "S24"

def get_seasons():
    try:
        with get_conn() as conn:
            if not conn: return [("S24", "Season 24"), ("S23", "Season 23")]
            cursor = conn.cursor()
            cursor.execute("SELECT id, name FROM seasons ORDER BY id DESC")
            return cursor.fetchall()
    except:
        return [("S24", "Season 24"), ("S23", "Season 23")]

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
@app_commands.describe(group="Group name (e.g. A, B, C)", season="Season ID (e.g. S23, S24, all)")
async def standings(interaction: discord.Interaction, group: str, season: str = None):
    try:
        await interaction.response.defer()
    except:
        return

    if season is None:
        season = await run_in_executor(get_default_season)

    try:
        print(f"InfoBot: Standings command started for group {group}")
        with get_conn() as conn:
            if not conn: 
                print("InfoBot: get_conn() returned None")
                return await interaction.followup.send("❌ DB Connection Error.")
            print("InfoBot: Got connection from get_conn()")
            
            season_filter = "(m.season_id = %s OR (m.season_id IS NULL AND %s = 'S23'))" if season != 'all' else "1=1"

            query = f"""
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
                WHERE m.status = 'completed' AND m.match_type = 'regular' AND {season_filter}
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
                WHERE m.status = 'completed' AND m.match_type = 'regular' AND {season_filter}
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
            print(f"InfoBot: Executing standings query for group {group} season {season}")
            if season != 'all':
                cursor.execute(query, (season, season, season, season, group))
            else:
                cursor.execute(query, (group,))
            print("InfoBot: Query executed, fetching results")
            rows = cursor.fetchall()
            print(f"InfoBot: Rows fetched: {len(rows)}")
            
            if not rows:
                print(f"InfoBot: No rows found for group {group} season {season}")
                return await interaction.followup.send(f"❌ No data for group `{group}` in season `{season}`.")
            
            msg = f"🏆 **Group {group.upper()} Standings ({season})**\n```\nRank  Team                         P  W  L  Pts  PD\n"
            for i, (name, tag, played, wins, losses, points, pd_val) in enumerate(rows, start=1):
                msg += f"{i:>2}    {name[:26]:<26}  {played or 0:>2} {wins or 0:>2} {losses or 0:>2} {points or 0:>3} {pd_val or 0:>3}\n"
            msg += "```"
            await interaction.followup.send(msg)
            
    except Exception as e:
        print(f"InfoBot: Standings Command Error - {e}")
        await interaction.followup.send(f"❌ Error: {str(e)}")

@bot.tree.command(name="leaderboard", description="Show top players by ACS")
@app_commands.describe(min_games="Minimum matches played", season="Season ID (e.g. S23, S24, all)")
async def leaderboard(interaction: discord.Interaction, min_games: int = 0, season: str = None):
    await interaction.response.defer()
    if season is None:
        season = await run_in_executor(get_default_season)

    try:
        with get_conn() as conn:
            if not conn: return await interaction.followup.send("❌ DB Error.")
            cursor = conn.cursor()

            season_filter = "(m.season_id = %s OR (m.season_id IS NULL AND %s = 'S23'))" if season != 'all' else "1=1"

            cursor.execute(f"""
                SELECT p.name, p.riot_id, p.uuid, t.tag as team, COUNT(DISTINCT msm.match_id) as games, AVG(msm.acs) as avg_acs, SUM(msm.kills) as total_kills, SUM(msm.deaths) as total_deaths
                FROM match_stats_map msm
                JOIN matches m ON msm.match_id = m.id
                JOIN players p ON msm.player_id = p.id
                LEFT JOIN teams t ON p.default_team_id = t.id
                WHERE m.status = 'completed' AND {season_filter}
                GROUP BY p.id, p.name, p.riot_id, p.uuid, t.tag
                HAVING COUNT(DISTINCT msm.match_id) >= %s
                ORDER BY avg_acs DESC LIMIT 10
            """, (season, season, min_games) if season != 'all' else (min_games,))
            rows = cursor.fetchall()
            if not rows: return await interaction.followup.send(f"No data found for season `{season}`.")
            embed = discord.Embed(title=f"🏆 Leaderboard ({season})", color=discord.Color.blue())
            for i, (name, rid, uuid, team, games, acs, k, d) in enumerate(rows, start=1):
                kd = k / d if d > 0 else k
                display_name = f"<@{uuid}>" if uuid else name
                embed.add_field(name=f"#{i} {name}", value=f"User: {display_name} | Riot Id: `{rid}` \nTeam: `{team or 'FA'}` | Games: `{games}` | ACS: `{round(acs, 1)}` | KD: `{round(kd, 2)}`", inline=False)
            await interaction.followup.send(embed=embed)
    except Exception as e:
        print(f"InfoBot: Leaderboard Command Error - {e}")
        await interaction.followup.send(f"❌ Error: {str(e)}")

@bot.tree.command(name="player_info", description="Look up detailed player stats")
@app_commands.describe(name="Player name, Riot ID, or @mention", season="Season ID (e.g. S23, S24, all)")
async def player_info(interaction: discord.Interaction, name: str, season: str = None):
    await interaction.response.defer()
    if season is None:
        season = await run_in_executor(get_default_season)
    try:
        # Check if input is a mention <@123...>
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

            season_filter = "(m.season_id = %s OR (m.season_id IS NULL AND %s = 'S23'))" if season != 'all' else "1=1"

            cursor.execute(f"SELECT COUNT(*), AVG(acs), SUM(kills), SUM(deaths), SUM(assists), AVG(adr), AVG(kast), AVG(hs_pct) FROM match_stats_map msm JOIN matches m ON msm.match_id = m.id WHERE msm.player_id = %s AND m.status = 'completed' AND {season_filter}", (pid, season, season) if season != 'all' else (pid,))
            agg = cursor.fetchone()
            maps, acs, k, d, a, adr, kast, hs = agg[0] or 0, agg[1] or 0, agg[2] or 0, agg[3] or 0, agg[4] or 0, agg[5] or 0, agg[6] or 0, agg[7] or 0

            cursor.execute(f"SELECT agent, COUNT(*) as c, AVG(acs) FROM match_stats_map msm JOIN matches m ON msm.match_id = m.id WHERE msm.player_id = %s AND m.status = 'completed' AND {season_filter} GROUP BY agent ORDER BY c DESC LIMIT 3", (pid, season, season) if season != 'all' else (pid,))
            agents = cursor.fetchall()

            cursor.execute(f"SELECT m.week, t1.tag, t2.tag, msm.acs, msm.kills, msm.deaths FROM match_stats_map msm JOIN matches m ON msm.match_id = m.id JOIN teams t1 ON m.team1_id = t1.id JOIN teams t2 ON m.team2_id = t2.id WHERE msm.player_id = %s AND m.status = 'completed' AND {season_filter} ORDER BY m.id DESC LIMIT 3", (pid, season, season) if season != 'all' else (pid,))
            history = cursor.fetchall()
            
            embed = discord.Embed(title=f"👤 {pname} ({season})", color=discord.Color.green())
            desc = f"**Team:** {tname} [{ttag}]" if tname else "*Free Agent*"
            if puuid: desc += f"\n**User:** <@{puuid}>"
            embed.description = desc
            embed.add_field(name="Riot ID", value=f"`{rid or 'N/A'}`", inline=True)
            embed.add_field(name="Rank", value=f"`{prank or 'Unranked'}`", inline=True)
            embed.add_field(name="Maps", value=f"`{maps}`", inline=True)
            embed.add_field(name="📊 Stats", value=f"ACS: `{round(acs, 1)}` | K/D: `{round(k/(d if d>0 else 1), 2)}` | AST: `{a}` \nADR: `{round(adr, 1)}` | KAST: `{round(kast, 1)}%` | HS: `{round(hs, 1)}%`", inline=False)
            if agents:
                embed.add_field(name="🎭 Top Agents", value="\n".join([f"• {an}: {c} maps ({round(aa)} ACS)" for an, c, aa in agents]), inline=True)
            if history:
                embed.add_field(name="🎮 Recent", value="\n".join([f"W{w}: {t1} v {t2} | **{ha}** ACS ({hk}/{hd})" for w, t1, t2, ha, hk, hd in history]), inline=False)
            await interaction.followup.send(embed=embed)
    except Exception as e:
        print(f"InfoBot: Player Info Command Error - {e}")
        await interaction.followup.send(f"❌ Error: {str(e)}")

@bot.tree.command(name="team_info", description="Look up team stats and roster")
@app_commands.describe(name="Team name or tag", season="Season ID (e.g. S23, S24, all)")
async def team_info(interaction: discord.Interaction, name: str, season: str = None):
    await interaction.response.defer()
    if season is None:
        season = await run_in_executor(get_default_season)
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

            season_filter = "(m.season_id = %s OR (m.season_id IS NULL AND %s = 'S23'))" if season != 'all' else "1=1"

            cursor.execute(f"""
                SELECT mm.map_name, COUNT(*), SUM(CASE WHEN m.winner_id = %s THEN 1 ELSE 0 END) 
                FROM match_maps mm
                JOIN matches m ON mm.match_id = m.id
                WHERE (m.team1_id = %s OR m.team2_id = %s) AND {season_filter} AND m.status = 'completed'
                GROUP BY mm.map_name ORDER BY 2 DESC
            """, (tid, tid, tid, season, season) if season != 'all' else (tid, tid, tid))
            maps = cursor.fetchall()

            cursor.execute(f"SELECT m.week, t1.tag, t2.tag, m.score_t1, m.score_t2, m.winner_id FROM matches m JOIN teams t1 ON m.team1_id = t1.id JOIN teams t2 ON m.team2_id = t2.id WHERE (m.team1_id = %s OR m.team2_id = %s) AND m.status = 'completed' AND {season_filter} ORDER BY m.id DESC LIMIT 3", (tid, tid, season, season) if season != 'all' else (tid, tid))
            history = cursor.fetchall()
            
            embed = discord.Embed(title=f"🛡️ {tname} ({season})", color=discord.Color.blue())
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

class ChartControls(discord.ui.View):
    def __init__(self, player_id, season, current_type="acs"):
        super().__init__(timeout=180)
        self.player_id = player_id
        self.season = season
        self.current_type = current_type

    async def update_chart(self, interaction: discord.Interaction):
        file, embed = await run_in_executor(generate_player_chart, self.player_id, self.season, self.current_type)
        await interaction.response.edit_message(attachments=[file], embed=embed, view=self)

    @discord.ui.button(label="ACS Trend", style=discord.ButtonStyle.primary)
    async def acs_button(self, interaction: discord.Interaction, button: discord.ui.Button):
        self.current_type = "acs"
        await self.update_chart(interaction)

    @discord.ui.button(label="KD Trend", style=discord.ButtonStyle.success)
    async def kd_button(self, interaction: discord.Interaction, button: discord.ui.Button):
        self.current_type = "kd"
        await self.update_chart(interaction)

    @discord.ui.button(label="ADR Trend", style=discord.ButtonStyle.secondary)
    async def adr_button(self, interaction: discord.Interaction, button: discord.ui.Button):
        self.current_type = "adr"
        await self.update_chart(interaction)

def generate_player_chart(player_id, season, chart_type="acs"):
    with get_conn() as conn:
        cursor = conn.cursor()
        season_filter = "(m.season_id = %s OR (m.season_id IS NULL AND %s = 'S23'))" if season != 'all' else "1=1"

        cursor.execute(f"""
            SELECT m.week, msm.acs, msm.kills, msm.deaths, msm.adr, p.name
            FROM match_stats_map msm
            JOIN matches m ON msm.match_id = m.id
            JOIN players p ON msm.player_id = p.id
            WHERE msm.player_id = %s AND m.status = 'completed' AND {season_filter}
            ORDER BY m.week ASC
        """, (player_id, season, season) if season != 'all' else (player_id,))

        data = cursor.fetchall()
        if not data: return None, None

        df = pd.DataFrame(data, columns=['week', 'acs', 'kills', 'deaths', 'adr', 'name'])
        player_name = df['name'].iloc[0]

        # Calculate KD if needed
        df['kd'] = df['kills'] / df['deaths'].replace(0, 1)

        plt.style.use('dark_background')
        fig, ax = plt.subplots(figsize=(10, 5))

        colors = {"acs": "#3FD1FF", "kd": "#FF4655", "adr": "#FFB800"}
        labels = {"acs": "Average Combat Score", "kd": "K/D Ratio", "adr": "Average Damage per Round"}

        sns.lineplot(data=df, x='week', y=chart_type, marker='o', color=colors[chart_type], linewidth=2.5, ax=ax)
        ax.fill_between(df['week'], df[chart_type], alpha=0.2, color=colors[chart_type])

        # League Average (Simulation)
        cursor.execute(f"SELECT AVG({chart_type}) FROM match_stats_map msm JOIN matches m ON msm.match_id = m.id WHERE m.status = 'completed' AND {season_filter}", (season, season) if season != 'all' else ())
        league_avg = cursor.fetchone()[0] or 0
        ax.axhline(league_avg, color='yellow', linestyle='--', alpha=0.5, label='League AVG')

        ax.set_title(f"{season} STATS — {player_name} — {chart_type.upper()} by Week", pad=20, fontweight='bold')
        ax.set_xlabel("Week")
        ax.set_ylabel(labels[chart_type])
        ax.grid(True, alpha=0.1)
        ax.legend()

        buf = io.BytesIO()
        plt.savefig(buf, format='png', bbox_inches='tight', dpi=100)
        buf.seek(0)
        plt.close(fig)

        file = discord.File(buf, filename="chart.png")
        embed = discord.Embed(title=f"📊 {player_name}'s {chart_type.upper()} Analysis", color=discord.Color.blue())
        embed.set_image(url="attachment://chart.png")
        return file, embed

@bot.tree.command(name="stats_chart", description="Generate interactive performance charts for a player")
@app_commands.describe(name="Player name or @mention", season="Season ID (e.g. S23, S24, all)")
async def stats_chart(interaction: discord.Interaction, name: str, season: str = None):
    await interaction.response.defer()
    if season is None:
        season = await run_in_executor(get_default_season)

    try:
        mention_match = re.match(r"^<@!?(\d+)>$", name.strip())
        with get_conn() as conn:
            cursor = conn.cursor()
            if mention_match:
                cursor.execute("SELECT id, name FROM players WHERE uuid = %s LIMIT 1", (mention_match.group(1),))
            else:
                cursor.execute("SELECT id, name FROM players WHERE name ILIKE %s OR riot_id ILIKE %s LIMIT 1", (name, name))

            row = cursor.fetchone()
            if not row: return await interaction.followup.send(f"❌ Player `{name}` not found.")
            pid, pname = row

            file, embed = await run_in_executor(generate_player_chart, pid, season, "acs")
            if not file:
                return await interaction.followup.send(f"❌ No match data found for {pname} in {season}.")

            view = ChartControls(pid, season)
            await interaction.followup.send(file=file, embed=embed, view=view)

    except Exception as e:
        print(f"InfoBot: Chart Command Error - {e}")
        await interaction.followup.send(f"❌ Error: {str(e)}")

class MapStatsView(discord.ui.View):
    def __init__(self, team_id, season):
        super().__init__(timeout=180)
        self.team_id = team_id
        self.season = season

    async def update_chart(self, interaction: discord.Interaction):
        file, embed = await run_in_executor(generate_team_map_chart, self.team_id, self.season)
        await interaction.response.edit_message(attachments=[file], embed=embed, view=self)

def generate_team_map_chart(team_id, season):
    with get_conn() as conn:
        cursor = conn.cursor()
        season_filter = "(m.season_id = %s OR (m.season_id IS NULL AND %s = 'S23'))" if season != 'all' else "1=1"

        cursor.execute(f"""
            SELECT mm.map_name, COUNT(*) as played, SUM(CASE WHEN m.winner_id = %s THEN 1 ELSE 0 END) as wins
            FROM match_maps mm
            JOIN matches m ON mm.match_id = m.id
            WHERE (m.team1_id = %s OR m.team2_id = %s) AND {season_filter} AND m.status = 'completed'
            GROUP BY mm.map_name
        """, (team_id, team_id, team_id, season, season) if season != 'all' else (team_id, team_id, team_id))

        data = cursor.fetchall()
        if not data: return None, None

        df = pd.DataFrame(data, columns=['map', 'played', 'wins'])
        df['losses'] = df['played'] - df['wins']
        df['win_rate'] = (df['wins'] / df['played'] * 100).round(1)

        cursor.execute("SELECT name FROM teams WHERE id = %s", (team_id,))
        team_name = cursor.fetchone()[0]

        plt.style.use('dark_background')
        fig, ax = plt.subplots(figsize=(10, 6))

        df_melted = df.melt(id_vars='map', value_vars=['wins', 'losses'], var_name='result', value_name='count')
        sns.barplot(data=df_melted, y='map', x='count', hue='result', palette={'wins': '#3FD1FF', 'losses': '#FF4655'}, ax=ax)

        ax.set_title(f"{season} MAP PERFORMANCE — {team_name}", pad=20, fontweight='bold')
        ax.set_xlabel("Match Count")
        ax.set_ylabel("Map")
        ax.grid(True, axis='x', alpha=0.1)

        buf = io.BytesIO()
        plt.savefig(buf, format='png', bbox_inches='tight', dpi=100)
        buf.seek(0)
        plt.close(fig)

        file = discord.File(buf, filename="map_chart.png")
        embed = discord.Embed(title=f"🗺️ {team_name}'s Map Statistics", color=discord.Color.blue())
        embed.set_image(url="attachment://map_chart.png")
        return file, embed

@bot.tree.command(name="map_analytics", description="View detailed map win rates for a team")
@app_commands.describe(team="Team name or tag", season="Season ID (e.g. S23, S24, all)")
async def map_analytics(interaction: discord.Interaction, team: str, season: str = None):
    await interaction.response.defer()
    if season is None:
        season = await run_in_executor(get_default_season)

    try:
        with get_conn() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT id, name FROM teams WHERE name ILIKE %s OR tag ILIKE %s LIMIT 1", (team, team))
            row = cursor.fetchone()
            if not row: return await interaction.followup.send(f"❌ Team `{team}` not found.")
            tid, tname = row

            file, embed = await run_in_executor(generate_team_map_chart, tid, season)
            if not file:
                return await interaction.followup.send(f"❌ No map data found for {tname} in {season}.")

            await interaction.followup.send(file=file, embed=embed)

    except Exception as e:
        print(f"InfoBot: Map Analytics Error - {e}")
        await interaction.followup.send(f"❌ Error: {str(e)}")

@bot.tree.command(name="ask_ai", description="Ask the AI Analyst a question about the tournament")
@app_commands.describe(question="Your question about the league", season="Season ID (e.g. S23, S24, all)")
async def ask_ai(interaction: discord.Interaction, question: str, season: str = None):
    await interaction.response.defer()
    if season is None:
        season = await run_in_executor(get_default_season)
    try:
        payload = {
            "message": question,
            "history": [],
            "seasonId": season
        }
        headers = {"Content-Type": "application/json"}
        api_url = f"{PORTAL_URL}/api/chat"
        print(f"InfoBot: Calling AI API at {api_url}")
        
        response = requests.post(api_url, json=payload, headers=headers, timeout=30)
        
        if response.status_code == 200:
            data = response.json()
            # Most streaming APIs for chat return a structure that might need parsing, 
            # but assuming the portal's /api/chat returns a full response for bot.
            ai_message = data.get("reply", "I am currently processing that information.")
            if len(ai_message) > 1900:
                ai_message = ai_message[:1900] + "..."
            
            embed = discord.Embed(
                title="🤖 AI Tournament Analyst", 
                description=ai_message,
                color=discord.Color.red()
            )
            embed.set_footer(text=f"Requested by {interaction.user.name}")
            await interaction.followup.send(embed=embed)
        else:
            await interaction.followup.send(f"❌ AI API returned error: {response.status_code}")
            
    except Exception as e:
        print(f"InfoBot: Ask AI Error - {e}")
        await interaction.followup.send(f"❌ Error connecting to AI Analyst: {str(e)}")

if __name__ == "__main__":
    bot.run(DISCORD_TOKEN)
