import discord

RANK_TIERS = {
    "Radiant": "🔺", "Immortal": "💜", "Ascendant": "💚",
    "Diamond": "💎", "Platinum": "🔷", "Gold": "🥇",
    "Silver": "🥈", "Bronze": "🥉", "Iron": "⬜",
}


def rank_icon(rank: str) -> str:
    if not rank:
        return "⬜"
    for tier, icon in RANK_TIERS.items():
        if tier.lower() in rank.lower():
            return icon
    return "🎯"


def pct_bar(val, max_val=100, width=8) -> str:
    v = min(100, max(0, float(val or 0) / float(max_val or 1) * 100))
    filled = round(v / 100 * width)
    return "█" * filled + "░" * (width - filled)


async def fetch_discord_avatar(bot: discord.Client, uuid: str) -> str | None:
    if not uuid:
        return None
    try:
        user = bot.get_user(int(uuid)) or await bot.fetch_user(int(uuid))
        return user.display_avatar.url if user else None
    except Exception:
        return None
