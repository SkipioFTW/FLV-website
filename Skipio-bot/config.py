import os
import sys
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# --- CONFIGURATION ---
DISCORD_TOKEN = os.getenv("DISCORD_TOKEN")
GUILD_ID = os.getenv("GUILD_ID", None) 
if GUILD_ID:
    try:
        GUILD_ID = int(GUILD_ID)
    except ValueError:
        GUILD_ID = None

DB_URL = os.getenv("SUPABASE_DB_URL") or os.getenv("DB_CONNECTION_STRING")
PORTAL_URL = os.getenv("PORTAL_URL", "https://valorant-portal.vercel.app")

# Shared secret for authenticated portal API calls (/api/admin/maps/parse & /save).
# Must match BOT_SECRET on the portal deployment. Required for /report_match.
BOT_SECRET = os.getenv("BOT_SECRET")

# Optional: comma-separated Discord role IDs allowed to use /report_match.
# If empty, anyone can use the command (player detection still gates saves).
REPORT_ROLE_IDS = [
    int(r) for r in os.getenv("REPORT_ROLE_IDS", "").replace(" ", "").split(",")
    if r.strip().isdigit()
]

# Ensure tokens exist
if not DISCORD_TOKEN:
    print("\n" + "="*50)
    print("❌ ERROR: DISCORD_TOKEN NOT FOUND")
    print("="*50)
    print("Please check your .env file")
    print("="*50 + "\n")
    sys.exit(1)
