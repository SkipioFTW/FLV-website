import os
import json
import time
import pandas as pd
from collections import defaultdict, deque
from sklearn.preprocessing import StandardScaler
from sklearn.linear_model import LogisticRegression
from supabase import create_client, Client
import tempfile

SUPABASE_URL = os.getenv("SUPABASE_URL") or os.getenv("NEXT_PUBLIC_SUPABASE_URL")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

def supabase_client() -> Client:
    if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
        raise RuntimeError("Missing Supabase credentials")
    return create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

def fetch_data(sb: Client):
    matches = sb.table("matches").select("*").eq("status", "completed").order("id").execute().data
    stats = sb.table("match_stats_map").select("match_id,team_id,player_id,acs,kills,deaths").execute().data
    maps = sb.table("match_maps").select("*").execute().data
    return matches, stats, maps

def build_dataset(matches, stats, maps, window_n=5, decay_lambda=0.07, elo_k=24):
    per_match_team = defaultdict(lambda: {"players_acs": [], "kills": 0, "deaths": 0})
    for s in stats:
        key = (int(s["match_id"]), int(s["team_id"]))
        rec = per_match_team[key]
        rec["players_acs"].append(s.get("acs", 0) or 0)
        rec["kills"] += s.get("kills", 0) or 0
        rec["deaths"] += s.get("deaths", 0) or 0

    rounds_by_match = {}
    for m in maps:
        mid = m["match_id"]
        agg = rounds_by_match.get(mid, {"t1": 0, "t2": 0})
        agg["t1"] += m.get("team1_rounds", 0) or 0
        agg["t2"] += m.get("team2_rounds", 0) or 0
        rounds_by_match[mid] = agg

    rolling = defaultdict(lambda: deque(maxlen=window_n))
    wins_window = defaultdict(lambda: deque(maxlen=window_n))
    elo = defaultdict(lambda: 1500.0)

    rows = []
    for m in matches:
        if not m.get("team1_id") or not m.get("team2_id"):
            continue
        mid = int(m["id"])
        t1 = int(m["team1_id"]); t2 = int(m["team2_id"])
        week = int(m.get("week", 0) or 0)

        def aggregate_team(team_id):
            entries = list(rolling[team_id])
            if not entries:
                return {"avg_acs": 0.0, "kd": 1.0, "weighted_acs": 0.0, "var_acs": 0.0, "carry_ratio": 1.0, "recent_wr": 0.5}
            weights = []
            values_acs = []
            kd_vals = []
            players_acs_all = []
            for e in entries:
                delta_w = max(0, week - e["week"])
                w = pow(2.718281828, -decay_lambda * (delta_w * 7))
                weights.append(w)
                values_acs.append(e["acs"])
                kd_vals.append(e["kd"])
                players_acs_all.extend(e["players_acs"])
            wsum = sum(weights) if sum(weights) > 0 else 1.0
            weighted_acs = sum([w*v for w, v in zip(weights, values_acs)]) / wsum
            avg_acs = sum(values_acs) / max(1, len(values_acs))
            kd = sum(kd_vals) / max(1, len(kd_vals))
            if len(players_acs_all) >= 2:
                mean_pa = sum(players_acs_all) / len(players_acs_all)
                var_pa = sum((x - mean_pa) ** 2 for x in players_acs_all) / (len(players_acs_all) - 1)
                carry_ratio = (max(players_acs_all) / mean_pa) if mean_pa > 0 else 1.0
            else:
                var_pa = 0.0; carry_ratio = 1.0
            wr_entries = list(wins_window[team_id])
            recent_wr = (sum(wr_entries) / len(wr_entries)) if wr_entries else 0.5
            return {"avg_acs": avg_acs, "kd": kd, "weighted_acs": weighted_acs, "var_acs": var_pa, "carry_ratio": carry_ratio, "recent_wr": recent_wr}

        t1_feat = aggregate_team(t1)
        t2_feat = aggregate_team(t2)
        x_acs = t1_feat["avg_acs"] - t2_feat["avg_acs"]
        x_kd = t1_feat["kd"] - t2_feat["kd"]
        x_recent_acs = t1_feat["weighted_acs"] - t2_feat["weighted_acs"]
        x_consistency = t2_feat["var_acs"] - t1_feat["var_acs"]
        x_carry = t2_feat["carry_ratio"] - t1_feat["carry_ratio"]
        x_recent_wr = t1_feat["recent_wr"] - t2_feat["recent_wr"]
        elo1 = elo[t1]; elo2 = elo[t2]
        x_elo = elo1 - elo2
        x_interaction_1 = x_acs * x_recent_wr
        r = rounds_by_match.get(mid, {"t1": 0, "t2": 0})
        rd = (r["t1"] or 0) - (r["t2"] or 0)
        maps_played = int(m.get("maps_played", 0) or 0)
        feats = {
            "x_acs": x_acs,
            "x_kd": x_kd,
            "x_recent_acs": x_recent_acs,
            "x_consistency": x_consistency,
            "x_carry": x_carry,
            "x_recent_wr": x_recent_wr,
            "x_elo": x_elo,
            "x_interaction_1": x_interaction_1,
            "rd": rd,
            "maps_played": maps_played,
        }
        label = 1 if m.get("winner_id") == m.get("team1_id") else 0
        rows.append((feats, label))

        def team_game(team_id):
            rec = per_match_team.get((mid, team_id), {"players_acs": [], "kills": 0, "deaths": 0})
            acs_avg = (sum(rec["players_acs"]) / len(rec["players_acs"])) if rec["players_acs"] else 0.0
            kd_val = (rec["kills"] / rec["deaths"]) if rec["deaths"] else float(rec["kills"])
            return {"week": week, "acs": acs_avg, "kd": kd_val, "players_acs": rec["players_acs"]}
        rolling[t1].append(team_game(t1))
        rolling[t2].append(team_game(t2))
        wins_window[t1].append(1 if label == 1 else 0)
        wins_window[t2].append(1 if label == 0 else 0)
        expected1 = 1.0 / (1.0 + pow(10.0, (elo2 - elo1) / 400.0))
        res1 = 1.0 if label == 1 else 0.0
        elo[t1] = elo1 + elo_k * (res1 - expected1)
        elo[t2] = elo2 + elo_k * ((1.0 - res1) - (1.0 - expected1))

    dfX = pd.DataFrame([x for x, _ in rows])
    y = pd.Series([y for _, y in rows])
    n = len(dfX)
    split_idx = int(n * 0.8)
    X_train = dfX.iloc[:split_idx].copy()
    X_test = dfX.iloc[split_idx:].copy()
    y_train = y.iloc[:split_idx]
    y_test = y.iloc[split_idx:]
    scaler = StandardScaler()
    X_train_s = scaler.fit_transform(X_train.values)
    X_test_s = scaler.transform(X_test.values)
    clf = LogisticRegression(max_iter=2000)
    clf.fit(X_train_s, y_train.values)
    acc = clf.score(X_test_s, y_test.values)
    feature_order = list(dfX.columns)
    return clf, scaler, feature_order, float(acc)

def main():
    sb = supabase_client()
    matches, stats, maps = fetch_data(sb)
    if len(matches) < 20:
        raise RuntimeError("Not enough data to train")
    clf, scaler, feature_order, acc = build_dataset(matches, stats, maps)
    model = {
        "intercept": float(clf.intercept_[0]),
        "coefficients": [float(c) for c in clf.coef_[0].tolist()],
        "feature_order": feature_order,
        "calibration": {"type": "none"},
        "version": "v2"
    }
    scalers = {
        "means": scaler.mean_.tolist(),
        "stds": scaler.scale_.tolist(),
        "feature_order": feature_order,
    }
    metrics = {
        "accuracy": float(acc),
        "version": str(int(time.time())),
        "updatedAt": time.strftime("%Y-%m-%d %H:%M:%S"),
        "feature_order": feature_order
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

if __name__ == "__main__":
    main()
