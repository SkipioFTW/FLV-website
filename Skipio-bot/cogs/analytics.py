import logging
import discord
from discord.ext import commands
from discord import app_commands
from database import get_conn, get_default_season
from utils.helpers import run_in_executor
from utils.autocomplete import player_autocomplete, team_autocomplete, rank_autocomplete, season_autocomplete
from utils.formatting import rank_icon
from utils.design import C_RED, C_TEAL, C_GOLD

logger = logging.getLogger(__name__)


class AnalyticsCog(commands.Cog):
    def __init__(self, bot):
        self.bot = bot

    # ── /scout ───────────────────────────────────────────────────────────────
    @app_commands.command(name="scout", description="Get a scouting report for a team (Meta & Stats)")
    @app_commands.describe(team="Team name or tag", season="Season ID")
    @app_commands.autocomplete(team=team_autocomplete, season=season_autocomplete)
    async def scout(self, interaction: discord.Interaction, team: str, season: str = None):
        await interaction.response.defer()
        if season is None:
            season = await run_in_executor(get_default_season)
        try:
            with get_conn() as conn:
                cursor = conn.cursor()
                cursor.execute(
                    "SELECT id, name, tag, group_name FROM teams WHERE name ILIKE %s OR tag ILIKE %s LIMIT 1",
                    (team, team)
                )
                row = cursor.fetchone()
                if not row:
                    return await interaction.followup.send(f"❌ Team `{team}` not found.")
                tid, tname, ttag, tgroup = row

                sf = "(m.season_id = %s OR (m.season_id IS NULL AND %s = 'S23'))" if season != 'all' else "1=1"
                sp = (season, season) if season != 'all' else ()

                cursor.execute(f"""
                    SELECT mm.map_name,
                           CASE WHEN m.team1_id = %s THEN mm.team1_rounds ELSE mm.team2_rounds END as my_rounds,
                           CASE WHEN m.team1_id = %s THEN mm.team2_rounds ELSE mm.team1_rounds END as op_rounds
                    FROM match_maps mm JOIN matches m ON mm.match_id = m.id
                    WHERE (m.team1_id = %s OR m.team2_id = %s) AND m.status = 'completed' AND {sf}
                """, (tid, tid, tid, tid, *sp))
                maps_data = cursor.fetchall()

                cursor.execute(
                    "SELECT id, name FROM players WHERE default_team_id = %s",
                    (tid,)
                )
                roster = cursor.fetchall()

                # Batch agent query — one query for all roster players instead of N+1
                if roster:
                    pid_list = [pid for pid, _ in roster]
                    pname_map = {pid: pname for pid, pname in roster}
                    ph = ','.join(['%s'] * len(pid_list))
                    cursor.execute(f"""
                        SELECT player_id, agent FROM (
                            SELECT msm.player_id, msm.agent,
                                   ROW_NUMBER() OVER (
                                       PARTITION BY msm.player_id ORDER BY COUNT(*) DESC
                                   ) as rn
                            FROM match_stats_map msm JOIN matches m ON msm.match_id = m.id
                            WHERE msm.player_id IN ({ph}) AND msm.team_id = %s
                              AND m.status = 'completed' AND {sf}
                            GROUP BY msm.player_id, msm.agent
                        ) sub WHERE rn = 1
                    """, (*pid_list, tid, *sp))
                    top_agents = {r[0]: r[1] for r in cursor.fetchall()}
                    player_best = [
                        f"**{pname_map[pid]}**: {top_agents.get(pid, '*No data*')}"
                        for pid in pid_list
                    ]
                else:
                    player_best = ["*No roster found*"]

                cursor.execute(f"""
                    SELECT m.week,
                           CASE WHEN m.team1_id = %s THEN t2.name ELSE t1.name END as op_name,
                           CASE WHEN m.winner_id = %s THEN 'W'
                                WHEN m.winner_id IS NOT NULL AND m.winner_id != %s THEN 'L'
                                ELSE 'D' END as res,
                           CASE WHEN m.team1_id = %s THEN COALESCE(mr.r1, 0) ELSE COALESCE(mr.r2, 0) END as my_score,
                           CASE WHEN m.team1_id = %s THEN COALESCE(mr.r2, 0) ELSE COALESCE(mr.r1, 0) END as op_score
                    FROM matches m
                    JOIN teams t1 ON m.team1_id = t1.id
                    JOIN teams t2 ON m.team2_id = t2.id
                    LEFT JOIN (
                        SELECT match_id, SUM(team1_rounds) as r1, SUM(team2_rounds) as r2
                        FROM match_maps GROUP BY match_id
                    ) mr ON m.id = mr.match_id
                    WHERE (m.team1_id = %s OR m.team2_id = %s) AND m.status = 'completed' AND {sf}
                    ORDER BY m.week DESC, m.id DESC LIMIT 5
                """, (tid, tid, tid, tid, tid, tid, tid, *sp))
                recent = cursor.fetchall()

                cursor.execute(f"""
                    SELECT p.name, AVG(msm.acs) as avg_acs
                    FROM match_stats_map msm
                    JOIN matches m ON msm.match_id = m.id
                    JOIN players p ON msm.player_id = p.id
                    WHERE msm.team_id = %s AND p.default_team_id = %s AND m.status = 'completed' AND {sf}
                    GROUP BY p.id, p.name ORDER BY avg_acs DESC LIMIT 2
                """, (tid, tid, *sp))
                top_players = cursor.fetchall()

            map_stats = {}
            for m_name, my_r, op_r in maps_data:
                if m_name not in map_stats:
                    map_stats[m_name] = {'w': 0, 'l': 0}
                my_r = my_r or 0
                op_r = op_r or 0
                if my_r > op_r:
                    map_stats[m_name]['w'] += 1
                elif op_r > my_r:
                    map_stats[m_name]['l'] += 1

            sorted_maps = sorted(
                [{'name': k, 'w': v['w'], 'l': v['l'],
                  'wr': v['w'] / (v['w'] + v['l']) if (v['w'] + v['l']) > 0 else 0}
                 for k, v in map_stats.items()],
                key=lambda x: x['wr'], reverse=True
            )
            best_maps = sorted_maps[:2]
            worst_maps = []
            if len(sorted_maps) > 2:
                worst_maps = [m for m in sorted_maps[-2:] if m['name'] not in {b['name'] for b in best_maps}]

            embed = discord.Embed(
                title=f"🕵️‍♂️ Scouting Report: {tname} [{ttag}]",
                description=f"Group: **{tgroup or 'N/A'}** · Season: `{season}`",
                color=C_RED
            )
            bm_str = "\n".join([f"**{m['name']}** - {int(m['wr']*100)}% ({m['w']}W-{m['l']}L)"
                                 for m in best_maps]) or "N/A"
            wm_str = "\n".join([f"**{m['name']}** - {int(m['wr']*100)}% ({m['w']}W-{m['l']}L)"
                                 for m in worst_maps[::-1]]) or "N/A"
            embed.add_field(name="✅ Best Maps", value=bm_str, inline=True)
            embed.add_field(name="❌ Weakest Maps", value=wm_str, inline=True)
            embed.add_field(name="​", value="​", inline=False)
            embed.add_field(name="🎭 Roster Agent Meta", value="\n".join(player_best), inline=True)
            dp_str = "\n".join([f"**{p[0]}** - {int(p[1])} ACS" for p in top_players]) or "N/A"
            embed.add_field(name="⚠️ Danger Players", value=dp_str, inline=True)
            embed.add_field(name="​", value="​", inline=False)
            form_str = " - ".join([f"**{r[2]}** vs {r[1]} (`{r[3]}-{r[4]}`)" for r in recent]) or "N/A"
            embed.add_field(name="📈 Recent Form (Last 5)", value=form_str, inline=False)

            await interaction.followup.send(embed=embed)
        except Exception as e:
            logger.exception("scout failed for %s", team)
            await interaction.followup.send(f"❌ Error: {e}")

    # ── /standings ────────────────────────────────────────────────────────────
    @app_commands.command(name="standings", description="View current group standings")
    @app_commands.describe(group="Group name (Sun, Moon, Star, Shadow)", season="Season ID")
    async def standings(self, interaction: discord.Interaction, group: str, season: str = None):
        try:
            await interaction.response.defer()
        except Exception:
            return

        if season is None:
            season = await run_in_executor(get_default_season)

        try:
            with get_conn() as conn:
                sf = "(m.season_id = %s OR (m.season_id IS NULL AND %s = 'S23'))" if season != 'all' else "1=1"
                query = f"""
                WITH match_rounds AS (
                    SELECT match_id,
                           SUM(team1_rounds) as total_r1,
                           SUM(team2_rounds) as total_r2
                    FROM match_maps GROUP BY match_id
                ),
                tm AS (
                    SELECT m.team1_id as tid,
                        CASE WHEN m.winner_id = m.team1_id THEN 1 ELSE 0 END as win,
                        CASE WHEN m.winner_id = m.team2_id THEN 1 ELSE 0 END as loss,
                        CASE WHEN m.winner_id = m.team1_id THEN 15
                             ELSE LEAST(COALESCE(mr.total_r1, 0), 12) END as earned_pts,
                        CASE WHEN m.winner_id = m.team2_id THEN 15
                             ELSE LEAST(COALESCE(mr.total_r2, 0), 12) END as against_pts
                    FROM matches m LEFT JOIN match_rounds mr ON m.id = mr.match_id
                    WHERE m.status = 'completed' AND m.match_type != 'playoff' AND {sf}

                    UNION ALL

                    SELECT m.team2_id,
                        CASE WHEN m.winner_id = m.team2_id THEN 1 ELSE 0 END,
                        CASE WHEN m.winner_id = m.team1_id THEN 1 ELSE 0 END,
                        CASE WHEN m.winner_id = m.team2_id THEN 15
                             ELSE LEAST(COALESCE(mr.total_r2, 0), 12) END,
                        CASE WHEN m.winner_id = m.team1_id THEN 15
                             ELSE LEAST(COALESCE(mr.total_r1, 0), 12) END
                    FROM matches m LEFT JOIN match_rounds mr ON m.id = mr.match_id
                    WHERE m.status = 'completed' AND m.match_type != 'playoff' AND {sf}
                )
                SELECT t.name, t.tag,
                    COUNT(tm.tid) as played,
                    COALESCE(SUM(tm.win), 0) as wins,
                    COALESCE(SUM(tm.loss), 0) as losses,
                    COALESCE(SUM(tm.earned_pts), 0) as total_pts,
                    COALESCE(SUM(tm.earned_pts) - SUM(tm.against_pts), 0) as pd
                FROM teams t LEFT JOIN tm ON t.id = tm.tid
                WHERE t.group_name ILIKE %s AND t.name NOT IN ('FAT1', 'FAT2')
                GROUP BY t.id, t.name, t.tag
                ORDER BY total_pts DESC, pd DESC
                """
                params = (season, season, season, season, group) if season != 'all' else (group,)
                cursor = conn.cursor()
                cursor.execute(query, params)
                rows = cursor.fetchall()

            if not rows:
                return await interaction.followup.send(f"❌ No data for group `{group}` in season `{season}`.")

            embed = discord.Embed(
                title=f"📊 Group **{group.upper()}** Standings",
                description=f"Season `{season}`\n*Winner: 15pts | Loser: rounds (max 12)*",
                color=C_GOLD
            )
            lines = []
            for i, (name, tag, played, wins, losses, pts, pd_val) in enumerate(rows, 1):
                wins = wins or 0
                losses = losses or 0
                pts = pts or 0
                pd_val = pd_val or 0
                played = played or 0
                medal = ["🥇", "🥈", "🥉"][i - 1] if i <= 3 else f"`{i}.`"
                wr = round(wins / max(played, 1) * 100)
                streak = "🔥" if wins > 0 and losses == 0 else ("💀" if losses > 0 and wins == 0 else "")
                lines.append(
                    f"{medal} **{name}** `{tag}`\n"
                    f"  `W{wins} L{losses}` · Pts `{pts}` · "
                    f"PD `{'+' if pd_val >= 0 else ''}{pd_val}` · WR `{wr}%` {streak}"
                )
            embed.add_field(name="​", value="\n".join(lines), inline=False)
            embed.set_footer(text="Sorted by League Points then Point Differential")
            await interaction.followup.send(embed=embed)
        except Exception as e:
            logger.exception("standings failed for group=%s season=%s", group, season)
            await interaction.followup.send(f"❌ Error: {e}")

    # ── /leaderboard ──────────────────────────────────────────────────────────
    @app_commands.command(name="leaderboard", description="Show top players by performance")
    @app_commands.describe(stat="Stat to rank by", rank="Filter by rank tier",
                           role="Filter by role", min_games="Min maps played", season="Season ID")
    @app_commands.choices(stat=[
        app_commands.Choice(name="ACS",  value="avg_acs"),
        app_commands.Choice(name="K/D",  value="avg_kd"),
        app_commands.Choice(name="ADR",  value="avg_adr"),
        app_commands.Choice(name="KAST", value="avg_kast"),
        app_commands.Choice(name="HS%",  value="avg_hs"),
    ])
    @app_commands.choices(role=[
        app_commands.Choice(name="Duelist",    value="duelist"),
        app_commands.Choice(name="Initiator",  value="initiator"),
        app_commands.Choice(name="Sentinel",   value="sentinel"),
        app_commands.Choice(name="Controller", value="controller"),
    ])
    @app_commands.autocomplete(rank=rank_autocomplete)
    async def leaderboard(self, interaction: discord.Interaction, stat: str = "avg_acs",
                          rank: str = None, role: str = None, min_games: int = 0,
                          season: str = None):
        await interaction.response.defer()
        if season is None:
            season = await run_in_executor(get_default_season)
        try:
            sf = "(m.season_id = %s OR (m.season_id IS NULL AND %s = 'S23'))" if season != 'all' else "1=1"
            sf2 = "(m2.season_id = %s OR (m2.season_id IS NULL AND %s = 'S23'))" if season != 'all' else "1=1"
            rank_filter = "AND p.rank ILIKE %s" if rank else ""
            _agent_roles = {
                "duelist":    "('Jett','Phoenix','Raze','Reyna','Yoru','Neon','Iso','Waylay')",
                "initiator":  "('Sova','Breach','Skye','KAY/O','Fade','Gekko','Tejo')",
                "sentinel":   "('Sage','Cypher','Killjoy','Chamber','Deadlock','Vyse','Veto')",
                "controller": "('Brimstone','Viper','Omen','Astra','Harbor','Clove','Miks')",
            }
            role_filter = (
                f"AND (SELECT agent FROM match_stats_map msm2 "
                f"JOIN matches m2 ON msm2.match_id=m2.id "
                f"WHERE msm2.player_id=p.id AND m2.status='completed' AND {sf2} "
                f"GROUP BY agent ORDER BY COUNT(*) DESC LIMIT 1) IN {_agent_roles[role]}"
            ) if role else ""

            params = []
            if season != 'all':
                params.extend([season, season])
            if rank:
                params.append(f"%{rank}%")
            if role and season != 'all':
                params.extend([season, season])
            params.append(min_games)

            with get_conn() as conn:
                cursor = conn.cursor()
                cursor.execute(f"""
                    SELECT p.name, p.riot_id, p.uuid, p.rank, t.tag,
                           COUNT(DISTINCT msm.match_id) as games,
                           AVG(msm.acs) as avg_acs,
                           AVG(msm.kills::float/NULLIF(msm.deaths,0)) as avg_kd,
                           AVG(msm.adr) as avg_adr,
                           AVG(msm.kast) as avg_kast,
                           AVG(msm.hs_pct) as avg_hs
                    FROM match_stats_map msm
                    JOIN matches m ON msm.match_id = m.id
                    JOIN players p ON msm.player_id = p.id
                    LEFT JOIN teams t ON p.default_team_id = t.id
                    WHERE m.status = 'completed' AND {sf} {rank_filter} {role_filter}
                    GROUP BY p.id, p.name, p.riot_id, p.uuid, p.rank, t.tag
                    HAVING COUNT(DISTINCT msm.match_id) >= %s
                    ORDER BY {stat} DESC LIMIT 10
                """, tuple(params))
                rows = cursor.fetchall()

            if not rows:
                return await interaction.followup.send(f"No data found for season `{season}`.")

            labels = {"avg_acs": "ACS", "avg_kd": "K/D", "avg_adr": "ADR",
                      "avg_kast": "KAST", "avg_hs": "HS%"}
            tag_lb = labels[stat]
            embed = discord.Embed(
                title=f"🏆 Leaderboard  ·  Top {tag_lb}",
                description=f"Season `{season}`" + (f"  ·  Rank filter: `{rank}`" if rank else ""),
                color=C_GOLD
            )
            medals = ["🥇", "🥈", "🥉"]
            for i, (name, rid, uuid, prank, team, games, acs, kd, adr, kast, hs) in enumerate(rows, 1):
                medal = medals[i - 1] if i <= 3 else f"`{i}.`"
                mention = f"<@{uuid}>" if uuid else f"**{name}**"
                val_map = {
                    "avg_acs":  f"{round(acs or 0, 1)}",
                    "avg_kd":   f"{round(kd  or 0, 2)}",
                    "avg_adr":  f"{round(adr or 0, 1)}",
                    "avg_kast": f"{round(kast or 0, 1)}%",
                    "avg_hs":   f"{round(hs  or 0, 1)}%",
                }
                primary = val_map[stat]
                secondary = f"ACS `{round(acs or 0)}` · K/D `{round(kd or 0, 2)}` · ADR `{round(adr or 0)}`"
                embed.add_field(
                    name=f"{medal} {name}  {rank_icon(prank)} `{prank or '—'}` · `{team or 'FA'}`",
                    value=f"{mention}  ·  **{tag_lb}: {primary}**  ·  Maps: `{games}`\n{secondary}",
                    inline=False
                )
            await interaction.followup.send(embed=embed)
        except Exception as e:
            logger.exception("leaderboard failed")
            await interaction.followup.send(f"❌ Error: {e}")

    # ── /stats ────────────────────────────────────────────────────────────────
    @app_commands.command(name="stats", description="Quick snapshot of player performance")
    @app_commands.describe(name="Player name or @mention", season="Season ID")
    @app_commands.autocomplete(name=player_autocomplete)
    async def stats(self, interaction: discord.Interaction, name: str, season: str = None):
        await interaction.response.defer()
        if season is None:
            season = await run_in_executor(get_default_season)
        try:
            import re
            mention_match = re.match(r"^<@!?(\d+)>$", name.strip())
            with get_conn() as conn:
                cursor = conn.cursor()
                if mention_match:
                    cursor.execute(
                        "SELECT id, name, riot_id, rank, uuid FROM players WHERE uuid = %s LIMIT 1",
                        (mention_match.group(1),)
                    )
                else:
                    cursor.execute(
                        "SELECT id, name, riot_id, rank, uuid FROM players "
                        "WHERE name ILIKE %s OR riot_id ILIKE %s LIMIT 1",
                        (name, name)
                    )
                row = cursor.fetchone()
                if not row:
                    return await interaction.followup.send(f"❌ Player `{name}` not found.")
                pid, pname, rid, prank, puuid = row

                sf = "(m.season_id = %s OR (m.season_id IS NULL AND %s = 'S23'))" if season != 'all' else "1=1"
                sp = (season, season) if season != 'all' else ()
                cursor.execute(f"""
                    SELECT AVG(acs), SUM(kills), SUM(deaths), AVG(adr), AVG(kast), COUNT(*)
                    FROM match_stats_map msm
                    JOIN matches m ON msm.match_id = m.id
                    WHERE msm.player_id = %s AND m.status = 'completed' AND {sf}
                """, (pid, *sp))
                agg = cursor.fetchone()
                acs, k, d, adr, kast, maps = (v or 0 for v in agg)

            kd = k / max(d, 1)
            embed = discord.Embed(
                title=f"{'<@'+puuid+'>' if puuid else pname} - Season {season}",
                description=f"{rank_icon(prank)} **{prank or 'Unranked'}** · Maps: `{int(maps)}`",
                color=C_TEAL
            )
            embed.add_field(
                name="📊 Summary",
                value=f"ACS: **{round(acs)}**\nK/D: **{round(kd, 2)}**\nADR: **{round(adr)}**\nKAST: **{round(kast)}%**",
                inline=False
            )
            await interaction.followup.send(embed=embed)
        except Exception as e:
            logger.exception("stats failed for %s", name)
            await interaction.followup.send(f"❌ Error: {e}")


async def setup(bot):
    await bot.add_cog(AnalyticsCog(bot))
