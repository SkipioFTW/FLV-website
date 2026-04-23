from database import get_conn

def check_schema():
    with get_conn() as conn:
        cursor = conn.cursor()
        for table in ['match_stats_map', 'match_player_rounds']:
            print(f"\n--- Columns in {table} ---")
            cursor.execute(f"""
                SELECT column_name, data_type 
                FROM information_schema.columns 
                WHERE table_name = '{table}'
                ORDER BY ordinal_position;
            """)
            for col in cursor.fetchall():
                print(f"  {col[0]} ({col[1]})")

if __name__ == "__main__":
    check_schema()
