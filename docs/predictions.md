Overview

- DB-only ML model to predict match winner probabilities.
- Training with 80/20 split; inference via /api/predict.

Artifacts

- Supabase Storage (public bucket: models):
  - models/current/model.json
  - models/current/scalers.json
  - models/current/metrics.json
  - models/current/player_stats.json
  - models/current/team_stats.json
  - models/archives/... (optional)

Secrets

- Vercel env: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY.
- GitHub Actions: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.

Training (CI)

- workflow: .github/workflows/train.yml (nightly + manual).
- training/train.py fetches matches/maps, builds features, trains Logistic Regression, evaluates on an
  80/20 holdout split, and uploads artifacts.
- Model type `logistic_v6` uses a 12-feature diff vector: the original roster/team diffs
  (`diff_acs`, `diff_kd`, `diff_rank`, `diff_exp`, `diff_wr`, `diff_form`, `diff_rd`) plus
  `diff_adr`, `diff_kast`, `diff_hs`, `diff_entry`, `diff_clutch` derived from `match_stats_map`
  (ADR, KAST, headshot %, first-kill/first-death entry impact, clutch rate).
- metrics.json shape: `{ accuracy, auc, logLoss, n_samples, n_train, n_test, version, updatedAt }`.

Inference (Vercel)

- API: /api/predict?team1_id=..&team2_id=..
  - Computes features from DB, loads model artifacts, returns probability.
- API: /api/predictions/upcoming
  - Same feature-builder selection as /api/predict, applied to all upcoming matches.

Admin

- /api/model/reload clears the in-memory model cache (admin cookie required).
- /admin/predictions shows model metrics (accuracy/AUC/logLoss) and a manual predictor/retrain trigger.
