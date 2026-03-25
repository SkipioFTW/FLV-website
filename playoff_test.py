import os
import json
import math
from collections import defaultdict
from supabase import create_client, Client
import matplotlib.pyplot as plt
import pandas as pd

# Load credentials from .env.local
SUPABASE_URL = "https://tekwoxehaktajyizaacj.supabase.co"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRla3dveGVoYWt0YWp5aXphYWNqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA2NzcxMDAsImV4cCI6MjA4NjI1MzEwMH0.u9c2Kt8gWF_HxeIAzblT6p1NSLwjaeYFPglZoLj051U"

def supabase_client() -> Client:
    return create_client(SUPABASE_URL, SUPABASE_KEY)

def get_data(sb: Client):
    # Fetch all matches
    res_m = sb.table("matches").select("*").eq("status", "completed").execute()
    # Fetch all teams
    res_t = sb.table("teams").select("id, name").execute()
    # Fetch all players
    res_p = sb.table('players').select('id, default_team_id').not_.is_('default_team_id', 'null').execute()
    # Fetch all stats
    res_s = sb.table('match_stats_map').select('*').execute()
    
    return res_m.data, res_t.data, res_p.data, res_s.data

def calculate_ratings_unbiased(matches, teams, players, stats, test_match_ids):
    # Training matches = all matches except those in test_match_ids
    train_matches = [m for m in matches if m['id'] not in test_match_ids]
    
    summaries = {}
    for team in teams:
        summaries[team['id']] = {
            "name": team['name'], "points": 0, "diff": 0, "rating_r": 0, 
            "strength_s": 0, "rating_b": 0, "match_count": 0
        }

    # 1. Matches for Points (Regular Season only)
    for m in train_matches:
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

    # 2. Player Data (S) - Using all stats might be slightly biased if stats from playoffs are included,
    # but the train.py logic aggregates per player. To be truly unbiased, we should filter stats by match_id too.
    player_to_team = {p['id']: p['default_team_id'] for p in players}
    
    team_pstats = {}
    for row in stats:
        mid = row['match_id']
        if mid in test_match_ids: continue # Filter stats from test matches
        
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
        if ts['rounds'] == 0: continue
        
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
            
    return summaries

def run_evaluation():
    sb = supabase_client()
    matches, teams, players, stats = get_data(sb)
    
    playoff_matches = [m for m in matches if m.get('group_name') == 'Playoffs' or m.get('match_type') == 'playoff']
    test_match_ids = {m['id'] for m in playoff_matches}
    
    print(f"Total matches retrieved: {len(matches)}")
    print(f"Playoff matches identified: {len(playoff_matches)}")
    
    if not playoff_matches:
        print("No playoff matches found to test.")
        return

    # Train model on all matches EXCEPT playoffs
    summaries = calculate_ratings_unbiased(matches, teams, players, stats, test_match_ids)
    
    results = []
    correct = 0
    total = 0
    
    for m in playoff_matches:
        t1_id, t2_id = m['team1_id'], m['team2_id']
        winner_id = m['winner_id']
        
        if not t1_id or not t2_id or not winner_id: continue
        
        r1 = summaries.get(t1_id, {}).get('rating_b', 0)
        r2 = summaries.get(t2_id, {}).get('rating_b', 0)
        
        pred_winner_id = t1_id if r1 > r2 else t2_id
        is_correct = pred_winner_id == winner_id
        
        if is_correct: correct += 1
        total += 1
        
        results.append({
            "match_id": m['id'],
            "team1": summaries.get(t1_id, {}).get('name', 'Unknown'),
            "team2": summaries.get(t2_id, {}).get('name', 'Unknown'),
            "t1_rating": r1,
            "t2_rating": r2,
            "predicted_winner": summaries.get(pred_winner_id, {}).get('name', 'Unknown'),
            "actual_winner": summaries.get(winner_id, {}).get('name', 'Unknown'),
            "correct": is_correct
        })

    accuracy = correct / total if total > 0 else 0
    print(f"Prediction Accuracy on Playoffs: {accuracy*100:.1f}% ({correct}/{total})")

    # Generate Report
    report_content = f"""# Prediction Model Performance Report (Playoffs)

## Executive Summary
This report evaluates the accuracy of the B-Rating prediction model on playoff matches. 
To ensure unbiased results, the model was trained **only** on regular season data before predicting playoff outcomes.

**Overall Accuracy: {accuracy*100:.1f}% ({correct}/{total} matches)**

## Mathematical Formulae

The model uses a **Blended Rating (B)** to compare teams.

### 1. Raw Point Rating (R)
Calculated from match wins and round differentials:
$$R = \\text{{Points}} + 0.5 \\times \\text{{RoundDiff}}$$
- **Points**: 15 for a win, capped rounds for a loss.
- **RoundDiff**: Total rounds won - Total rounds lost.

### 2. Player Strength (S)
Derived from advanced player statistics (ACS, K/D, ADR, KAST, Clutches, etc.):
$$S = (\\text{{AvgACS}} - 200) + 100 \\times (\\text{{AvgKD}} - 1) + 0.5 \\times (\\text{{AvgADR}} - 130) + 0.2 \\times (\\text{{AvgKAST}} - 70) + \\text{{DeepStats}}$$

### 3. Final Blended Rating (B)
Combines team results with player performance:
$$B = R + 10 \\times \\text{{Z-Score}}(S)$$

## Match Breakdown
"""
    df = pd.DataFrame(results)
    report_content += df.to_markdown(index=False)
    
    # Graphics
    plt.figure(figsize=(10, 6))
    plt.bar(['Correct', 'Incorrect'], [correct, total - correct], color=['green', 'red'])
    plt.title('Prediction Accuracy on Playoff Matches')
    plt.ylabel('Number of Matches')
    plt.savefig('playoff_accuracy.png')
    
    # Rating Distribution
    plt.figure(figsize=(10, 6))
    all_ratings = [s['rating_b'] for s in summaries.values() if s['match_count'] > 0]
    plt.hist(all_ratings, bins=15, color='skyblue', edgecolor='black')
    plt.title('Distribution of Team B-Ratings (Pre-Playoffs)')
    plt.xlabel('B-Rating')
    plt.ylabel('Frequency')
    plt.savefig('rating_distribution.png')

    with open("playoff_report.md", "w") as f:
        f.write(report_content)
    
    print("Report generated: playoff_report.md")
    print("Graphics generated: playoff_accuracy.png, rating_distribution.png")

if __name__ == "__main__":
    run_evaluation()
