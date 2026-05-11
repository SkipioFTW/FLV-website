import os
import json
import pandas as pd
import numpy as np
from sklearn.linear_model import LogisticRegression
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import accuracy_score, roc_auc_score, log_loss
from supabase import create_client, Client
from dotenv import load_dotenv

# Try to load environment variables from .env.local
load_dotenv(".env.local")

SUPABASE_URL = os.getenv("SUPABASE_URL") or os.getenv("NEXT_PUBLIC_SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("NEXT_PUBLIC_SUPABASE_ANON_KEY")

RANK_MAP = {
    'Iron/Bronze': 2, 'Silver': 5, 'Gold': 8, 'Platinum': 11,
    'Diamond': 14, 'Ascendant': 17, 'Immortal 1/2': 20,
    'Immortal 3/Radiant': 23, 'Radiant': 25
}

def get_rank_value(rank_str):
    if not rank_str: return 10
    for k, v in RANK_MAP.items():
        if k.lower() in rank_str.lower(): return v
    return 10

def main():
    if not SUPABASE_URL or not SUPABASE_KEY:
        print("Missing Supabase credentials. Ensure SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set.")
        return

    sb = create_client(SUPABASE_URL, SUPABASE_KEY)
    print("Extracting data...")
    matches = sb.table("matches").select("*").eq("status", "completed").execute().data
    stats = []
    start = 0
    while True:
        res = sb.table("match_stats_map").select("*").range(start, start + 999).execute().data
        if not res: break
        stats.extend(res)
        start += 1000
    players = sb.table("players").select("*").execute().data
    
    df_matches = pd.DataFrame(matches).sort_values(['season_id', 'id'])
    df_stats = pd.DataFrame(stats)
    df_players = pd.DataFrame(players)
    
    player_history = {}
    team_history = {}
    features, labels, seasons = [], [], []

    print("Training model...")
    for _, match in df_matches.iterrows():
        mid, t1, t2, winner = match['id'], match['team1_id'], match['team2_id'], match['winner_id']
        if not winner: continue
        m_stats = df_stats[df_stats['match_id'] == mid]
        t1_pids = m_stats[m_stats['team_id'] == t1]['player_id'].unique()
        t2_pids = m_stats[m_stats['team_id'] == t2]['player_id'].unique()
        if len(t1_pids) == 0 or len(t2_pids) == 0: continue
        
        def get_roster(pids):
            acs, kd, rank, exp = [], [], [], []
            for pid in pids:
                p_info = df_players[df_players['id'] == pid]
                rv = get_rank_value(p_info['rank'].iloc[0] if not p_info.empty else None)
                rank.append(rv)
                h = player_history.get(pid, [])
                if h:
                    recent = h[-5:]
                    acs.append(np.mean([x['acs'] for x in recent]))
                    exp.append(len(h))
                    kd.append(sum([x['kills'] for x in recent]) / max(1, sum([x['deaths'] for x in recent])))
                else:
                    acs.append(140 + rv * 6); kd.append(0.4 + rv * 0.04); exp.append(0)
            return {'acs': np.mean(acs), 'kd': np.mean(kd), 'rank': np.mean(rank), 'exp': np.sum(exp)}
        
        def get_team(tid):
            h = team_history.get(tid, [])
            if not h: return {'wr': 0.5, 'form': 0.5, 'rd': 0}
            return {'wr': sum([1 for x in h if x['won']]) / len(h), 'form': sum([1 for x in h[-3:] if x['won']]) / len(h[-3:]), 'rd': np.mean([x['rd'] for x in h])}

        r1, r2 = get_roster(t1_pids), get_roster(t2_pids)
        tm1, tm2 = get_team(t1), get_team(t2)
        features.append([r1['acs']-r2['acs'], r1['kd']-r2['kd'], r1['rank']-r2['rank'], r1['exp']-r2['exp'], tm1['wr']-tm2['wr'], tm1['form']-tm2['form'], tm1['rd']-tm2['rd']])
        labels.append(1 if winner == t1 else 0)
        seasons.append(match['season_id'])

        for _, row in m_stats.iterrows():
            pid = row['player_id']
            if pid not in player_history: player_history[pid] = []
            player_history[pid].append({'acs': row['acs'], 'kills': row['kills'], 'deaths': row['deaths']})
        s1, s2 = match.get('score_t1', 0) or 0, match.get('score_t2', 0) or 0
        if t1 not in team_history: team_history[t1] = []
        team_history[t1].append({'won': winner == t1, 'rd': s1 - s2})
        if t2 not in team_history: team_history[t2] = []
        team_history[t2].append({'won': winner == t2, 'rd': s2 - s1})

    X, y = np.array(features), np.array(labels)
    scaler = StandardScaler()
    X_s = scaler.fit_transform(X)
    model = LogisticRegression().fit(X_s, y)
    
    # Save artifacts locally
    f_names = ["diff_acs", "diff_kd", "diff_rank", "diff_exp", "diff_wr", "diff_form", "diff_rd"]
    os.makedirs("training/output", exist_ok=True)
    with open("training/output/model.json", "w") as f: json.dump({"type": "logistic_v5", "intercept": float(model.intercept_[0]), "coefficients": model.coef_[0].tolist(), "feature_order": f_names, "version": "v5"}, f)
    with open("training/output/scalers.json", "w") as f: json.dump({"means": scaler.mean_.tolist(), "stds": scaler.scale_.tolist(), "feature_order": f_names}, f)
    
    cur_p = {pid: {'acs': float(np.mean([x['acs'] for x in h[-5:]])), 'kd': float(sum([x['kills'] for x in h[-5:]]) / max(1, sum([x['deaths'] for x in h[-5:]]))), 'exp': len(h)} for pid, h in player_history.items()}
    cur_t = {tid: {'wr': float(sum([1 for x in h if x['won']]) / len(h)), 'form': float(sum([1 for x in h[-3:] if x['won']]) / len(h[-3:])), 'rd': float(np.mean([x['rd'] for x in h]))} for tid, h in team_history.items()}
    with open("training/output/player_stats.json", "w") as f: json.dump(cur_p, f)
    with open("training/output/team_stats.json", "w") as f: json.dump(cur_t, f)
    print("Training finished.")

if __name__ == "__main__":
    main()
