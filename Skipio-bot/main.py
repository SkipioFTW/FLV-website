import logging
import asyncio
import discord
from discord.ext import commands
from config import DISCORD_TOKEN

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)-8s %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)

COGS = [
    'cogs.lifecycle',
    'cogs.analytics',
    'cogs.players',
    'cogs.teams',
    'cogs.elo_commands',
    'cogs.matches',
    'cogs.match_report',
    'cogs.ai',
]


class MyBot(commands.Bot):
    def __init__(self):
        intents = discord.Intents.default()
        intents.message_content = True
        super().__init__(command_prefix="!", intents=intents)

    async def setup_hook(self):
        for cog in COGS:
            try:
                await self.load_extension(cog)
                logger.info("Loaded extension: %s", cog)
            except Exception as e:
                logger.error("Failed to load extension %s: %s", cog, e)
        
        # After all cogs are loaded, trigger the sync
        lifecycle = self.get_cog("LifecycleCog")
        if lifecycle:
            await lifecycle.sync_commands()

async def main():
    bot = MyBot()
    async with bot:
        await bot.start(DISCORD_TOKEN)


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        pass
