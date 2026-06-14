import os
import json
import time
import warnings
import pandas as pd
import numpy as np
from sklearn.linear_model import LogisticRegressionCV
from sklearn.preprocessing import StandardScaler
from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score, roc_auc_score, log_loss
from supabase import create_client, Client
from dotenv import load_dotenv

# Try to load environment variables from .env.local
load_dotenv(".env.local")

# Regularization strengths to search over (smaller C = stronger L2 penalty).
# With ~270 matches and 12 features, an unregularized fit (C=1.0) overfits the
# 80/20 holdout; LogisticRegressionCV picks the best C via internal 5-fold CV.
LOGREG_CS = np.logspace(-3, 1, 20)

warnings.filterwarnings("ignore", category=FutureWarning, module="sklearn")

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

def history_mean(h, key, last_n=5):
    vals = [x[key] for x in h[-last_n:] if x.get(key) is not None]
    return float(np.mean(vals)) if vals else None

def upload_json(sb, path, obj):
    sb.storage.from_("models").upload(path, json.dumps(obj), {"content-type": "application/json", "upsert": "true"})

def main():
    if not SUPABASE_URL or not SUPABASE_KEY:
        print("Error: Missing Supabase credentials. Ensure NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or NEXT_PUBLIC_SUPABASE_ANON_KEY) are set in environment or .env.local")
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
            adr, kast, hs, entry, clutch = [], [], [], [], []
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

                adr_v = history_mean(h, 'adr')
                kast_v = history_mean(h, 'kast')
                hs_v = history_mean(h, 'hs_pct')
                entry_v = history_mean(h, 'entry')
                clutch_v = history_mean(h, 'clutches')
                adr.append(adr_v if adr_v is not None else 90 + rv * 4)
                kast.append(kast_v if kast_v is not None else 55 + rv * 1)
                hs.append(hs_v if hs_v is not None else 15 + rv * 1)
                entry.append(entry_v if entry_v is not None else 0)
                clutch.append(clutch_v if clutch_v is not None else 0)
            return {
                'acs': np.mean(acs), 'kd': np.mean(kd), 'rank': np.mean(rank), 'exp': np.sum(exp),
                'adr': np.mean(adr), 'kast': np.mean(kast), 'hs': np.mean(hs), 'entry': np.mean(entry), 'clutch_rate': np.mean(clutch)
            }

        def get_team(tid):
            h = team_history.get(tid, [])
            if not h: return {'wr': 0.5, 'form': 0.5, 'rd': 0}
            return {'wr': sum([1 for x in h if x['won']]) / len(h), 'form': sum([1 for x in h[-3:] if x['won']]) / len(h[-3:]), 'rd': np.mean([x['rd'] for x in h])}

        r1, r2 = get_roster(t1_pids), get_roster(t2_pids)
        tm1, tm2 = get_team(t1), get_team(t2)
        features.append([
            r1['acs']-r2['acs'], r1['kd']-r2['kd'], r1['rank']-r2['rank'], r1['exp']-r2['exp'],
            tm1['wr']-tm2['wr'], tm1['form']-tm2['form'], tm1['rd']-tm2['rd'],
            r1['adr']-r2['adr'], r1['kast']-r2['kast'], r1['hs']-r2['hs'], r1['entry']-r2['entry'], r1['clutch_rate']-r2['clutch_rate']
        ])
        labels.append(1 if winner == t1 else 0)
        seasons.append(match['season_id'])

        for _, row in m_stats.iterrows():
            pid = row['player_id']
            if pid not in player_history: player_history[pid] = []
            fk, fd = row.get('fk'), row.get('fd')
            entry_val = (fk - fd) if (pd.notna(fk) and pd.notna(fd)) else None
            player_history[pid].append({
                'acs': row['acs'], 'kills': row['kills'], 'deaths': row['deaths'],
                'adr': row.get('adr') if pd.notna(row.get('adr')) else None,
                'kast': row.get('kast') if pd.notna(row.get('kast')) else None,
                'hs_pct': row.get('hs_pct') if pd.notna(row.get('hs_pct')) else None,
                'entry': entry_val,
                'clutches': row.get('clutches') if pd.notna(row.get('clutches')) else None,
            })
        s1, s2 = match.get('score_t1', 0) or 0, match.get('score_t2', 0) or 0
        if t1 not in team_history: team_history[t1] = []
        team_history[t1].append({'won': winner == t1, 'rd': s1 - s2})
        if t2 not in team_history: team_history[t2] = []
        team_history[t2].append({'won': winner == t2, 'rd': s2 - s1})

    X, y = np.array(features), np.array(labels)
    if len(X) < 20:
        raise RuntimeError("Not enough completed matches with stats to train")

    f_names = [
        "diff_acs", "diff_kd", "diff_rank", "diff_exp", "diff_wr", "diff_form", "diff_rd",
        "diff_adr", "diff_kast", "diff_hs", "diff_entry", "diff_clutch"
    ]

    # Holdout split for honest accuracy/AUC/log-loss reporting
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, shuffle=True, random_state=42, stratify=y)
    eval_scaler = StandardScaler()
    X_train_s = eval_scaler.fit_transform(X_train)
    X_test_s = eval_scaler.transform(X_test)
    eval_model = LogisticRegressionCV(Cs=LOGREG_CS, cv=5, max_iter=2000, scoring='neg_log_loss').fit(X_train_s, y_train)
    y_pred = eval_model.predict(X_test_s)
    y_proba = eval_model.predict_proba(X_test_s)[:, 1]
    accuracy = accuracy_score(y_test, y_pred)
    try:
        auc = roc_auc_score(y_test, y_proba) if len(set(y_test)) > 1 else None
    except ValueError:
        auc = None
    logloss = log_loss(y_test, y_proba, labels=[0, 1])

    # Refit on the full dataset for the deployed artifacts
    scaler = StandardScaler()
    X_s = scaler.fit_transform(X)
    model = LogisticRegressionCV(Cs=LOGREG_CS, cv=5, max_iter=2000, scoring='neg_log_loss').fit(X_s, y)

    version = str(int(time.time()))
    updated_at = time.strftime("%Y-%m-%d %H:%M:%S")

    model_json = {
        "type": "logistic_v6",
        "intercept": float(model.intercept_[0]),
        "coefficients": model.coef_[0].tolist(),
        "feature_order": f_names,
        "version": version
    }
    scalers_json = {"means": scaler.mean_.tolist(), "stds": scaler.scale_.tolist(), "feature_order": f_names}
    metrics_json = {
        "accuracy": float(accuracy),
        "auc": float(auc) if auc is not None else None,
        "logLoss": float(logloss),
        "n_samples": int(len(X)),
        "n_train": int(len(X_train)),
        "n_test": int(len(X_test)),
        "C": float(model.C_[0]),
        "version": version,
        "updatedAt": updated_at
    }

    # Save artifacts locally
    os.makedirs("training/output", exist_ok=True)
    with open("training/output/model.json", "w") as f: json.dump(model_json, f)
    with open("training/output/scalers.json", "w") as f: json.dump(scalers_json, f)
    with open("training/output/metrics.json", "w") as f: json.dump(metrics_json, f)

    cur_p = {}
    for pid, h in player_history.items():
        p_info = df_players[df_players['id'] == pid]
        rv = get_rank_value(p_info['rank'].iloc[0] if not p_info.empty else None)
        recent = h[-5:]
        adr_v, kast_v, hs_v, entry_v, clutch_v = history_mean(h, 'adr'), history_mean(h, 'kast'), history_mean(h, 'hs_pct'), history_mean(h, 'entry'), history_mean(h, 'clutches')
        cur_p[pid] = {
            'acs': float(np.mean([x['acs'] for x in recent])),
            'kd': float(sum([x['kills'] for x in recent]) / max(1, sum([x['deaths'] for x in recent]))),
            'exp': len(h),
            'adr': adr_v if adr_v is not None else 90 + rv * 4,
            'kast': kast_v if kast_v is not None else 55 + rv * 1,
            'hs_pct': hs_v if hs_v is not None else 15 + rv * 1,
            'entry': entry_v if entry_v is not None else 0,
            'clutch_rate': clutch_v if clutch_v is not None else 0,
        }
    cur_t = {tid: {'wr': float(sum([1 for x in h if x['won']]) / len(h)), 'form': float(sum([1 for x in h[-3:] if x['won']]) / len(h[-3:])), 'rd': float(np.mean([x['rd'] for x in h]))} for tid, h in team_history.items()}
    with open("training/output/player_stats.json", "w") as f: json.dump(cur_p, f)
    with open("training/output/team_stats.json", "w") as f: json.dump(cur_t, f)

    print("Publishing artifacts to Supabase Storage...")
    upload_json(sb, "current/model.json", model_json)
    upload_json(sb, "current/scalers.json", scalers_json)
    upload_json(sb, "current/metrics.json", metrics_json)
    upload_json(sb, "current/player_stats.json", cur_p)
    upload_json(sb, "current/team_stats.json", cur_t)
    print("Training finished.")

if __name__ == "__main__":
    main()
