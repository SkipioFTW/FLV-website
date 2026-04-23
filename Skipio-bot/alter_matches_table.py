import psycopg2
from dotenv import load_dotenv
import os

load_dotenv()
db_url = os.getenv('SUPABASE_DB_URL')
if not db_url:
    print("Error: SUPABASE_DB_URL not found in environment.")
    exit(1)

try:
    conn = psycopg2.connect(db_url)
    conn.autocommit = True
    cursor = conn.cursor()
    print("Connected to database. Adding column...")
    
    cursor.execute("ALTER TABLE matches ADD COLUMN IF NOT EXISTS tracker_ids TEXT[] DEFAULT '{}';")
    print("Column 'tracker_ids' added successfully.")
    
    conn.close()
except Exception as e:
    print(f"Database error: {e}")
