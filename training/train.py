import os
import io
import json
import time
import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler
from sklearn.linear_model import LogisticRegression
from supabase import create_client, Client

SUPABASE_URL = os.getenv("SUPABASE_URL") or os.getenv("NEXT_PUBLIC_SUPABASE_URL")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

def supabase_client() -> Client:
    if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
        raise RuntimeError("Missing Supabase credentials")
    return create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

def fetch_data(sb: Client):
    matches = sb.table("matches").select("*").eq("status", "completed").execute().data
    maps = sb.table("match_maps").select("*").execute().data
    return matches, maps

def build_dataset(matches, maps):
    rounds_by_match = {}
    for m in maps:
        mid = m["match_id"]
        agg = rounds_by_match.get(mid, {"t1": 0, "t2": 0})
        agg["t1"] += m.get("team1_rounds", 0) or 0
        agg["t2"] += m.get("team2_rounds", 0) or 0
        rounds_by_match[mid] = agg
    rows = []
    for m in matches:
        if not m.get("team1_id") or not m.get("team2_id"):
            continue
        mid = m["id"]
        r = rounds_by_match.get(mid, {"t1": 0, "t2": 0})
        feat = {
            "team1_id": m["team1_id"],
            "team2_id": m["team2_id"],
            "score_t1": m.get("score_t1", 0) or 0,
            "score_t2": m.get("score_t2", 0) or 0,
            "maps_played": m.get("maps_played", 0) or 0,
            "rd": (r["t1"] or 0) - (r["t2"] or 0),
        }
        label = 1 if m.get("winner_id") == m.get("team1_id") else 0
        rows.append((feat, label))
    dfX = pd.DataFrame([x for x, y in rows])
    y = pd.Series([y for x, y in rows])
    X = dfX[["score_t1", "score_t2", "maps_played", "rd"]].copy()
    X["score_diff"] = X["score_t1"] - X["score_t2"]
    X = X[["score_diff", "rd", "maps_played"]]
    return X, y

def main():
    sb = supabase_client()
    matches, maps = fetch_data(sb)
    if len(matches) < 20:
        raise RuntimeError("Not enough data to train")
    X, y = build_dataset(matches, maps)
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, shuffle=True, random_state=42, stratify=y
    )
    scaler = StandardScaler()
    X_train_s = scaler.fit_transform(X_train.values)
    X_test_s = scaler.transform(X_test.values)
    clf = LogisticRegression(max_iter=1000)
    clf.fit(X_train_s, y_train.values)
    acc = clf.score(X_test_s, y_test.values)
    feature_order = list(X.columns)
    model = {
        "intercept": float(clf.intercept_[0]),
        "coefficients": [float(c) for c in clf.coef_[0].tolist()],
        "feature_order": feature_order,
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
    }
    # Upload JSON bytes using BytesIO; 'upload' treats str as file path.
    def upload_json(path, obj):
        buf = io.BytesIO(json.dumps(obj).encode("utf-8"))
        sb.storage.from_("models").upload(path, buf, {"contentType": "application/json", "upsert": True})
    upload_json("current/model.json", model)
    upload_json("current/scalers.json", scalers)
    upload_json("current/metrics.json", metrics)

if __name__ == "__main__":
    main()
