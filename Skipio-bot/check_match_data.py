from database import get_conn
import json

def check_match_data(match_id):
    with get_conn() as conn:
        cursor = conn.cursor()
        print(f"\n--- Stats for Match {match_id} ---")
        cursor.execute("""
            SELECT p.name, msm.plants, msm.defuses, msm.survived, msm.traded, 
                   msm.clutches, msm.clutches_details, msm.ability_casts
            FROM match_stats_map msm
            JOIN players p ON msm.player_id = p.id
            WHERE msm.match_id = %s
        """, (match_id,))
        for row in cursor.fetchall():
            print(f"Player: {row[0]}")
            print(f"  Plants: {row[1]}, Defuses: {row[2]}, Survived: {row[3]}, Traded: {row[4]}, Clutches: {row[5]}")
            print(f"  Clutch Details: {row[6]}")
            print(f"  Abilities: {row[7]}")

        print(f"\n--- Player Rounds for Match {match_id} (first 5) ---")
        cursor.execute("""
            SELECT round_number, p.name, weapon
            FROM match_player_rounds mpr
            JOIN players p ON mpr.player_id = p.id
            WHERE mpr.match_id = %s
            ORDER BY round_number, player_id LIMIT 5
        """, (match_id,))
        for row in cursor.fetchall():
            print(f"  R{row[0]} {row[1]}: Weapon={row[2]}")

if __name__ == "__main__":
    check_match_data(292)
