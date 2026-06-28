import logging
import discord
from discord.ext import commands, tasks
from database import get_conn
from config import GUILD_ID

logger = logging.getLogger(__name__)


class LifecycleCog(commands.Cog):
    def __init__(self, bot):
        self.bot = bot

    @commands.Cog.listener()
    async def on_ready(self):
        logger.info("Logged in as %s", self.bot.user)
        if not self.keep_alive.is_running():
            self.keep_alive.start()

    @tasks.loop(seconds=60)
    async def keep_alive(self):
        """Background task to keep the database connection pool warm."""
        try:
            with get_conn() as conn:
                with conn.cursor() as cur:
                    cur.execute("SELECT 1")
        except Exception as e:
            logger.warning("keep_alive DB ping failed: %s", e)

    async def sync_commands(self):
        if GUILD_ID:
            guild = discord.Object(id=GUILD_ID)
            self.bot.tree.copy_global_to(guild=guild)
            self.bot.tree.clear_commands(guild=None)
            await self.bot.tree.sync(guild=None)
            await self.bot.tree.sync(guild=guild)
            logger.info("Commands synced to guild %s (global scrubbed)", GUILD_ID)
        else:
            await self.bot.tree.sync()
            logger.info("Commands synced globally")


async def setup(bot):
    await bot.add_cog(LifecycleCog(bot))
