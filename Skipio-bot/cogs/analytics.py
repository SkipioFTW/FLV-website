import discord
from discord.ext import commands
from discord import app_commands
import re
from database import get_conn, get_default_season
from utils.helpers import run_in_executor, determine_archetype
from utils.autocomplete import player_autocomplete, team_autocomplete, rank_autocomplete, season_autocomplete
from utils.charts import generate_radar_chart

# ── Design tokens (mirror charts.py) ─────────────────────────────────────────
V_RED    = 0xFF4655
V_TEAL   = 0x24FFAB
V_GOLD   = 0xFFB800
V_BLUE   = 0x3FD1FF
V_PURPLE = 0xB47FFF

RANK_TIERS = {
    "Radiant": "🔺", "Immortal": "💜", "Ascendant": "💚",
    "Diamond": "💎", "Platinum": "🔷", "Gold": "🥇",
    "Silver": "🥈", "Bronze": "🥉", "Iron": "⬜"
}

def _rank_icon(rank: str) -> str:
    if not rank: return "⬜"
    for tier, icon in RANK_TIERS.items():
        if tier.lower() in (rank or "").lower():
            return icon
    return "🎯"

def _pct_bar(val, max_val=100, width=8) -> str:
    v = min(100, max(0, (float(val or 0) / float(max_val or 1)) * 100))
    filled = round(v / 100 * width)
    return "█" * filled + "░" * (width - filled)

async def _fetch_discord_avatar(bot: discord.Client, uuid: str) -> str | None:
    """Return avatar URL for a Discord user ID, or None."""
    if not uuid:
        return None
    try:
        user = bot.get_user(int(uuid)) or await bot.fetch_user(int(uuid))
        return user.display_avatar.url if user else None
    except Exception:
        return None


