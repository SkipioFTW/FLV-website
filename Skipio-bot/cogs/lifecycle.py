import discord
from discord.ext import commands, tasks
from database import get_conn
from config import GUILD_ID

class LifecycleCog(commands.Cog):
    def __init__(self, bot):
        self.bot = bot

    @commands.Cog.listener()
    async def on_ready(self):
        print(f"InfoBot logged in as {self.bot.user}")
        if not self.keep_alive.is_running():
            self.keep_alive.start()

    @tasks.loop(seconds=60)
    async def keep_alive(self):
        """Background task to keep the database connection pool warm."""
        try:
            with get_conn() as conn:
                with conn.cursor() as cur:
                    cur.execute("SELECT 1")
        except:
            pass

    async def sync_commands(self):
        if GUILD_ID:
            guild = discord.Object(id=GUILD_ID)
            self.bot.tree.copy_global_to(guild=guild)
            self.bot.tree.clear_commands(guild=None)
            await self.bot.tree.sync(guild=None)
            await self.bot.tree.sync(guild=guild)
            print(f"InfoBot: Commands synced to guild {GUILD_ID} (Global scrubbed).")
        else:
            await self.bot.tree.sync()
            print("InfoBot: Commands synced globally.")

async def setup(bot):
    await bot.add_cog(LifecycleCog(bot))
