import discord
from discord.ext import commands
from discord import app_commands
from database import get_conn, get_default_season
from utils.helpers import run_in_executor
from utils.autocomplete import match_autocomplete, team_autocomplete
from ui.embeds import get_match_overview_embed
from ui.views import MatchFlowView
from utils.charts import generate_team_map_chart

# Design tokens
V_RED    = 0xFF4655
V_TEAL   = 0x24FFAB
V_GOLD   = 0xFFB800
V_BLUE   = 0x3FD1FF
V_PURPLE = 0xB47FFF


class MatchesCog(commands.Cog):
    def __init__(self, bot):
        self.bot = bot

    @app_commands.command(name="match_flow", description="Explore a match — Overview, Economy, Performance & Rounds")
    @app_commands.describe(match_id="Select a match (type a team name to search)")
    @app_commands.autocomplete(match_id=match_autocomplete)
    async def match_flow(self, interaction: discord.Interaction, match_id: str):
        await interaction.response.defer()
        try:
            mid = int(match_id)
            embed = await run_in_executor(get_match_overview_embed, mid)
            view = MatchFlowView(mid)
            await interaction.followup.send(embed=embed, view=view)
        except ValueError:
            await interaction.followup.send("❌ Invalid match ID.")
        except Exception as e:
            await interaction.followup.send(f"❌ Error: {str(e)}")

    @app_commands.command(name="map_analytics", description="View detailed map win-rate chart for a team")
    @app_commands.describe(team="Team name or tag", season="Season ID")
    @app_commands.autocomplete(team=team_autocomplete)
    async def map_analytics(self, interaction: discord.Interaction, team: str, season: str = None):
        await interaction.response.defer()
        if season is None: season = await run_in_executor(get_default_season)
        try:
            with get_conn() as conn:
                cursor = conn.cursor()
                cursor.execute(
                    "SELECT id, name FROM teams WHERE name ILIKE %s OR tag ILIKE %s LIMIT 1",
                    (team, team))
                row = cursor.fetchone()
                if not row:
                    return await interaction.followup.send(f"❌ Team `{team}` not found.")
                tid, tname = row

            file, embed = await run_in_executor(generate_team_map_chart, tid, season)
            if not file:
                return await interaction.followup.send(f"❌ No map data found for **{tname}** in season `{season}`.")
            await interaction.followup.send(file=file, embed=embed)
        except Exception as e:
            await interaction.followup.send(f"❌ Error: {str(e)}")

    @app_commands.command(name="meta_stats", description="View league-wide agent and map analytics")
    @app_commands.describe(season="Season ID")
    async def meta_stats(self, interaction: discord.Interaction, season: str = None):
        await interaction.response.defer()
        if season is None: season = await run_in_executor(get_default_season)
        try:
            with get_conn() as conn:
                cursor = conn.cursor()
                sf = "(m.season_id = %s OR (m.season_id IS NULL AND %s = 'S23'))" if season != 'all' else "1=1"
                params_s = (season, season) if season != 'all' else ()

                cursor.execute(f"""
                    SELECT agent, COUNT(*) as picks, AVG(acs) as avg_acs,
                           SUM(CASE WHEN msm.team_id = mm.winner_id THEN 1 ELSE 0 END)::float / COUNT(*) as wr
                    FROM match_stats_map msm
                    JOIN matches m ON msm.match_id = m.id
                    JOIN match_maps mm ON msm.match_id = mm.match_id AND msm.map_index = mm.map_index
                    WHERE m.status = 'completed' AND {sf}
                    GROUP BY agent ORDER BY picks DESC LIMIT 8
                """, params_s)
                agents = cursor.fetchall()

                cursor.execute(f"""
                    SELECT map_name, COUNT(*) as count,
                           AVG(team1_rounds + team2_rounds) as avg_rounds
                    FROM match_maps mm
                    JOIN matches m ON mm.match_id = m.id
                    WHERE m.status = 'completed' AND {sf}
                    GROUP BY map_name ORDER BY count DESC
                """, params_s)
                maps = cursor.fetchall()

            embed = discord.Embed(
                title=f"📊 Meta Analytics  ·  Season {season}",
                description="League-wide agent pick rates and map pool breakdown.",
                color=V_GOLD
            )

            if agents:
                agent_lines = []
                max_picks = agents[0][1] if agents else 1
                for a, p, acs, wr in agents:
                    wr_pct = round((wr or 0) * 100)
                    bar = "█" * round(p / max_picks * 10) + "░" * (10 - round(p / max_picks * 10))
                    wr_icon = "🟢" if wr_pct >= 50 else "🔴"
                    agent_lines.append(
                        f"**{a}** `{bar}` {p} picks\n"
                        f"  {wr_icon} WR `{wr_pct}%` · Avg ACS `{round(acs or 0)}`"
                    )
                embed.add_field(name="🎭 Agent Pick Rates", value="\n".join(agent_lines), inline=False)

            if maps:
                map_lines = []
                for mn, c, avg_r in maps:
                    map_lines.append(
                        f"🗺️ **{mn}** · `{c}` matches · Avg `{round(avg_r or 0, 1)}` rounds"
                    )
                embed.add_field(name="🗺️ Map Pool", value="\n".join(map_lines), inline=False)

            await interaction.followup.send(embed=embed)
        except Exception as e:
            await interaction.followup.send(f"❌ Error: {str(e)}")

    @app_commands.command(name="match_result", description="View quick scoreboard for a match")
    @app_commands.describe(match_id="The numeric Match ID")
    async def match_result(self, interaction: discord.Interaction, match_id: int):
        await interaction.response.defer()
        try:
            with get_conn() as conn:
                cursor = conn.cursor()
                cursor.execute("""
                    SELECT m.id, m.week, m.group_name, t1.name, t2.name,
                           m.score_t1, m.score_t2, m.status, m.season_id, m.winner_id,
                           t1.id, t2.id
                    FROM matches m
                    JOIN teams t1 ON m.team1_id = t1.id
                    JOIN teams t2 ON m.team2_id = t2.id
                    WHERE m.id = %s
                """, (match_id,))
                m = cursor.fetchone()
                if not m:
                    return await interaction.followup.send(f"❌ Match `#{match_id}` not found.")
                mid, wk, grp, t1n, t2n, s1, s2, status, sid, wid, t1id, t2id = m

                cursor.execute("""
                    SELECT p.name, msm.agent, msm.acs, msm.kills, msm.deaths,
                           msm.assists, msm.adr, msm.hs_pct, t.tag
                    FROM match_stats_map msm
                    JOIN players p ON msm.player_id = p.id
                    JOIN teams t ON msm.team_id = t.id
                    WHERE msm.match_id = %s
                    ORDER BY msm.acs DESC LIMIT 5
                """, (match_id,))
                perf = cursor.fetchall()

            winner = t1n if wid == t1id else (t2n if wid == t2id else "—")
            total = (s1 or 0) + (s2 or 0)
            bar_w = round((s1 or 0) / max(total, 1) * 20)
            score_bar = f"{'▰'*bar_w}{'▱'*(20-bar_w)}"

            embed = discord.Embed(
                title=f"🎮 Match Result  ·  #{mid}",
                description=(
                    f"### {t1n}  `{s1 or 0}` — `{s2 or 0}`  {t2n}\n"
                    f"```{score_bar}```\n"
                    f"🏆 **Winner:** {winner}  ·  Season `{sid or 'S23'}`  ·  Week **{wk}**  ·  Group **{grp}**"
                ),
                color=V_TEAL if wid else V_BLUE
            )

            if perf:
                lines = []
                for i, (n, ag, acs, k, d, ast, adr, hs, tag) in enumerate(perf):
                    medal = ["🥇","🥈","🥉"][i] if i < 3 else f"`{i+1}.`"
                    kd = k / max(d, 1)
                    lines.append(
                        f"{medal} **{n}** ({ag}) · `{tag}`\n"
                        f"  `{int(acs or 0)} ACS` · `{k}/{d}/{ast}` · KD `{kd:.2f}` · ADR `{round(adr or 0)}`"
                    )
                embed.add_field(name="⭐ Top Performers", value="\n".join(lines), inline=False)

            embed.set_footer(text=f"Use /match_flow #{mid} for full breakdown with Economy chart")
            await interaction.followup.send(embed=embed)
        except Exception as e:
            await interaction.followup.send(f"❌ Error: {str(e)}")


async def setup(bot):
    await bot.add_cog(MatchesCog(bot))
