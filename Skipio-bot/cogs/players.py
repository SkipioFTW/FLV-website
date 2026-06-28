import logging
import re
import discord
from discord.ext import commands
from discord import app_commands
from database import get_conn, get_default_season
from utils.helpers import run_in_executor, determine_archetype
from utils.autocomplete import player_autocomplete, season_autocomplete
from utils.formatting import rank_icon, pct_bar, fetch_discord_avatar
from utils.design import C_TEAL, C_PURPLE

logger = logging.getLogger(__name__)


def _resolve_player(cursor, name: str):
    """Look up a player by name/riot_id/@mention. Returns the DB row or None."""
    mention = re.match(r"^<@!?(\d+)>$", name.strip())
    if mention:
        cursor.execute(
            "SELECT p.id, p.name, p.riot_id, p.rank, p.uuid, t.name, t.tag "
            "FROM players p LEFT JOIN teams t ON p.default_team_id = t.id "
            "WHERE p.uuid = %s LIMIT 1",
            (mention.group(1),)
        )
    else:
        cursor.execute(
            "SELECT p.id, p.name, p.riot_id, p.rank, p.uuid, t.name, t.tag "
            "FROM players p LEFT JOIN teams t ON p.default_team_id = t.id "
            "WHERE p.name ILIKE %s OR p.riot_id ILIKE %s LIMIT 1",
            (name, name)
        )
    return cursor.fetchone()


