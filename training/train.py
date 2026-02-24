import os
import json
import time
import math
import tempfile
from collections import defaultdict
from supabase import create_client, Client

SUPABASE_URL = os.getenv("SUPABASE_URL") or os.getenv("NEXT_PUBLIC_SUPABASE_URL")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("NEXT_PUBLIC_SUPABASE_ANON_KEY")

if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
    env_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "new_app_repo", ".env.local")
    if not os.path.exists(env_path):
        env_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".env.local")
    if os.path.exists(env_path):
        with open(env_path, "r", encoding="utf-8") as f:
            for line in f:
                if "=" in line and not line.strip().startswith("#"):
                    k, v = line.strip().split("=", 1)
                    if k == "NEXT_PUBLIC_SUPABASE_URL": SUPABASE_URL = v.strip("'\" ")
                    if k == "SUPABASE_SERVICE_ROLE_KEY" or k == "NEXT_PUBLIC_SUPABASE_ANON_KEY": SUPABASE_SERVICE_ROLE_KEY = v.strip("'\" ")

def supabase_client() -> Client:
    if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
        raise RuntimeError("Missing Supabase credentials")
    return create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

def extract_team_summaries(sb: Client):
    summaries = {}
    
    # 1. Matches for Points
    res_m = sb.table("matches").select("team1_id, team2_id, winner_id, score_t1, score_t2").eq("status", "completed").execute()
    res_t = sb.table("teams").select("id, name").execute()
    
    for team in res_t.data:
        summaries[team['id']] = {
            "name": team['name'], "points": 0, "diff": 0, "rating_r": 0, 
            "strength_s": 0, "rating_b": 0, "match_count": 0
        }

    for m in res_m.data:
        t1, t2 = m['team1_id'], m['team2_id']
        s1, s2 = m.get('score_t1') or 0, m.get('score_t2') or 0
        w = m['winner_id']
        
        if t1 not in summaries or t2 not in summaries: continue

        diff1 = s1 - s2
        diff2 = s2 - s1
        summaries[t1]['diff'] += diff1
        summaries[t2]['diff'] += diff2
        summaries[t1]['match_count'] += 1
        summaries[t2]['match_count'] += 1
        
        if w == t1:
            summaries[t1]['points'] += 15
            summaries[t2]['points'] += min(s2, 12)
        elif w == t2:
            summaries[t2]['points'] += 15
            summaries[t1]['points'] += min(s1, 12)

    for sid, sdata in summaries.items():
        sdata['rating_r'] = sdata['points'] + 0.5 * sdata['diff']

    # 2. Player Data (S) + Deep Stats
    res_p = sb.table('players').select('id, default_team_id').not_.is_('default_team_id', 'null').execute()
    player_to_team = {p['id']: p['default_team_id'] for p in res_p.data}
    
    res_s = sb.table('match_stats_map').select('player_id, kills, deaths, acs, adr, kast, plants, defuses, clutches, survived').execute()
    
    team_pstats = {}
    for row in res_s.data:
        pid = row['player_id']
        if pid not in player_to_team: continue
        tid = player_to_team[pid]
        if tid not in team_pstats:
            team_pstats[tid] = {'k':0, 'd':0, 'acs':0, 'adr':0, 'kast':0, 'plants':0, 'defuses':0, 'clutches':0, 'survived':0, 'rounds':0}
            
        ts = team_pstats[tid]
        ts['k'] += row.get('kills') or 0
        ts['d'] += row.get('deaths') or 0
        ts['acs'] += row.get('acs') or 0
        ts['adr'] += row.get('adr') or 0
        ts['kast'] += row.get('kast') or 0
        ts['plants'] += row.get('plants') or 0
        ts['defuses'] += row.get('defuses') or 0
        ts['clutches'] += row.get('clutches') or 0
        ts['survived'] += row.get('survived') or 0
        ts['rounds'] += 1

    s_values = []
    for tid, ts in team_pstats.items():
        if ts['rounds'] == 0:
            if tid in summaries: summaries[tid]["strength_s"] = 0
            continue
        
        avg_acs = ts['acs'] / ts['rounds']
        avg_adr = ts['adr'] / ts['rounds']
        avg_kast = ts['kast'] / ts['rounds']
        avg_kd = ts['k'] / max(1, ts['d'])
        avg_plants = ts['plants'] / ts['rounds']
        avg_defuses = ts['defuses'] / ts['rounds']
        avg_clutch = ts['clutches'] / ts['rounds']
        avg_surv = ts['survived'] / ts['rounds']
        
        base_s = (avg_acs - 200) + 100*(avg_kd - 1) + 0.5*(avg_adr - 130) + 0.2*(avg_kast - 70) 
        deep_s = (avg_plants * 2.0) + (avg_defuses * 2.0) + (avg_clutch * 10.0) + (avg_surv * 1.5)
        
        s_val = base_s + deep_s
        if tid in summaries:
            summaries[tid]["strength_s"] = s_val
            s_values.append(s_val)

    # 3. Blended Rating (B)
    if len(s_values) > 1:
        s_mean = sum(s_values) / len(s_values)
        s_std = math.sqrt(sum((x - s_mean)**2 for x in s_values) / len(s_values))
        if s_std == 0: s_std = 1
        for t in summaries:
            z = (summaries[t]["strength_s"] - s_mean) / s_std
            summaries[t]["rating_b"] = summaries[t]["rating_r"] + 10 * z
    else:
        for t in summaries:
            summaries[t]["rating_b"] = summaries[t]["rating_r"]

    # Calculate historic accuracy
    correct = 0
    total = 0
    for m in res_m.data:
        t1, t2 = m['team1_id'], m['team2_id']
        winner = m['winner_id']
        if t1 in summaries and t2 in summaries and winner:
            b1 = summaries[t1]['rating_b']
            b2 = summaries[t2]['rating_b']
            pred = t1 if b1 > b2 else t2
            if pred == winner: correct += 1
            total += 1
            
    acc = correct / max(1, total)
    return summaries, acc

def main():
    sb = supabase_client()
    summaries, acc = extract_team_summaries(sb)

    model = {
        "type": "b_ratings",
        "alpha": 1.5,
        "std_x": 10.0,
        "teams": summaries,
        "version": "v3_old_logic"
    }
    
    scalers = {
        "type": "none",
    }
    
    metrics = {
        "accuracy": float(acc),
        "version": str(int(time.time())),
        "updatedAt": time.strftime("%Y-%m-%d %H:%M:%S"),
        "note": "Old prediction model R_S_B algorithmic logic"
    }

    def upload_json(path, obj):
        tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".json")
        try:
            tmp.write(json.dumps(obj).encode("utf-8"))
            tmp.flush()
            tmp.close()
            sb.storage.from_("models").upload(path, tmp.name, {"contentType": "application/json", "upsert": "true"})
        finally:
            try:
                os.remove(tmp.name)
            except:
                pass
                
    upload_json("current/model.json", model)
    upload_json("current/scalers.json", scalers)
    upload_json("current/metrics.json", metrics)
    print(f"Model trained and uploaded. Accuracy over {len(summaries)} teams: {acc*100:.1f}%")

if __name__ == "__main__":
    main()