class AnalyticsCog(commands.Cog):
    def __init__(self, bot):
        self.bot = bot

    def _get_rank_grp(self, r):
        if not r: return 2
        ru = r.upper()
        if 'IRON' in ru or 'BRONZE' in ru: return 1
        if 'SILVER' in ru or 'GOLD' in ru: return 2
        if 'PLATINUM' in ru or 'DIAMOND' in ru: return 3
        if 'ASCENDANT' in ru or 'IMMORTAL' in ru or 'RADIANT' in ru: return 4
        return 2

    def _calculate_skipio_elos(self, cursor, season='all'):
        # 1. Fetch all player ranks
        cursor.execute("SELECT id, rank FROM players")
        p_ranks = {r[0]: r[1] for r in cursor.fetchall()}
        p_groups = {pid: self._get_rank_grp(rank) for pid, rank in p_ranks.items()}

        # 2. Fetch matches for context
        sf = "1=1" if season == 'all' else "m.season_id=%s"
        cursor.execute(f"SELECT id FROM matches m WHERE m.status='completed' AND {sf}", (season,) if season != 'all' else ())
        m_ids = [r[0] for r in cursor.fetchall()]
        if not m_ids: return {}, []

        # 3. Fetch stats
        placeholders = ','.join(['%s'] * len(m_ids))
        cursor.execute(f"""
            SELECT player_id, match_id, acs, kills, deaths, adr, kast
            FROM match_stats_map
            WHERE match_id IN ({placeholders})
        """, tuple(m_ids))
        stats = cursor.fetchall()

        # 4. Global Averages & Lobby Scores
        grp_totals = {1: [0.0, 0], 2: [0.0, 0], 3: [0.0, 0], 4: [0.0, 0]}
        lobby_scores = {} # (mid, grp) -> [raw_scores]
        appearances = [] # (pid, mid, raw, grp)

        for row in stats:
            pid, mid, acs, kills, deaths, adr, kast = row
            grp = p_groups.get(pid, 2)
            kd = (kills / deaths) if deaths and deaths > 0 else (kills or 0)
            raw = ((acs or 0)*0.40) + (kd*30*0.30) + ((adr or 0)*0.20) + ((kast or 0)*0.10)

            grp_totals[grp][0] += raw
            grp_totals[grp][1] += 1
            
            key = (mid, grp)
            if key not in lobby_scores: lobby_scores[key] = []
            lobby_scores[key].append(raw)
            appearances.append((pid, mid, raw, grp))

        grp_avgs = {g: (v[0]/v[1] if v[1]>0 else 150) for g, v in grp_totals.items()}

        # 5. Blended Progression
        player_history = {} # pid -> [elo_at_k]
        player_blended_list = {} # pid -> [blended_scores]

        # Sort appearances by match ID (chronological)
        appearances.sort(key=lambda x: x[1])

        for (pid, mid, raw, grp) in appearances:
            g_avg = grp_avgs[grp]
            lobby = lobby_scores.get((mid, grp), [])
            l_avg = sum(lobby)/len(lobby) if len(lobby) > 1 else g_avg
            
            g_norm = (raw / g_avg) * 100 if g_avg > 0 else 100
            l_norm = (raw / l_avg) * 100 if l_avg > 0 else 100
            blended = g_norm * 0.5 + l_norm * 0.5

            if pid not in player_blended_list: player_blended_list[pid] = []
            player_blended_list[pid].append(blended)

            if pid not in player_history: player_history[pid] = []
            avg_so_far = sum(player_blended_list[pid]) / len(player_blended_list[pid])
            player_history[pid].append(round(1000 + (avg_so_far - 100) * 20))

        return player_history, appearances

    # ── /standings ───────────────────────────────────────────────────────────
    @app_commands.command(name="standings", description="View current group standings")
    @app_commands.describe(group="Group name (e.g. A, B, C)", season="Season ID")
    async def standings(self, interaction: discord.Interaction, group: str, season: str = None):
        try: await interaction.response.defer()
        except: return
        if season is None: season = await run_in_executor(get_default_season)
        try:
            with get_conn() as conn:
                if not conn: return await interaction.followup.send("❌ DB Connection Error.")
                sf = "(m.season_id = %s OR (m.season_id IS NULL AND %s = 'S23'))" if season != 'all' else "1=1"
                query = f"""
                WITH tm AS (
                    SELECT m.team1_id as tid,
                        CASE WHEN m.winner_id=m.team1_id THEN 1 ELSE 0 END as win,
                        CASE WHEN m.winner_id=m.team2_id THEN 1 ELSE 0 END as loss,
                        COALESCE(mm.team1_rounds,0) as pts,
                        COALESCE(mm.team2_rounds,0) as pts_a
                    FROM matches m LEFT JOIN match_maps mm ON m.id=mm.match_id AND mm.map_index=0
                    WHERE m.status='completed' AND m.match_type='regular' AND {sf}
                    UNION ALL
                    SELECT m.team2_id,
                        CASE WHEN m.winner_id=m.team2_id THEN 1 ELSE 0 END,
                        CASE WHEN m.winner_id=m.team1_id THEN 1 ELSE 0 END,
                        COALESCE(mm.team2_rounds,0),
                        COALESCE(mm.team1_rounds,0)
                    FROM matches m LEFT JOIN match_maps mm ON m.id=mm.match_id AND mm.map_index=0
                    WHERE m.status='completed' AND m.match_type='regular' AND {sf}
                )
                SELECT t.name, t.tag,
                    COUNT(tm.tid) as played,
                    SUM(tm.win) as wins,
                    SUM(tm.loss) as losses,
                    SUM(tm.win)*3 as pts,
                    (SUM(tm.pts)-SUM(tm.pts_a)) as pd
                FROM teams t LEFT JOIN tm ON t.id=tm.tid
                WHERE t.group_name ILIKE %s
                GROUP BY t.id, t.name, t.tag
                ORDER BY pts DESC, pd DESC
                """
                cursor = conn.cursor()
                params = (season, season, season, season, group) if season != 'all' else (group,)
                cursor.execute(query, params)
                rows = cursor.fetchall()
                if not rows:
                    return await interaction.followup.send(f"❌ No data for group `{group}` in season `{season}`.")

            embed = discord.Embed(
                title=f"📊 Group **{group.upper()}** Standings",
                description=f"Season `{season}`",
                color=V_GOLD
            )
            lines = []
            for i, (name, tag, played, wins, losses, pts, pd_val) in enumerate(rows, 1):
                medal = ["🥇","🥈","🥉"][i-1] if i <= 3 else f"`{i}.`"
                wr = round(wins / max(played, 1) * 100)
                streak = "🔥" if wins and not losses else ("💀" if losses and not wins else "")
                lines.append(
                    f"{medal} **{name}** `{tag}`\n"
                    f"  `W{wins or 0} L{losses or 0}` · Pts `{pts or 0}` · PD `{'+' if (pd_val or 0)>=0 else ''}{pd_val or 0}` · WR `{wr}%` {streak}"
                )
            embed.add_field(name="\u200b", value="\n".join(lines), inline=False)
            embed.set_footer(text=f"Sorted by points then Point Differential")
            await interaction.followup.send(embed=embed)
        except Exception as e:
            await interaction.followup.send(f"❌ Error: {str(e)}")

    # ── /leaderboard ─────────────────────────────────────────────────────────
    @app_commands.command(name="leaderboard", description="Show top players by performance")
    @app_commands.describe(stat="Stat to rank by", rank="Filter by rank tier", min_games="Min maps played", season="Season ID")
    @app_commands.choices(stat=[
        app_commands.Choice(name="ACS",  value="avg_acs"),
        app_commands.Choice(name="K/D",  value="avg_kd"),
        app_commands.Choice(name="ADR",  value="avg_adr"),
        app_commands.Choice(name="KAST", value="avg_kast"),
        app_commands.Choice(name="HS%",  value="avg_hs"),
    ])
    @app_commands.autocomplete(rank=rank_autocomplete)
    async def leaderboard(self, interaction: discord.Interaction, stat: str = "avg_acs",
                          rank: str = None, min_games: int = 0, season: str = None):
        await interaction.response.defer()
        if season is None: season = await run_in_executor(get_default_season)
        try:
            sf = "(m.season_id = %s OR (m.season_id IS NULL AND %s = 'S23'))" if season != 'all' else "1=1"
            rank_filter = "AND p.rank ILIKE %s" if rank else ""
            with get_conn() as conn:
                if not conn: return await interaction.followup.send("❌ DB Error.")
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
                    JOIN matches m ON msm.match_id=m.id
                    JOIN players p ON msm.player_id=p.id
                    LEFT JOIN teams t ON p.default_team_id=t.id
                    WHERE m.status='completed' AND {sf} {rank_filter}
                    GROUP BY p.id,p.name,p.riot_id,p.uuid,p.rank,t.tag
                    HAVING COUNT(DISTINCT msm.match_id) >= %s
                    ORDER BY {stat} DESC LIMIT 10
                """, (season, season, f"%{rank}%", min_games) if season != 'all' and rank
                  else (season, season, min_games) if season != 'all'
                  else (f"%{rank}%", min_games) if rank
                  else (min_games,))
                rows = cursor.fetchall()

            if not rows:
                return await interaction.followup.send(f"No data found for season `{season}`.")

            labels = {"avg_acs":"ACS","avg_kd":"K/D","avg_adr":"ADR","avg_kast":"KAST","avg_hs":"HS%"}
            tag_lb = labels[stat]
            embed = discord.Embed(
                title=f"🏆 Leaderboard  ·  Top {tag_lb}",
                description=f"Season `{season}`" + (f"  ·  Rank filter: `{rank}`" if rank else ""),
                color=V_GOLD
            )
            medals = ["🥇","🥈","🥉"]
            for i, (name, rid, uuid, prank, team, games, acs, kd, adr, kast, hs) in enumerate(rows, 1):
                medal = medals[i-1] if i <= 3 else f"`{i}.`"
                rank_icon = _rank_icon(prank)
                mention = f"<@{uuid}>" if uuid else f"**{name}**"

                val_map = {"avg_acs": f"{round(acs or 0, 1)}",
                           "avg_kd":  f"{round(kd  or 0, 2)}",
                           "avg_adr": f"{round(adr or 0, 1)}",
                           "avg_kast":f"{round(kast or 0, 1)}%",
                           "avg_hs":  f"{round(hs  or 0, 1)}%"}
                primary = val_map[stat]
                secondary = f"ACS `{round(acs or 0)}` · K/D `{round(kd or 0, 2)}` · ADR `{round(adr or 0)}`"
                embed.add_field(
                    name=f"{medal} {name}  {rank_icon} `{prank or '—'}` · `{team or 'FA'}`",
                    value=f"{mention}  ·  **{tag_lb}: {primary}**  ·  Maps: `{games}`\n{secondary}",
                    inline=False
                )
            await interaction.followup.send(embed=embed)
        except Exception as e:
            await interaction.followup.send(f"❌ Error: {str(e)}")

    # ── /stats ───────────────────────────────────────────────────────────────
    @app_commands.command(name="stats", description="Quick snapshot of player performance")
    @app_commands.describe(name="Player name or @mention", season="Season ID")
    @app_commands.autocomplete(name=player_autocomplete)
    async def stats(self, interaction: discord.Interaction, name: str, season: str = None):
        await interaction.response.defer()
        if season is None: season = await run_in_executor(get_default_season)
        try:
            mention_match = re.match(r"^<@!?(\d+)>$", name.strip())
            with get_conn() as conn:
                cursor = conn.cursor()
                if mention_match:
                    cursor.execute(
                        "SELECT id,name,riot_id,rank,uuid FROM players WHERE uuid=%s LIMIT 1", (mention_match.group(1),))
                else:
                    cursor.execute(
                        "SELECT id,name,riot_id,rank,uuid FROM players WHERE name ILIKE %s OR riot_id ILIKE %s LIMIT 1", (name, name))
                row = cursor.fetchone()
                if not row:
                    return await interaction.followup.send(f"❌ Player `{name}` not found.")
                pid, pname, rid, prank, puuid = row
                
                sf = "(m.season_id = %s OR (m.season_id IS NULL AND %s = 'S23'))" if season != 'all' else "1=1"
                
                cursor.execute(f"""
                    SELECT AVG(acs), SUM(kills), SUM(deaths), AVG(adr), AVG(kast), COUNT(*)
                    FROM match_stats_map msm
                    JOIN matches m ON msm.match_id=m.id
                    WHERE msm.player_id=%s AND m.status='completed' AND {sf}
                """, (pid, season, season) if season != 'all' else (pid,))
                agg = cursor.fetchone()
                acs, k, d, adr, kast, maps = (v or 0 for v in agg)

            kd = k / max(d, 1)
            rank_icon = _rank_icon(prank)
            
            embed = discord.Embed(
                title=f"{'<@'+puuid+'>' if puuid else pname} - Season {season}",
                description=f"{rank_icon} **{prank or 'Unranked'}** · Maps: `{int(maps)}`",
                color=V_TEAL
            )
            embed.add_field(
                name="📊 Summary",
                value=f"ACS: **{round(acs)}**\nK/D: **{round(kd,2)}**\nADR: **{round(adr)}**\nKAST: **{round(kast)}%**",
                inline=False
            )
            await interaction.followup.send(embed=embed)
        except Exception as e:
            await interaction.followup.send(f"❌ Error: {str(e)}")

    # ── /player_info ─────────────────────────────────────────────────────────
    @app_commands.command(name="player_info", description="Look up detailed player stats")
    @app_commands.describe(name="Player name or @mention", season="Season ID")
    @app_commands.autocomplete(name=player_autocomplete)
    async def player_info(self, interaction: discord.Interaction, name: str, season: str = None):
        await interaction.response.defer()
        if season is None: season = await run_in_executor(get_default_season)
        try:
            mention_match = re.match(r"^<@!?(\d+)>$", name.strip())
            with get_conn() as conn:
                cursor = conn.cursor()
                if mention_match:
                    cursor.execute(
                        "SELECT p.id,p.name,p.riot_id,p.rank,p.uuid,t.name,t.tag "
                        "FROM players p LEFT JOIN teams t ON p.default_team_id=t.id "
                        "WHERE p.uuid=%s LIMIT 1", (mention_match.group(1),))
                else:
                    cursor.execute(
                        "SELECT p.id,p.name,p.riot_id,p.rank,p.uuid,t.name,t.tag "
                        "FROM players p LEFT JOIN teams t ON p.default_team_id=t.id "
                        "WHERE p.name ILIKE %s OR p.riot_id ILIKE %s LIMIT 1", (name, name))
                row = cursor.fetchone()
                if not row:
                    return await interaction.followup.send(f"❌ Player `{name}` not found.")
                pid, pname, rid, prank, puuid, tname, ttag = row

                # Season-specific team
                if season != 'all':
                    cursor.execute(
                        "SELECT t.name,t.tag FROM player_team_history pth "
                        "JOIN teams t ON pth.team_id=t.id "
                        "WHERE pth.player_id=%s AND pth.season_id=%s", (pid, season))
                    hist = cursor.fetchone()
                    if hist: tname, ttag = hist

                sf = "(m.season_id = %s OR (m.season_id IS NULL AND %s = 'S23'))" if season != 'all' else "1=1"

                # Core stats — include all available metrics
                cursor.execute(f"""
                    SELECT COUNT(*), AVG(acs), SUM(kills), SUM(deaths), SUM(assists),
                           AVG(adr), AVG(kast), AVG(hs_pct),
                           SUM(fk), SUM(fd), SUM(mk), AVG(dd_delta)
                    FROM match_stats_map msm
                    JOIN matches m ON msm.match_id=m.id
                    WHERE msm.player_id=%s AND m.status='completed' AND {sf}
                """, (pid, season, season) if season != 'all' else (pid,))
                agg = cursor.fetchone()
                (maps, acs, k, d, a, adr, kast, hs,
                 fk, fd, mk, dd) = (v or 0 for v in agg)

                # Top agents
                cursor.execute(f"""
                    SELECT agent, COUNT(*) as c, AVG(acs), AVG(kills), AVG(deaths)
                    FROM match_stats_map msm JOIN matches m ON msm.match_id=m.id
                    WHERE msm.player_id=%s AND m.status='completed' AND {sf}
                    GROUP BY agent ORDER BY c DESC LIMIT 3
                """, (pid, season, season) if season != 'all' else (pid,))
                agents = cursor.fetchall()

                # Recent matches
                cursor.execute(f"""
                    SELECT m.week, t1.tag, t2.tag, msm.acs, msm.kills, msm.deaths,
                           msm.agent, msm.clutches,
                           CASE WHEN m.winner_id=msm.team_id THEN true ELSE false END as won
                    FROM match_stats_map msm
                    JOIN matches m ON msm.match_id=m.id
                    JOIN teams t1 ON m.team1_id=t1.id
                    JOIN teams t2 ON m.team2_id=t2.id
                    WHERE msm.player_id=%s AND m.status='completed' AND {sf}
                    ORDER BY m.id DESC LIMIT 5
                """, (pid, season, season) if season != 'all' else (pid,))
                recent = cursor.fetchall()

            kd  = k / max(d, 1)
            arch = determine_archetype(fk, maps, kast, a)
            rank_icon = _rank_icon(prank)

            # Discord avatar
            avatar_url = await _fetch_discord_avatar(self.bot, puuid)

            embed = discord.Embed(
                title=f"{'<@'+puuid+'>' if puuid else pname}",
                color=V_TEAL
            )
            if avatar_url:
                embed.set_thumbnail(url=avatar_url)

            # Header
            team_str = f"**{tname}** `[{ttag}]`" if tname else "*Free Agent*"
            embed.description = (
                f"### {pname}\n"
                f"🏷️ **Riot ID:** `{rid or 'N/A'}`\n"
                f"{rank_icon} **Rank:** `{prank or 'Unranked'}`\n"
                f"🛡️ **Team:** {team_str}\n"
                f"🧬 **Archetype:** `{arch}`\n"
                f"🗓️ Season **{season}** · `{int(maps)}` maps played"
            )

            # Combat block
            embed.add_field(
                name="⚔️ Combat Stats",
                value=(
                    f"```\n"
                    f"ACS   {round(acs,1):>6}   {_pct_bar(acs, 350)}\n"
                    f"K/D   {kd:>6.2f}   {_pct_bar(kd*50, 100)}\n"
                    f"ADR   {round(adr,1):>6}   {_pct_bar(adr, 200)}\n"
                    f"KAST  {round(kast,1):>5}%   {_pct_bar(kast)}\n"
                    f"HS%   {round(hs,1):>5}%   {_pct_bar(hs)}\n"
                    f"```"
                ),
                inline=False
            )

            # Impact & Objectives block
            embed.add_field(
                name="💥 Impact",
                value=(
                    f"First Kills `{int(fk)}` · First Deaths `{int(fd)}`\n"
                    f"Multi-kills `{int(mk)}` · DD Delta `{round(dd, 1) if dd else '—'}`"
                ),
                inline=False
            )

            # Agent pool
            if agents:
                agent_lines = []
                for an, c, avg_acs, avg_k, avg_d in agents:
                    avg_kd = avg_k / max(avg_d, 1)
                    agent_lines.append(f"**{an}** · `{c}` maps · `{round(avg_acs)}` ACS · `{avg_kd:.2f}` K/D")
                embed.add_field(name="🎭 Agent Pool", value="\n".join(agent_lines), inline=False)

            # Recent form
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
            import traceback; traceback.print_exc()
            await interaction.followup.send(f"❌ Error: {str(e)}")

    # ── /team_info ───────────────────────────────────────────────────────────
    @app_commands.command(name="team_info", description="Look up team stats and roster")
    @app_commands.describe(name="Team name or tag", season="Season ID")
    @app_commands.autocomplete(name=team_autocomplete)
    async def team_info(self, interaction: discord.Interaction, name: str, season: str = None):
        await interaction.response.defer()
        if season is None: season = await run_in_executor(get_default_season)
        try:
            with get_conn() as conn:
                cursor = conn.cursor()
                cursor.execute(
                    "SELECT id,name,tag,group_name FROM teams WHERE name ILIKE %s OR tag ILIKE %s LIMIT 1",
                    (name, name))
                row = cursor.fetchone()
                if not row:
                    return await interaction.followup.send(f"❌ Team `{name}` not found.")
                tid, tname, ttag, tgroup = row

                # Roster
                if season == 'all':
                    cursor.execute(
                        "SELECT name,riot_id,uuid,rank FROM players WHERE default_team_id=%s", (tid,))
                else:
                    cursor.execute(
                        "SELECT p.name,p.riot_id,p.uuid,p.rank "
                        "FROM player_team_history pth JOIN players p ON pth.player_id=p.id "
                        "WHERE pth.team_id=%s AND pth.season_id=%s", (tid, season))
                roster = cursor.fetchall()
                if not roster and season != 'all':
                    cursor.execute(
                        "SELECT name,riot_id,uuid,rank FROM players WHERE default_team_id=%s", (tid,))
                    roster = cursor.fetchall()

                sf = "(m.season_id = %s OR (m.season_id IS NULL AND %s = 'S23'))" if season != 'all' else "1=1"

                # Match record
                cursor.execute(f"""
                    SELECT COUNT(*),
                           SUM(CASE WHEN m.winner_id=%s THEN 1 ELSE 0 END)
                    FROM matches m
                    WHERE (m.team1_id=%s OR m.team2_id=%s)
                    AND m.status='completed' AND {sf}
                """, (tid, tid, tid, season, season) if season != 'all' else (tid, tid, tid))
                played_row = cursor.fetchone()
                total_m, won_m = (played_row[0] or 0), (played_row[1] or 0)

                # Map pool
                cursor.execute(f"""
                    SELECT mm.map_name, COUNT(*) as p,
                           SUM(CASE WHEN m.winner_id=%s THEN 1 ELSE 0 END) as w
                    FROM match_maps mm JOIN matches m ON mm.match_id=m.id
                    WHERE (m.team1_id=%s OR m.team2_id=%s) AND {sf} AND m.status='completed'
                    GROUP BY mm.map_name ORDER BY p DESC
                """, (tid, tid, tid, season, season) if season != 'all' else (tid, tid, tid))
                maps_data = cursor.fetchall()

                # Team stats (aggregated player averages)
                cursor.execute(f"""
                    SELECT AVG(msm.acs), AVG(msm.kills::float/NULLIF(msm.deaths,0)),
                           AVG(msm.adr), AVG(msm.kast)
                    FROM match_stats_map msm
                    JOIN matches m ON msm.match_id=m.id
                    WHERE msm.team_id=%s AND m.status='completed' AND {sf}
                """, (tid, season, season) if season != 'all' else (tid,))
                team_stats = cursor.fetchone()

                # Recent results
                cursor.execute(f"""
                    SELECT m.week, t1.tag, t2.tag, m.score_t1, m.score_t2, m.winner_id, m.id
                    FROM matches m
                    JOIN teams t1 ON m.team1_id=t1.id
                    JOIN teams t2 ON m.team2_id=t2.id
                    WHERE (m.team1_id=%s OR m.team2_id=%s)
                    AND m.status='completed' AND {sf}
                    ORDER BY m.id DESC LIMIT 5
                """, (tid, tid, season, season) if season != 'all' else (tid, tid))
                recent = cursor.fetchall()

            wr = round(won_m / max(total_m, 1) * 100)
            wr_bar = _pct_bar(wr)
            t_acs, t_kd, t_adr, t_kast = [(v or 0) for v in (team_stats or (0,0,0,0))]

            embed = discord.Embed(
                title=f"🛡️ {tname}",
                description=(
                    f"**Tag:** `{ttag}` · **Group:** `{tgroup}`\n"
                    f"Season **{season}** · Record: `{won_m}W – {total_m-won_m}L`\n"
                    f"Win Rate: **{wr}%** `{wr_bar}`"
                ),
                color=V_BLUE
            )

            # Roster
            if roster:
                roster_lines = []
                for rname, riot_id, ruuid, rrank in roster:
                    ri = _rank_icon(rrank)
                    mention = f"<@{ruuid}>" if ruuid else f"**{rname}**"
                    roster_lines.append(f"{ri} {mention} `{riot_id or rname}`")
                embed.add_field(name="👥 Roster", value="\n".join(roster_lines), inline=False)

            # Team combat stats
            embed.add_field(
                name="⚔️ Team Averages",
                value=(
                    f"ACS `{round(t_acs)}` · K/D `{round(t_kd,2)}` · "
                    f"ADR `{round(t_adr)}` · KAST `{round(t_kast,1)}%`"
                ),
                inline=False
            )

            # Map pool
            if maps_data:
                map_lines = []
                for mn, p, w in maps_data:
                    map_wr = round(w / max(p, 1) * 100)
                    bar = _pct_bar(map_wr)
                    color = "🟢" if map_wr >= 50 else "🔴"
                    map_lines.append(f"{color} **{mn}**: `{map_wr}%` `{bar}` `{w}-{p-w}`")
                embed.add_field(name="🗺️ Map Pool", value="\n".join(map_lines), inline=False)

            # Recent form
            if recent:
                form_lines = []
                for wk, t1, t2, s1, s2, wid, mid in recent:
                    won = wid == tid
                    result = "🟢 W" if won else "🔴 L"
                    opp = t2 if t1 == ttag else t1
                    form_lines.append(f"{result} W{wk}: vs `{opp}` `{s1}-{s2}` · Match `#{mid}`")
                embed.add_field(name="🕹️ Recent Form", value="\n".join(form_lines), inline=False)

            embed.set_footer(text="Use /map_analytics for full map charts")
            await interaction.followup.send(embed=embed)
        except Exception as e:
            import traceback; traceback.print_exc()
            await interaction.followup.send(f"❌ Error: {str(e)}")

    # ── /compare_players ─────────────────────────────────────────────────────
    @app_commands.command(name="compare_players", description="Head-to-head player stat comparison")
    @app_commands.autocomplete(player1=player_autocomplete, player2=player_autocomplete)
    async def compare_players(self, interaction: discord.Interaction,
                              player1: str, player2: str, season: str = None):
        await interaction.response.defer()
        if season is None: season = await run_in_executor(get_default_season)
        try:
            with get_conn() as conn:
                cursor = conn.cursor()
                p_data = []
                for n in [player1, player2]:
                    m = re.match(r"^<@!?(\d+)>$", n.strip())
                    if m: cursor.execute("SELECT id,name,uuid FROM players WHERE uuid=%s LIMIT 1", (m.group(1),))
                    else:  cursor.execute("SELECT id,name,uuid FROM players WHERE name ILIKE %s OR riot_id ILIKE %s LIMIT 1", (n, n))
                    r = cursor.fetchone()
                    if not r: return await interaction.followup.send(f"❌ Player `{n}` not found.")
                    p_data.append(r)

                sf = "(m.season_id = %s OR (m.season_id IS NULL AND %s = 'S23'))" if season != 'all' else "1=1"
                stats = []
                for pid, _, _ in p_data:
                    cursor.execute(f"""
                        SELECT COUNT(*), AVG(acs), SUM(kills), SUM(deaths), AVG(adr),
                               AVG(kast), AVG(hs_pct), SUM(fk)
                        FROM match_stats_map msm JOIN matches m ON msm.match_id=m.id
                        WHERE msm.player_id=%s AND m.status='completed' AND {sf}
                    """, (pid, season, season) if season != 'all' else (pid,))
                    stats.append(cursor.fetchone())

            def _unpack(s): return [v or 0 for v in s]
            m1, acs1, k1, d1, adr1, kast1, hs1, fk1 = _unpack(stats[0])
            m2, acs2, k2, d2, adr2, kast2, hs2, fk2 = _unpack(stats[1])
            kd1, kd2 = k1/max(d1,1), k2/max(d2,1)

            def _cmp(v1, v2, fmt="{:.1f}"):
                s1 = fmt.format(v1); s2 = fmt.format(v2)
                return (f"**{s1}** ✅", s2) if v1 > v2 else (s1, f"**{s2}** ✅") if v2 > v1 else (s1, s2)

            n1, n2 = p_data[0][1], p_data[1][1]
            u1, u2 = p_data[0][2], p_data[1][2]

            embed = discord.Embed(
                title=f"⚔️ Player Comparison  ·  Season {season}",
                color=V_PURPLE
            )
            rows = [
                ("Maps Played",  m1,    m2,    "{:.0f}"),
                ("ACS",          acs1,  acs2,  "{:.1f}"),
                ("K/D",          kd1,   kd2,   "{:.2f}"),
                ("ADR",          adr1,  adr2,  "{:.1f}"),
                ("KAST",         kast1, kast2, "{:.1f}%".replace("%", "")),
                ("HS%",          hs1,   hs2,   "{:.1f}%".replace("%", "")),
                ("First Kills",  fk1,   fk2,   "{:.0f}"),
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
            embed.add_field(name=head1,        value="\n".join(col1_vals), inline=True)
            embed.add_field(name=head2,        value="\n".join(col2_vals), inline=True)
            embed.set_footer(text="✅ = winner of that category")
            await interaction.followup.send(embed=embed)
        except Exception as e:
            await interaction.followup.send(f"❌ Error: {str(e)}")

    # ── /compare_teams ───────────────────────────────────────────────────────
    @app_commands.command(name="compare_teams", description="Head-to-head team comparison")
    @app_commands.autocomplete(team1=team_autocomplete, team2=team_autocomplete)
    async def compare_teams(self, interaction: discord.Interaction,
                            team1: str, team2: str, season: str = None):
        await interaction.response.defer()
        if season is None: season = await run_in_executor(get_default_season)
        try:
            with get_conn() as conn:
                cursor = conn.cursor()
                t_data = []
                for n in [team1, team2]:
                    cursor.execute("SELECT id,name,tag FROM teams WHERE name ILIKE %s OR tag ILIKE %s LIMIT 1", (n,n))
                    r = cursor.fetchone()
                    if not r: return await interaction.followup.send(f"❌ Team `{n}` not found.")
                    t_data.append(r)

                sf = "(m.season_id = %s OR (m.season_id IS NULL AND %s = 'S23'))" if season != 'all' else "1=1"
                records = []
                for tid, _, _ in t_data:
                    cursor.execute(f"""
                        SELECT mm.map_name, COUNT(*),
                               SUM(CASE WHEN m.winner_id=%s THEN 1 ELSE 0 END)
                        FROM match_maps mm JOIN matches m ON mm.match_id=m.id
                        WHERE (m.team1_id=%s OR m.team2_id=%s) AND m.status='completed' AND {sf}
                        GROUP BY mm.map_name
                    """, (tid,tid,tid,season,season) if season!='all' else (tid,tid,tid))
                    rows = cursor.fetchall()
                    records.append({"p": sum(r[1] for r in rows), "w": sum(r[2] for r in rows)})

                # H2H
                cursor.execute(f"""
                    SELECT m.score_t1,m.score_t2,m.team1_id,m.team2_id
                    FROM matches m
                    WHERE ((m.team1_id=%s AND m.team2_id=%s) OR (m.team1_id=%s AND m.team2_id=%s))
                    AND m.status='completed' AND {sf}
                """, (t_data[0][0],t_data[1][0],t_data[1][0],t_data[0][0],season,season) if season!='all'
                  else (t_data[0][0],t_data[1][0],t_data[1][0],t_data[0][0]))
                h2h = cursor.fetchall()

            wr1 = round(records[0]['w']/max(records[0]['p'],1)*100,1)
            wr2 = round(records[1]['w']/max(records[1]['p'],1)*100,1)
            n1, n2 = t_data[0][1], t_data[1][1]

            def _tc(v1, v2, fmt="{:.1f}"):
                s1=fmt.format(v1); s2=fmt.format(v2)
                return (f"**{s1}** ✅", s2) if v1>v2 else (s1, f"**{s2}** ✅") if v2>v1 else (s1,s2)

            embed = discord.Embed(
                title=f"⚔️ Team Comparison  ·  Season {season}",
                color=V_GOLD
            )
            rows_d = [
                ("Maps Played", records[0]['p'], records[1]['p'], "{:.0f}"),
                ("Maps Won",    records[0]['w'], records[1]['w'], "{:.0f}"),
                ("Win Rate",    wr1,             wr2,             "{:.1f}%".replace("%","")),
            ]
            metrics, c1v, c2v = [], [], []
            for label, v1, v2, fmt in rows_d:
                c1, c2 = _tc(float(v1), float(v2), fmt)
                metrics.append(f"`{label}`"); c1v.append(c1); c2v.append(c2)

            embed.add_field(name="📊 Metric", value="\n".join(metrics), inline=True)
            embed.add_field(name=f"🛡️ {n1}",  value="\n".join(c1v), inline=True)
            embed.add_field(name=f"🛡️ {n2}",  value="\n".join(c2v), inline=True)

            if h2h:
                t1w = sum(1 for s1,s2,id1,id2 in h2h if (id1==t_data[0][0] and s1>s2) or (id2==t_data[0][0] and s2>s1))
                embed.add_field(
                    name="🤜 Head to Head",
                    value=f"`{len(h2h)}` matches played\n**{n1}**: {t1w} wins · **{n2}**: {len(h2h)-t1w} wins",
                    inline=False
                )
            embed.set_footer(text="✅ = winner of that category")
            await interaction.followup.send(embed=embed)
        except Exception as e:
            await interaction.followup.send(f"❌ Error: {str(e)}")

    # ── /elo ─────────────────────────────────────────────────────────────────
    @app_commands.command(name="elo", description="Show a player's Skipio ELO rating")
    @app_commands.describe(name="Player name or mention", season="Season ID (e.g. S24 or all)")
    @app_commands.autocomplete(name=player_autocomplete, season=season_autocomplete)
    async def elo(self, interaction: discord.Interaction, name: str, season: str = 'S24'):
        await interaction.response.defer()
        try:
            with get_conn() as conn:
                if not conn: return await interaction.followup.send("❌ DB Error.")
                cursor = conn.cursor()
                
                # Identify player
                pid_match = re.search(r'ID:\s*(\d+)', name)
                mention_match = re.search(r'<@!?(\d+)>', name)
                if pid_match:
                    cursor.execute("SELECT id, name, riot_id, rank, uuid FROM players WHERE id=%s", (pid_match.group(1),))
                elif mention_match:
                    cursor.execute("SELECT id, name, riot_id, rank, uuid FROM players WHERE uuid=%s", (mention_match.group(1),))
                else:
                    cursor.execute("SELECT id, name, riot_id, rank, uuid FROM players WHERE name ILIKE %s OR riot_id ILIKE %s", (name, name))
                
                player = cursor.fetchone()
                if not player:
                    return await interaction.followup.send(f"❌ Player not found.")
                
                p_id, p_name, p_riot, p_rank, p_uuid = player
                
                p_history, all_apps = self._calculate_skipio_elos(cursor, season)
                
                elo_history = p_history.get(p_id, [])
                maps_played = len(elo_history)
                current_elo = elo_history[-1] if elo_history else 1000
                
                # Trend
                trend_str = ""
                if len(elo_history) >= 2:
                    diff = elo_history[-1] - elo_history[-2]
                    if diff != 0:
                        trend_str = f" ({'🟢 +' if diff > 0 else '🔴 '}{diff})"

                # Avg Raw
                my_raws = [row[2] for row in all_apps if row[0] == p_id]
                avg_raw = sum(my_raws)/len(my_raws) if my_raws else 0
                
            def get_tier(e):
                if e >= 1400: return "🔥 Godlike"
                if e >= 1200: return "💎 Elite"
                if e >= 1050: return "🟢 Strong"
                if e >= 950:  return "⚪ Baseline"
                if e >= 850:  return "🟠 Below Average"
                return "🔴 Struggling"

            embed = discord.Embed(
                title=f"⚡ Skipio ELO Rating" + (f" · `{season}`" if season != 'all' else " · `All Time`"),
                color=V_BLUE
            )
            embed.add_field(name="Player", value=f"**{p_name}** `{p_riot}`\n{_rank_icon(p_rank)} `{p_rank or 'Unranked'}`", inline=True)
            embed.add_field(name="Current ELO", value=f"## {current_elo}{trend_str}", inline=True)
            embed.add_field(name="Performance", value=f"**{get_tier(current_elo)}**", inline=True)
            embed.add_field(name="Maps Played", value=f"`{maps_played}`", inline=True)
            embed.add_field(name="Avg Raw Score", value=f"`{round(avg_raw, 1)}`", inline=True)
            
            embed.set_footer(text="A blended average of your global rank peer comparison and match lobby comparison.")
            
            avatar = await _fetch_discord_avatar(self.bot, p_uuid)
            if avatar:
                embed.set_thumbnail(url=avatar)
                
            await interaction.followup.send(embed=embed)
        except Exception as e:
            await interaction.followup.send(f"❌ Error: {str(e)}")

    # ── /skipio-leaderboard ──────────────────────────────────────────────────
    @app_commands.command(name="skipio-leaderboard", description="Show top players by Skipio ELO rating")
    @app_commands.describe(rank="Filter by rank tier", season="Season ID", min_games="Min maps played")
    @app_commands.autocomplete(rank=rank_autocomplete, season=season_autocomplete)
    async def skipio_leaderboard(self, interaction: discord.Interaction, rank: str = None, season: str = 'S24', min_games: int = 3):
        await interaction.response.defer()
        try:
            with get_conn() as conn:
                if not conn: return await interaction.followup.send("❌ DB Error.")
                cursor = conn.cursor()
                
                # Fetch target players
                rank_filter = "WHERE rank ILIKE %s" if rank else ""
                cursor.execute(f"SELECT id, name, riot_id, rank FROM players {rank_filter}", (f"%{rank}%",) if rank else ())
                players_list = cursor.fetchall()
                p_data = {r[0]: (r[1], r[2], r[3]) for r in players_list}
                
                p_history, _ = self._calculate_skipio_elos(cursor, season)
                
                final_leaderboard = []
                for pid, history in p_history.items():
                    if pid not in p_data: continue
                    if len(history) < min_games: continue
                    
                    name, rid, prank = p_data[pid]
                    final_leaderboard.append({
                        'name': name, 'rank': prank, 
                        'elo': history[-1], 'maps': len(history)
                    })
                
                final_leaderboard.sort(key=lambda x: x['elo'], reverse=True)
                top_10 = final_leaderboard[:10]
                
            if not top_10:
                return await interaction.followup.send("❌ No players found matching those criteria.")

            embed = discord.Embed(
                title=f"🏆 Skipio Leaderboard" + (f" · `{season}`" if season != 'all' else " · `All Time`"),
                description=f"Filter: `{rank or 'All'}` · Min Maps: `{min_games}`",
                color=V_BLUE
            )
            
            medals = ["🥇","🥈","🥉"]
            for i, p in enumerate(top_10, 1):
                medal = medals[i-1] if i <= 3 else f"`{i}.`"
                embed.add_field(
                    name=f"{medal} {p['name']}  {_rank_icon(p['rank'])} `{p['rank'] or '—'}`",
                    value=f"ELO: **{round(p['elo'])}**  ·  Maps: `{p['maps']}`",
                    inline=False
                )
            
            await interaction.followup.send(embed=embed)
        except Exception as e:
            await interaction.followup.send(f"❌ Error: {str(e)}")


async def setup(bot):
    await bot.add_cog(AnalyticsCog(bot))
