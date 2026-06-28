import logging
import re
import discord
from discord.ext import commands
from discord import app_commands
from database import get_conn, get_default_season
from utils.helpers import run_in_executor
from utils.autocomplete import player_autocomplete, rank_autocomplete, season_autocomplete
from utils.formatting import rank_icon, fetch_discord_avatar
from utils.elo import calculate_skipio_elos
from utils.design import C_BLUE

logger = logging.getLogger(__name__)


def _elo_tier(elo: int) -> str:
    if elo >= 1400:
        return "🔥 Godlike"
    if elo >= 1200:
        return "💎 Elite"
    if elo >= 1050:
        return "🟢 Strong"
    if elo >= 950:
        return "⚪ Baseline"
    if elo >= 850:
        return "🟠 Below Average"
    return "🔴 Struggling"


class EloCog(commands.Cog):
    def __init__(self, bot):
        self.bot = bot

    # ── /elo ─────────────────────────────────────────────────────────────────
    @app_commands.command(name="elo", description="Show a player's Skipio ELO rating")
    @app_commands.describe(name="Player name or mention", season="Season ID (e.g. S24 or all)")
    @app_commands.autocomplete(name=player_autocomplete, season=season_autocomplete)
    async def elo(self, interaction: discord.Interaction, name: str, season: str = None):
        await interaction.response.defer()
        if season is None:
            season = await run_in_executor(get_default_season)
        try:
            with get_conn() as conn:
                cursor = conn.cursor()
                pid_match = re.search(r'ID:\s*(\d+)', name)
                mention_match = re.search(r'<@!?(\d+)>', name)
                if pid_match:
                    cursor.execute(
                        "SELECT id, name, riot_id, rank, uuid FROM players WHERE id = %s",
                        (pid_match.group(1),)
                    )
                elif mention_match:
                    cursor.execute(
                        "SELECT id, name, riot_id, rank, uuid FROM players WHERE uuid = %s",
                        (mention_match.group(1),)
                    )
                else:
                    cursor.execute(
                        "SELECT id, name, riot_id, rank, uuid FROM players "
                        "WHERE name ILIKE %s OR riot_id ILIKE %s",
                        (name, name)
                    )
                player = cursor.fetchone()
                if not player:
                    return await interaction.followup.send("❌ Player not found.")
                p_id, p_name, p_riot, p_rank, p_uuid = player

                p_history, all_apps = calculate_skipio_elos(cursor, season)

            elo_history = p_history.get(p_id, [])
            current_elo = elo_history[-1] if elo_history else 1000
            trend_str = ""
            if len(elo_history) >= 2:
                diff = elo_history[-1] - elo_history[-2]
                if diff != 0:
                    trend_str = f" ({'🟢 +' if diff > 0 else '🔴 '}{diff})"

            my_raws = [row[2] for row in all_apps if row[0] == p_id]
            avg_raw = sum(my_raws) / len(my_raws) if my_raws else 0

            embed = discord.Embed(
                title="⚡ Skipio ELO Rating" + (f" · `{season}`" if season != 'all' else " · `All Time`"),
                color=C_BLUE
            )
            embed.add_field(
                name="Player",
                value=f"**{p_name}** `{p_riot}`\n{rank_icon(p_rank)} `{p_rank or 'Unranked'}`",
                inline=True
            )
            embed.add_field(name="Current ELO", value=f"## {current_elo}{trend_str}", inline=True)
            embed.add_field(name="Performance", value=f"**{_elo_tier(current_elo)}**", inline=True)
            embed.add_field(name="Maps Played", value=f"`{len(elo_history)}`", inline=True)
            embed.add_field(name="Avg Raw Score", value=f"`{round(avg_raw, 1)}`", inline=True)
            embed.set_footer(text="Blended average of global rank-peer comparison and match lobby comparison.")

            avatar = await fetch_discord_avatar(self.bot, p_uuid)
            if avatar:
                embed.set_thumbnail(url=avatar)

            await interaction.followup.send(embed=embed)
        except Exception as e:
            logger.exception("elo failed for %s", name)
            await interaction.followup.send(f"❌ Error: {e}")

    # ── /skipio-leaderboard ───────────────────────────────────────────────────
    @app_commands.command(name="skipio-leaderboard", description="Show top players by Skipio ELO rating")
    @app_commands.describe(rank="Filter by rank tier", season="Season ID", min_games="Min maps played")
    @app_commands.autocomplete(rank=rank_autocomplete, season=season_autocomplete)
    async def skipio_leaderboard(self, interaction: discord.Interaction,
                                 rank: str = None, season: str = None, min_games: int = 3):
        await interaction.response.defer()
        if season is None:
            season = await run_in_executor(get_default_season)
        try:
            with get_conn() as conn:
                cursor = conn.cursor()
                rank_filter = "WHERE rank ILIKE %s" if rank else ""
                cursor.execute(
                    f"SELECT id, name, riot_id, rank FROM players {rank_filter}",
                    (f"%{rank}%",) if rank else ()
                )
                p_data = {r[0]: (r[1], r[2], r[3]) for r in cursor.fetchall()}
                p_history, _ = calculate_skipio_elos(cursor, season)

            leaderboard = []
            for pid, history in p_history.items():
                if pid not in p_data or len(history) < min_games:
                    continue
                p_name, _, p_rank = p_data[pid]
                leaderboard.append({"name": p_name, "rank": p_rank, "elo": history[-1], "maps": len(history)})

            leaderboard.sort(key=lambda x: x['elo'], reverse=True)
            top_10 = leaderboard[:10]

            if not top_10:
                return await interaction.followup.send("❌ No players found matching those criteria.")

            embed = discord.Embed(
                title="🏆 Skipio Leaderboard" + (f" · `{season}`" if season != 'all' else " · `All Time`"),
                description=f"Filter: `{rank or 'All'}` · Min Maps: `{min_games}`",
                color=C_BLUE
            )
            medals = ["🥇", "🥈", "🥉"]
            for i, p in enumerate(top_10, 1):
                medal = medals[i - 1] if i <= 3 else f"`{i}.`"
                embed.add_field(
                    name=f"{medal} {p['name']}  {rank_icon(p['rank'])} `{p['rank'] or '—'}`",
                    value=f"ELO: **{round(p['elo'])}**  ·  Maps: `{p['maps']}`",
                    inline=False
                )
            await interaction.followup.send(embed=embed)
        except Exception as e:
            logger.exception("skipio_leaderboard failed")
            await interaction.followup.send(f"❌ Error: {e}")


async def setup(bot):
    await bot.add_cog(EloCog(bot))
