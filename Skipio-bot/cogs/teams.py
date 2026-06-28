import logging
import discord
from discord.ext import commands
from discord import app_commands
from database import get_conn, get_default_season
from utils.helpers import run_in_executor
from utils.autocomplete import team_autocomplete, season_autocomplete
from utils.formatting import rank_icon, pct_bar
from utils.design import C_BLUE, C_GOLD

logger = logging.getLogger(__name__)


class TeamsCog(commands.Cog):
    def __init__(self, bot):
        self.bot = bot

    # ── /team_info ────────────────────────────────────────────────────────────
    @app_commands.command(name="team_info", description="Look up team stats and roster")
    @app_commands.describe(name="Team name or tag", season="Season ID")
    @app_commands.autocomplete(name=team_autocomplete, season=season_autocomplete)
    async def team_info(self, interaction: discord.Interaction, name: str, season: str = None):
        await interaction.response.defer()
        if season is None:
            season = await run_in_executor(get_default_season)
        try:
            with get_conn() as conn:
                cursor = conn.cursor()
                cursor.execute(
                    "SELECT id, name, tag, group_name FROM teams WHERE name ILIKE %s OR tag ILIKE %s LIMIT 1",
                    (name, name)
                )
                row = cursor.fetchone()
                if not row:
                    return await interaction.followup.send(f"❌ Team `{name}` not found.")
                tid, tname, ttag, tgroup = row

                if season == 'all':
                    cursor.execute(
                        "SELECT name, riot_id, uuid, rank FROM players WHERE default_team_id = %s",
                        (tid,)
                    )
                else:
                    cursor.execute(
                        "SELECT p.name, p.riot_id, p.uuid, p.rank "
                        "FROM player_team_history pth JOIN players p ON pth.player_id = p.id "
                        "WHERE pth.team_id = %s AND pth.season_id = %s",
                        (tid, season)
                    )
                roster = cursor.fetchall()
                if not roster and season != 'all':
                    cursor.execute(
                        "SELECT name, riot_id, uuid, rank FROM players WHERE default_team_id = %s",
                        (tid,)
                    )
                    roster = cursor.fetchall()

                sf = "(m.season_id = %s OR (m.season_id IS NULL AND %s = 'S23'))" if season != 'all' else "1=1"
                sp = (season, season) if season != 'all' else ()

                cursor.execute(f"""
                    SELECT COUNT(*), SUM(CASE WHEN m.winner_id = %s THEN 1 ELSE 0 END)
                    FROM matches m
                    WHERE (m.team1_id = %s OR m.team2_id = %s) AND m.status = 'completed' AND {sf}
                """, (tid, tid, tid, *sp))
                played_row = cursor.fetchone()
                total_m, won_m = (played_row[0] or 0), (played_row[1] or 0)

                cursor.execute(f"""
                    SELECT mm.map_name, COUNT(*) as p,
                           SUM(CASE WHEN m.winner_id = %s THEN 1 ELSE 0 END) as w
                    FROM match_maps mm JOIN matches m ON mm.match_id = m.id
                    WHERE (m.team1_id = %s OR m.team2_id = %s) AND m.status = 'completed' AND {sf}
                    GROUP BY mm.map_name ORDER BY p DESC
                """, (tid, tid, tid, *sp))
                maps_data = cursor.fetchall()

                cursor.execute(f"""
                    SELECT AVG(msm.acs), AVG(msm.kills::float/NULLIF(msm.deaths, 0)),
                           AVG(msm.adr), AVG(msm.kast)
                    FROM match_stats_map msm JOIN matches m ON msm.match_id = m.id
                    WHERE msm.team_id = %s AND m.status = 'completed' AND {sf}
                """, (tid, *sp))
                team_stats = cursor.fetchone()

                cursor.execute(f"""
                    SELECT m.week, t1.tag, t2.tag, m.score_t1, m.score_t2, m.winner_id, m.id
                    FROM matches m
                    JOIN teams t1 ON m.team1_id = t1.id
                    JOIN teams t2 ON m.team2_id = t2.id
                    WHERE (m.team1_id = %s OR m.team2_id = %s) AND m.status = 'completed' AND {sf}
                    ORDER BY m.id DESC LIMIT 5
                """, (tid, tid, *sp))
                recent = cursor.fetchall()

            wr = round(won_m / max(total_m, 1) * 100)
            t_acs, t_kd, t_adr, t_kast = [(v or 0) for v in (team_stats or (0, 0, 0, 0))]

            embed = discord.Embed(
                title=f"🛡️ {tname}",
                description=(
                    f"**Tag:** `{ttag}` · **Group:** `{tgroup}`\n"
                    f"Season **{season}** · Record: `{won_m}W – {total_m - won_m}L`\n"
                    f"Win Rate: **{wr}%** `{pct_bar(wr)}`"
                ),
                color=C_BLUE
            )
            if roster:
                roster_lines = []
                for rname, riot_id, ruuid, rrank in roster:
                    mention = f"<@{ruuid}>" if ruuid else f"**{rname}**"
                    roster_lines.append(f"{rank_icon(rrank)} {mention} `{riot_id or rname}`")
                embed.add_field(name="👥 Roster", value="\n".join(roster_lines), inline=False)

            embed.add_field(
                name="⚔️ Team Averages",
                value=f"ACS `{round(t_acs)}` · K/D `{round(t_kd, 2)}` · ADR `{round(t_adr)}` · KAST `{round(t_kast, 1)}%`",
                inline=False
            )
            if maps_data:
                map_lines = []
                for mn, p, w in maps_data:
                    map_wr = round(w / max(p, 1) * 100)
                    color = "🟢" if map_wr >= 50 else "🔴"
                    map_lines.append(f"{color} **{mn}**: `{map_wr}%` `{pct_bar(map_wr)}` `{w}-{p - w}`")
                embed.add_field(name="🗺️ Map Pool", value="\n".join(map_lines), inline=False)

            if recent:
                form_lines = []
                for wk, t1, t2, s1, s2, wid, mid in recent:
                    won = wid == tid
                    opp = t2 if t1 == ttag else t1
                    form_lines.append(
                        f"{'🟢 W' if won else '🔴 L'} W{wk}: vs `{opp}` `{s1}-{s2}` · Match `#{mid}`"
                    )
                embed.add_field(name="🕹️ Recent Form", value="\n".join(form_lines), inline=False)

            embed.set_footer(text="Use /map_analytics for full map charts")
            await interaction.followup.send(embed=embed)
        except Exception as e:
            logger.exception("team_info failed for %s", name)
            await interaction.followup.send(f"❌ Error: {e}")

    # ── /compare_teams ────────────────────────────────────────────────────────
    @app_commands.command(name="compare_teams", description="Head-to-head team comparison")
    @app_commands.autocomplete(team1=team_autocomplete, team2=team_autocomplete)
    async def compare_teams(self, interaction: discord.Interaction,
                            team1: str, team2: str, season: str = None):
        await interaction.response.defer()
        if season is None:
            season = await run_in_executor(get_default_season)
        try:
            with get_conn() as conn:
                cursor = conn.cursor()
                t_data = []
                for n in [team1, team2]:
                    cursor.execute(
                        "SELECT id, name, tag FROM teams WHERE name ILIKE %s OR tag ILIKE %s LIMIT 1",
                        (n, n)
                    )
                    r = cursor.fetchone()
                    if not r:
                        return await interaction.followup.send(f"❌ Team `{n}` not found.")
                    t_data.append(r)

                sf = "(m.season_id = %s OR (m.season_id IS NULL AND %s = 'S23'))" if season != 'all' else "1=1"
                sp = (season, season) if season != 'all' else ()
                records = []
                for tid, _, _ in t_data:
                    cursor.execute(f"""
                        SELECT mm.map_name, COUNT(*),
                               SUM(CASE WHEN m.winner_id = %s THEN 1 ELSE 0 END)
                        FROM match_maps mm JOIN matches m ON mm.match_id = m.id
                        WHERE (m.team1_id = %s OR m.team2_id = %s) AND m.status = 'completed' AND {sf}
                        GROUP BY mm.map_name
                    """, (tid, tid, tid, *sp))
                    rows = cursor.fetchall()
                    records.append({"p": sum(r[1] for r in rows), "w": sum(r[2] for r in rows)})

                cursor.execute(f"""
                    SELECT m.score_t1, m.score_t2, m.team1_id, m.team2_id FROM matches m
                    WHERE ((m.team1_id = %s AND m.team2_id = %s) OR (m.team1_id = %s AND m.team2_id = %s))
                    AND m.status = 'completed' AND {sf}
                """, (t_data[0][0], t_data[1][0], t_data[1][0], t_data[0][0], *sp))
                h2h = cursor.fetchall()

            wr1 = round(records[0]['w'] / max(records[0]['p'], 1) * 100, 1)
            wr2 = round(records[1]['w'] / max(records[1]['p'], 1) * 100, 1)
            n1, n2 = t_data[0][1], t_data[1][1]

            def _tc(v1, v2, fmt="{:.1f}"):
                s1, s2 = fmt.format(v1), fmt.format(v2)
                if v1 > v2:
                    return f"**{s1}** ✅", s2
                if v2 > v1:
                    return s1, f"**{s2}** ✅"
                return s1, s2

            embed = discord.Embed(title=f"⚔️ Team Comparison  ·  Season {season}", color=C_GOLD)
            rows_d = [
                ("Maps Played", records[0]['p'], records[1]['p'], "{:.0f}"),
                ("Maps Won",    records[0]['w'], records[1]['w'], "{:.0f}"),
                ("Win Rate",    wr1,             wr2,             "{:.1f}"),
            ]
            metrics, c1v, c2v = [], [], []
            for label, v1, v2, fmt in rows_d:
                c1, c2 = _tc(float(v1), float(v2), fmt)
                metrics.append(f"`{label}`")
                c1v.append(c1)
                c2v.append(c2)

            embed.add_field(name="📊 Metric", value="\n".join(metrics), inline=True)
            embed.add_field(name=f"🛡️ {n1}", value="\n".join(c1v), inline=True)
            embed.add_field(name=f"🛡️ {n2}", value="\n".join(c2v), inline=True)

            if h2h:
                t1w = sum(
                    1 for s1, s2, id1, id2 in h2h
                    if (id1 == t_data[0][0] and s1 > s2) or (id2 == t_data[0][0] and s2 > s1)
                )
                embed.add_field(
                    name="🤜 Head to Head",
                    value=f"`{len(h2h)}` matches played\n**{n1}**: {t1w} wins · **{n2}**: {len(h2h) - t1w} wins",
                    inline=False
                )
            embed.set_footer(text="✅ = winner of that category")
            await interaction.followup.send(embed=embed)
        except Exception as e:
            logger.exception("compare_teams failed for %s vs %s", team1, team2)
            await interaction.followup.send(f"❌ Error: {e}")


async def setup(bot):
    await bot.add_cog(TeamsCog(bot))
