import asyncio
import functools

async def run_in_executor(func, *args):
    """Run a blocking function in an executor to prevent blocking the event loop."""
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(None, functools.partial(func, *args))

AGENT_ROLES = {
    "duelist": ["Jett", "Phoenix", "Raze", "Reyna", "Yoru", "Neon", "Iso", "Waylay"],
    "initiator": ["Sova", "Breach", "Skye", "KAY/O", "Fade", "Gekko", "Tejo"],
    "sentinel": ["Sage", "Cypher", "Killjoy", "Chamber", "Deadlock", "Vyse", "Veto"],
    "controller": ["Brimstone", "Viper", "Omen", "Astra", "Harbor", "Clove", "Miks"]
}

def determine_archetype(most_played_agent: str) -> str:
    """Algorithm to assign a player archetype based on most played agent."""
    if not most_played_agent:
        return "🧩 Flex"
    
    agent = most_played_agent.lower()
    for role, agents in AGENT_ROLES.items():
        if agent in [a.lower() for a in agents]:
            if role == "duelist": return "⚔️ Duelist"
            if role == "initiator": return "🏹 Initiator"
            if role == "sentinel": return "🛡️ Sentinel"
            if role == "controller": return "💨 Controller"
            
    return "🧩 Flex"