class PlayersCog(commands.Cog):
    def __init__(self, bot):
        self.bot = bot

    # ── /player_info ─────────────────────────────────────────────────────────
    @app_commands.command(name="player_info", description="Look up detailed player stats")
    @app_commands.describe(name="Player name or @mention", season="Season ID")
    @app_commands.autocomplete(name=player_autocomplete, season=season_autocomplete)
    async def player_info(self, interaction: discord.Interaction, name: str, season: str = None):
        await interaction.response.defer()
        if season is None:
            season = await run_in_executor(get_default_season)
        try:
            with get_conn() as conn:
                cursor = conn.cursor()
                row = _resolve_player(cursor, name)
                if not row:
                    return await interaction.followup.send(f"❌ Player `{name}` not found.")
                pid, pname, rid, prank, puuid, tname, ttag = row

                if season != 'all':
                    cursor.execute(
                        "SELECT t.name, t.tag FROM player_team_history pth "
                        "JOIN teams t ON pth.team_id = t.id "
                        "WHERE pth.player_id = %s AND pth.season_id = %s",
                        (pid, season)
                    )
                    hist = cursor.fetchone()
                    if hist:
                        tname, ttag = hist

                sf = "(m.season_id = %s OR (m.season_id IS NULL AND %s = 'S23'))" if season != 'all' else "1=1"
                sp = (season, season) if season != 'all' else ()

                cursor.execute(f"""
                    SELECT COUNT(*), AVG(acs), SUM(kills), SUM(deaths), SUM(assists),
                           AVG(adr), AVG(kast), AVG(hs_pct),
                           SUM(fk), SUM(fd), SUM(mk), AVG(dd_delta)
                    FROM match_stats_map msm
                    JOIN matches m ON msm.match_id = m.id
                    WHERE msm.player_id = %s AND m.status = 'completed' AND {sf}
                """, (pid, *sp))
                agg = cursor.fetchone()
                maps, acs, k, d, a, adr, kast, hs, fk, fd, mk, dd = (v or 0 for v in agg)

                cursor.execute(f"""
                    SELECT agent, COUNT(*) as c, AVG(acs), AVG(kills), AVG(deaths)
                    FROM match_stats_map msm JOIN matches m ON msm.match_id = m.id
                    WHERE msm.player_id = %s AND m.status = 'completed' AND {sf}
                    GROUP BY agent ORDER BY c DESC LIMIT 3
                """, (pid, *sp))
                agents = cursor.fetchall()

                cursor.execute(f"""
                    SELECT m.week, t1.tag, t2.tag, msm.acs, msm.kills, msm.deaths,
                           msm.agent, msm.clutches,
                           CASE WHEN m.winner_id = msm.team_id THEN true ELSE false END as won
                    FROM match_stats_map msm
                    JOIN matches m ON msm.match_id = m.id
                    JOIN teams t1 ON m.team1_id = t1.id
                    JOIN teams t2 ON m.team2_id = t2.id
                    WHERE msm.player_id = %s AND m.status = 'completed' AND {sf}
                    ORDER BY m.id DESC LIMIT 5
                """, (pid, *sp))
                recent = cursor.fetchall()

            kd = k / max(d, 1)
            arch = determine_archetype(agents[0][0] if agents else "")
            avatar_url = await fetch_discord_avatar(self.bot, puuid)

            embed = discord.Embed(title=f"{'<@'+puuid+'>' if puuid else pname}", color=C_TEAL)
            if avatar_url:
                embed.set_thumbnail(url=avatar_url)

            team_str = f"**{tname}** `[{ttag}]`" if tname else "*Free Agent*"
            embed.description = (
                f"### {pname}\n"
                f"🏷️ **Riot ID:** `{rid or 'N/A'}`\n"
                f"{rank_icon(prank)} **Rank:** `{prank or 'Unranked'}`\n"
                f"🛡️ **Team:** {team_str}\n"
                f"🧬 **Archetype:** `{arch}`\n"
                f"🗓️ Season **{season}** · `{int(maps)}` maps played"
            )
            embed.add_field(
                name="⚔️ Combat Stats",
                value=(
                    f"```\n"
                    f"ACS   {round(acs, 1):>6}   {pct_bar(acs, 350)}\n"
                    f"K/D   {kd:>6.2f}   {pct_bar(kd * 50, 100)}\n"
                    f"ADR   {round(adr, 1):>6}   {pct_bar(adr, 200)}\n"
                    f"KAST  {round(kast, 1):>5}%   {pct_bar(kast)}\n"
                    f"HS%   {round(hs, 1):>5}%   {pct_bar(hs)}\n"
                    f"```"
                ),
                inline=False
            )
            embed.add_field(
                name="💥 Impact",
                value=(
                    f"First Kills `{int(fk)}` · First Deaths `{int(fd)}`\n"
                    f"Multi-kills `{int(mk)}` · DD Delta `{round(dd, 1) if dd else '—'}`"
                ),
                inline=False
            )
            if agents:
                agent_lines = []
                for an, c, avg_acs, avg_k, avg_d in agents:
                    avg_kd = avg_k / max(avg_d, 1)
                    agent_lines.append(f"**{an}** · `{c}` maps · `{round(avg_acs)}` ACS · `{avg_kd:.2f}` K/D")
                embed.add_field(name="🎭 Agent Pool", value="\n".join(agent_lines), inline=False)
            if recent:
                form_lines = []
                for wk, t1, t2, r_acs, rk, rd, ragent, _, won in recent:
                    result = "🟢 W" if won else "🔴 L"
                    form_lines.append(
                        f"{result} W{wk}: `{t1}` v `{t2}` — **{ragent}** `{int(r_acs)} ACS` `{rk}/{rd}`"
                    )
                embed.add_field(name="🕹️ Recent Form (Last 5)", value="\n".join(form_lines), inline=False)

            embed.set_footer(text="Use /stats_chart for performance trends over time")
            await interaction.followup.send(embed=embed)
        except Exception as e:
            logger.exception("player_info failed for %s", name)
            await interaction.followup.send(f"❌ Error: {e}")

    # ── /compare_players ─────────────────────────────────────────────────────
    @app_commands.command(name="compare_players", description="Head-to-head player stat comparison")
    @app_commands.autocomplete(player1=player_autocomplete, player2=player_autocomplete)
    async def compare_players(self, interaction: discord.Interaction,
                              player1: str, player2: str, season: str = None):
        await interaction.response.defer()
        if season is None:
            season = await run_in_executor(get_default_season)
        try:
            with get_conn() as conn:
                cursor = conn.cursor()
                p_data = []
                for n in [player1, player2]:
                    m = re.match(r"^<@!?(\d+)>$", n.strip())
                    if m:
                        cursor.execute(
                            "SELECT id, name, uuid FROM players WHERE uuid = %s LIMIT 1",
                            (m.group(1),)
                        )
                    else:
                        cursor.execute(
                            "SELECT id, name, uuid FROM players "
                            "WHERE name ILIKE %s OR riot_id ILIKE %s LIMIT 1",
                            (n, n)
                        )
                    r = cursor.fetchone()
                    if not r:
                        return await interaction.followup.send(f"❌ Player `{n}` not found.")
                    p_data.append(r)

                sf = "(m.season_id = %s OR (m.season_id IS NULL AND %s = 'S23'))" if season != 'all' else "1=1"
                sp = (season, season) if season != 'all' else ()
                stats = []
                for pid, _, _ in p_data:
                    cursor.execute(f"""
                        SELECT COUNT(*), AVG(acs), SUM(kills), SUM(deaths), AVG(adr),
                               AVG(kast), AVG(hs_pct), SUM(fk)
                        FROM match_stats_map msm JOIN matches m ON msm.match_id = m.id
                        WHERE msm.player_id = %s AND m.status = 'completed' AND {sf}
                    """, (pid, *sp))
                    stats.append(cursor.fetchone())

            def _unpack(s):
                return [v or 0 for v in s]

            m1, acs1, k1, d1, adr1, kast1, hs1, fk1 = _unpack(stats[0])
            m2, acs2, k2, d2, adr2, kast2, hs2, fk2 = _unpack(stats[1])
            kd1, kd2 = k1 / max(d1, 1), k2 / max(d2, 1)

            def _cmp(v1, v2, fmt="{:.1f}"):
                s1, s2 = fmt.format(v1), fmt.format(v2)
                if v1 > v2:
                    return f"**{s1}** ✅", s2
                if v2 > v1:
                    return s1, f"**{s2}** ✅"
                return s1, s2

            n1, n2 = p_data[0][1], p_data[1][1]
            u1, u2 = p_data[0][2], p_data[1][2]

            embed = discord.Embed(title=f"⚔️ Player Comparison  ·  Season {season}", color=C_PURPLE)
            rows = [
                ("Maps Played", m1,    m2,    "{:.0f}"),
                ("ACS",         acs1,  acs2,  "{:.1f}"),
                ("K/D",         kd1,   kd2,   "{:.2f}"),
                ("ADR",         adr1,  adr2,  "{:.1f}"),
                ("KAST",        kast1, kast2, "{:.1f}"),
                ("HS%",         hs1,   hs2,   "{:.1f}"),
                ("First Kills", fk1,   fk2,   "{:.0f}"),
            ]
            metrics, col1_vals, col2_vals = [], [], []
            for label, v1, v2, fmt in rows:
                c1, c2 = _cmp(float(v1), float(v2), fmt)
                metrics.append(f"`{label}`")
                col1_vals.append(c1)
                col2_vals.append(c2)

            head1 = f"<@{u1}>" if u1 else n1
            head2 = f"<@{u2}>" if u2 else n2
            embed.add_field(name="📊 Metric", value="\n".join(metrics), inline=True)
            embed.add_field(name=head1, value="\n".join(col1_vals), inline=True)
            embed.add_field(name=head2, value="\n".join(col2_vals), inline=True)
            embed.set_footer(text="✅ = winner of that category")
            await interaction.followup.send(embed=embed)
        except Exception as e:
            logger.exception("compare_players failed for %s vs %s", player1, player2)
            await interaction.followup.send(f"❌ Error: {e}")


async def setup(bot):
    await bot.add_cog(PlayersCog(bot))
