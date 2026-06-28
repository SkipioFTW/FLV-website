import discord
from utils.helpers import run_in_executor
from utils.charts import (
    generate_player_chart, generate_match_economy_chart,
    generate_team_map_chart, generate_radar_chart
)
from ui.embeds import get_match_overview_embed, get_match_performance_embed, get_match_rounds_embed
from utils.design import C_RED

# ── Chart Controls (Player Trends) ────────────────────────────────────────────
_CHART_TYPE_MAP = {
    "acs_btn":   "acs",
    "kd_btn":    "kd",
    "adr_btn":   "adr",
    "radar_btn": "radar",
}


class ChartControls(discord.ui.View):
    def __init__(self, player_id, season, current_type="acs"):
        super().__init__(timeout=300)
        self.player_id = player_id
        self.season = season
        self.current_type = current_type
        # Initialise _chart_type on each button so _update_button_styles works on first call
        for child in self.children:
            if isinstance(child, discord.ui.Button):
                child._chart_type = _CHART_TYPE_MAP.get(child.callback.__name__, "")
        self._update_button_styles()

    def _update_button_styles(self):
        for child in self.children:
            if isinstance(child, discord.ui.Button) and hasattr(child, '_chart_type'):
                child.style = (discord.ButtonStyle.primary
                               if child._chart_type == self.current_type
                               else discord.ButtonStyle.secondary)

    async def _render(self, interaction: discord.Interaction):
        try:
            if self.current_type == "radar":
                file, embed = await run_in_executor(generate_radar_chart, self.player_id, self.season)
            else:
                file, embed = await run_in_executor(generate_player_chart, self.player_id, self.season, self.current_type)
            if not file:
                return await interaction.response.send_message("❌ No data available.", ephemeral=True)
            self._update_button_styles()
            await interaction.response.edit_message(attachments=[file], embed=embed, view=self)
        except Exception as e:
            import traceback; traceback.print_exc()
            await interaction.response.send_message(f"❌ Chart error: {str(e)}", ephemeral=True)


    @discord.ui.button(label="📈 ACS", style=discord.ButtonStyle.primary)
    async def acs_btn(self, interaction: discord.Interaction, button: discord.ui.Button):
        self.current_type = "acs"; button._chart_type = "acs"
        await self._render(interaction)

    @discord.ui.button(label="⚔️ K/D", style=discord.ButtonStyle.danger)
    async def kd_btn(self, interaction: discord.Interaction, button: discord.ui.Button):
        self.current_type = "kd"; button._chart_type = "kd"
        await self._render(interaction)

    @discord.ui.button(label="💥 ADR", style=discord.ButtonStyle.secondary)
    async def adr_btn(self, interaction: discord.Interaction, button: discord.ui.Button):
        self.current_type = "adr"; button._chart_type = "adr"
        await self._render(interaction)

    @discord.ui.button(label="⬡ Pentagon", style=discord.ButtonStyle.success)
    async def radar_btn(self, interaction: discord.Interaction, button: discord.ui.Button):
        self.current_type = "radar"; button._chart_type = "radar"
        await self._render(interaction)


# ── Match Flow View ───────────────────────────────────────────────────────────
class MatchFlowView(discord.ui.View):
    TAB_LABELS = {
        "overview":    "📊 Overview",
        "economy":     "💰 Economy",
        "performance": "⭐ Performance",
        "rounds":      "🧩 Rounds",
    }

    def __init__(self, match_id):
        super().__init__(timeout=300)
        self.match_id = match_id
        self.current_tab = "overview"

    def _btn_style(self, tab_key):
        return discord.ButtonStyle.primary if self.current_tab == tab_key else discord.ButtonStyle.secondary

    def _sync_button_styles(self):
        _tab_map = {
            "overview_btn": "overview",
            "economy_btn":  "economy",
            "perf_btn":     "performance",
            "rounds_btn":   "rounds",
        }
        for child in self.children:
            if isinstance(child, discord.ui.Button):
                tab = _tab_map.get(child.callback.__name__)
                if tab:
                    child.style = self._btn_style(tab)

    async def _render(self, interaction: discord.Interaction):
        self._sync_button_styles()
        tab = self.current_tab
        if tab == "overview":
            embed = await run_in_executor(get_match_overview_embed, self.match_id)
            await interaction.response.edit_message(attachments=[], embed=embed, view=self)
        elif tab == "economy":
            file, embed = await run_in_executor(generate_match_economy_chart, self.match_id)
            if file:
                await interaction.response.edit_message(attachments=[file], embed=embed, view=self)
            else:
                embed = discord.Embed(description="❌ No economy data for this match.", color=C_RED)
                await interaction.response.edit_message(attachments=[], embed=embed, view=self)
        elif tab == "performance":
            embed = await run_in_executor(get_match_performance_embed, self.match_id)
            await interaction.response.edit_message(attachments=[], embed=embed, view=self)
        elif tab == "rounds":
            embed = await run_in_executor(get_match_rounds_embed, self.match_id)
            await interaction.response.edit_message(attachments=[], embed=embed, view=self)

    @discord.ui.button(label="📊 Overview", style=discord.ButtonStyle.primary)
    async def overview_btn(self, interaction: discord.Interaction, button: discord.ui.Button):
        self.current_tab = "overview"
        await self._render(interaction)

    @discord.ui.button(label="💰 Economy", style=discord.ButtonStyle.secondary)
    async def economy_btn(self, interaction: discord.Interaction, button: discord.ui.Button):
        self.current_tab = "economy"
        await self._render(interaction)

    @discord.ui.button(label="⭐ Performance", style=discord.ButtonStyle.secondary)
    async def perf_btn(self, interaction: discord.Interaction, button: discord.ui.Button):
        self.current_tab = "performance"
        await self._render(interaction)

    @discord.ui.button(label="🧩 Rounds", style=discord.ButtonStyle.secondary)
    async def rounds_btn(self, interaction: discord.Interaction, button: discord.ui.Button):
        self.current_tab = "rounds"
        await self._render(interaction)
