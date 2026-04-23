import os
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

# Ensure tokens exist
if not DISCORD_TOKEN:
    print("\n" + "="*50)
    print("❌ ERROR: DISCORD_TOKEN NOT FOUND")
    print("="*50)
    print("Please check your .env file")
    print("="*50 + "\n")
