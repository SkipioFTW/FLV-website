import asyncio
import functools

async def run_in_executor(func, *args):
    """Run a blocking function in an executor to prevent blocking the event loop."""
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(None, functools.partial(func, *args))

def determine_archetype(fk: int, matches: int, kast: float, assists: int) -> str:
    """Algorithm to assign a player archetype based on stats."""
    maps_played = max(matches, 1)
    if (fk / maps_played) > 2.0 and kast > 70:
        return "⚔️ Entry Duelist"
    elif (assists / maps_played) > 5.0:
        return "🛡️ Support/Initiator"
    else:
        return "🧩 Flex"
