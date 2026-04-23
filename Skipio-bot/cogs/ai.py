import discord
from discord.ext import commands
from discord import app_commands
import re
import requests as http_requests
from database import get_conn, get_default_season
from utils.helpers import run_in_executor
from utils.autocomplete import player_autocomplete
from utils.charts import generate_player_chart, generate_radar_chart
from ui.views import ChartControls
from config import PORTAL_URL

def _post_ai_api(api_url, payload, headers):
    return http_requests.post(api_url, json=payload, headers=headers, timeout=30)

# Design tokens
V_RED   = 0xFF4655
V_BLUE  = 0x3FD1FF
V_TEAL  = 0x24FFAB


class AICog(commands.Cog):
    def __init__(self, bot):
        self.bot = bot

    @app_commands.command(name="ask_ai", description="Ask the AI Analyst a question about the tournament (Starts a thread)")
    @app_commands.describe(question="Your question about the league", season="Season ID (e.g. S23, S24, all)")
    @app_commands.checks.cooldown(1, 10, key=lambda i: i.user.id)
    async def ask_ai(self, interaction: discord.Interaction, question: str, season: str = None):
        await interaction.response.defer()
        if season is None: season = await run_in_executor(get_default_season)
        try:
            payload = {"message": question, "history": [], "seasonId": season}
            headers = {"Content-Type": "application/json"}
            api_url = f"{PORTAL_URL}/api/chat"
            response = http_requests.post(api_url, json=payload, headers=headers, timeout=30)
            if response.status_code == 200:
                data = response.json()
                ai_message = data.get("reply", "I am currently processing that information.")
                if len(ai_message) > 1900:
                    ai_message = ai_message[:1900] + "…"
                embed = discord.Embed(
                    title="🤖 AI Tournament Analyst",
                    description=ai_message,
                    color=V_RED
                )
                embed.set_footer(text=f"Requested by {interaction.user.display_name}  ·  Season {season}")
                msg = await interaction.followup.send(embed=embed, wait=True)
                # Create a thread for continuous chat
                try:
                    thread_name = f"AI: {question}"
                    if len(thread_name) > 90: thread_name = thread_name[:87] + "..."
                    await msg.create_thread(name=thread_name, auto_archive_duration=60)
                except Exception as e:
                    print(f"InfoBot: Failed to create AI thread: {e}")
            else:
                await interaction.followup.send(f"❌ AI API returned error: {response.status_code}")
        except Exception as e:
            await interaction.followup.send(f"❌ Error connecting to AI Analyst: {str(e)}")

    @commands.Cog.listener()
    async def on_message(self, message: discord.Message):
        if message.author.bot:
            return

        # Check if message is in an AI thread created by this bot
        if isinstance(message.channel, discord.Thread) and message.channel.owner_id == self.bot.user.id and message.channel.name.startswith("AI:"):
            async with message.channel.typing():
                try:
                    # Rebuild history from thread
                    raw_history = [msg async for msg in message.channel.history(limit=12, before=message)]
                    raw_history.reverse()

                    history_payload = []
                    for m in raw_history:
                        if not m.content and not m.embeds:
                            continue
                        
                        role = "assistant" if m.author.id == self.bot.user.id else "user"
                        content = m.content
                        if role == "assistant" and m.embeds and m.embeds[0].description:
                            content = m.embeds[0].description
                        
                        if content:
                            history_payload.append({"role": role, "content": content})

                    # Try to parse season from the original thread message footer
                    season = "S24"
                    try:
                        first_msg = await message.channel.parent.fetch_message(message.channel.id)
                        if first_msg.embeds and first_msg.embeds[0].footer and first_msg.embeds[0].footer.text:
                            m_match = re.search(r"Season (S\d+|all)", first_msg.embeds[0].footer.text)
                            if m_match: season = m_match.group(1)
                    except:
                        pass
                    
                    payload = {"message": message.content, "history": history_payload, "seasonId": season}
                    headers = {"Content-Type": "application/json"}
                    api_url = f"{PORTAL_URL}/api/chat"

                    response = await run_in_executor(_post_ai_api, api_url, payload, headers)

                    if response.status_code == 200:
                        data = response.json()
                        ai_message = data.get("reply", "I am currently processing that information.")
                        if len(ai_message) > 1900:
                            ai_message = ai_message[:1900] + "…"
                        
                        embed = discord.Embed(description=ai_message, color=V_RED)
                        await message.channel.send(embed=embed)
                    else:
                        await message.channel.send(f"❌ AI API returned error: {response.status_code}")
                except Exception as e:
                    await message.channel.send(f"❌ Error in AI Thread: {str(e)}")

    @app_commands.command(name="stats_chart", description="Generate interactive performance charts for a player")
    @app_commands.describe(name="Player name or @mention", season="Season ID")
    @app_commands.autocomplete(name=player_autocomplete)
    async def stats_chart(self, interaction: discord.Interaction, name: str, season: str = None):
        await interaction.response.defer()
        if season is None: season = await run_in_executor(get_default_season)
        try:
            mention_match = re.match(r"^<@!?(\d+)>$", name.strip())
            with get_conn() as conn:
                cursor = conn.cursor()
                if mention_match:
                    cursor.execute(
                        "SELECT id, name FROM players WHERE uuid = %s LIMIT 1",
                        (mention_match.group(1),))
                else:
                    cursor.execute(
                        "SELECT id, name FROM players WHERE name ILIKE %s OR riot_id ILIKE %s LIMIT 1",
                        (name, name))
                row = cursor.fetchone()
                if not row:
                    return await interaction.followup.send(f"❌ Player `{name}` not found.")
                pid, pname = row

            # Open with ACS trend chart
            file, embed = await run_in_executor(generate_player_chart, pid, season, "acs")
            if not file:
                return await interaction.followup.send(f"❌ No match data found for **{pname}** in season `{season}`.")

            view = ChartControls(pid, season, current_type="acs")
            await interaction.followup.send(file=file, embed=embed, view=view)

        except Exception as e:
            import traceback; traceback.print_exc()
            await interaction.followup.send(f"❌ Error: {str(e)}")


async def setup(bot):
    await bot.add_cog(AICog(bot))
