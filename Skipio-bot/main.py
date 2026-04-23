import discord
from discord.ext import commands
import asyncio
import os
from config import DISCORD_TOKEN

class MyBot(commands.Bot):
    def __init__(self):
        intents = discord.Intents.default()
        intents.message_content = True
        super().__init__(command_prefix="!", intents=intents)

    async def setup_hook(self):
        # Load all cogs first
        cogs = ['cogs.lifecycle', 'cogs.analytics', 'cogs.matches', 'cogs.ai']
        for cog in cogs:
            try:
                await self.load_extension(cog)
                print(f"Loaded extension: {cog}")
            except Exception as e:
                print(f"Failed to load extension {cog}: {e}")
        
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
