# Prediction Model v6 — Evaluation Report

_Generated 2026-06-14 against the live Supabase dataset (270 completed matches with stats)._

## What changed

- **Fixed `/api/predictions/upcoming`**: it was feeding the old 12-feature ELO vector
  (`buildFeatures`) into the deployed `logistic_v5` model, which expects the 7-feature
  `buildDynamicFeatures` vector. Probabilities on the "Upcoming Match Predictions" list were
  meaningless. Both `/api/predict` and `/api/predictions/upcoming` now branch on
  `model.type !== 'b_ratings'` to pick the right feature builder.
- **Restored the publish/eval pipeline** in `training/train.py`: an 80/20 holdout split,
  accuracy/AUC/log-loss computation, and `sb.storage.from_("models").upload(...)` for
  `model.json`, `scalers.json`, `metrics.json`, `player_stats.json`, `team_stats.json`. Previously
  these were only written to local `training/output/` and never published — `models/current/*`
  in Storage was stale.
- **Added 5 new diff-features** derived from `match_stats_map`'s V4 stats:
  `diff_adr`, `diff_kast`, `diff_hs`, `diff_entry` (first-kill minus first-death), `diff_clutch`
  (clutch rate). Model bumped from `logistic_v5` (7 features) to `logistic_v6` (12 features).
- **Switched `LogisticRegression` → `LogisticRegressionCV`** (auto-selects L2 regularization
  strength `C` via internal 5-fold CV, searched over `np.logspace(-3, 1, 20)`). This was the
  single biggest factor in the numbers below — see "Why CV regularization" section.

## Dataset

- 270 completed matches with usable `match_stats_map` rows (across all seasons).
- Class balance: team1 wins ~52.2% of the time (near-even — the `team1`/`team2` assignment
  carries no real signal itself).
- Baseline (always predict the majority class): **accuracy ≈ 0.519**.
- Baseline (constant `p = 0.5` or `p = ` class prior): **logLoss ≈ 0.693**.

## Headline numbers (repeated 5-fold CV, 20 repeats = 100 train/test splits)

| Model | Accuracy | AUC | LogLoss |
|---|---|---|---|
| Majority-class baseline | 0.519 | – | – |
| Constant p=0.5 baseline | – | 0.50 | 0.693 |
| **7-feature (old `logistic_v5`), C=1.0** | 0.601 ± 0.056 | 0.657 ± 0.065 | 0.659 ± 0.050 |
| 12-feature (`logistic_v6`), C=1.0 — *as first patched* | 0.608 ± 0.062 | **0.641 ± 0.067** | **0.681 ± 0.059** |
| 7-feature + `LogisticRegressionCV` (C≈0.13) | 0.607 ± 0.053 | 0.662 ± 0.064 | 0.651 ± 0.040 |
| **12-feature + `LogisticRegressionCV` (C≈0.03) — shipped** | 0.609 ± 0.058 | 0.660 ± 0.067 | 0.655 ± 0.039 |

A single 80/20 run of the shipped pipeline (`training/output/metrics.json` from the dry run)
produced:

```json
{
  "accuracy": 0.5556,
  "auc": 0.6126,
  "logLoss": 0.6869,
  "n_samples": 270,
  "n_train": 216,
  "n_test": 54,
  "C": 0.0298
}
```

A single 54-sample test split has a standard error of roughly ±0.07 on accuracy, so this single
run sits within the normal spread of the 100-split CV average above (0.609 ± 0.058). Subsequent
nightly retrains will report their own single-split numbers in `models/current/metrics.json` —
expect them to bounce around in this same ±0.05–0.07 range until the dataset grows.

## Why CV regularization mattered more than the new features

Adding 5 new features to a 270-row dataset (216 training rows after the holdout split) with the
previous unregularized `LogisticRegression(max_iter=1000)` (`C=1.0`) **overfit**: AUC dropped from
0.657 → 0.641 and logLoss got worse (0.659 → 0.681) versus the old 7-feature model. In other
words, shipping the feature expansion *without* the regularization fix would have made live
predictions slightly worse.

Switching to `LogisticRegressionCV` lets the model pick a much stronger penalty (`C≈0.03` for 12
features vs `C≈0.13` for 7), which brings the 12-feature model back to parity with the
7-feature model — all three metrics are within one standard deviation of each other.

**Per-feature ablation** (7-feature base + one new stat at a time, C=1.0, 100-split CV):

| Added feature | Accuracy | AUC | LogLoss |
|---|---|---|---|
| (none, 7-feature base) | 0.601 | 0.657 | 0.659 |
| + `diff_adr` | 0.597 | 0.654 | 0.662 |
| + `diff_kast` | 0.612 | 0.660 | 0.663 |
| + `diff_hs` | 0.593 | 0.648 | 0.666 |
| + `diff_entry` | 0.610 | 0.655 | 0.662 |
| + `diff_clutch` | 0.596 | 0.650 | 0.664 |

None of the new stats individually move AUC/logLoss meaningfully — they're correlated with
existing features (ADR ~ ACS, entry impact ~ rank/experience) and the dataset is too small to
isolate their independent contribution yet.

## Coefficients (shipped model, full-data refit, C≈0.03)

```
intercept:    +0.093
diff_acs:     +0.152
diff_kd:      +0.133
diff_rank:    +0.191
diff_exp:     +0.122
diff_wr:      +0.089
diff_form:    -0.086
diff_rd:      +0.032
diff_adr:     +0.104
diff_kast:    +0.151
diff_hs:      +0.027
diff_entry:   +0.137
diff_clutch:  +0.026
```

All signs are intuitive (higher ACS/KD/rank/experience/win-rate/ADR/KAST/entry-impact for team1
→ higher win probability for team1) except `diff_form` (last-3-games win rate), which is
slightly negative — likely noise at this sample size, or a mild mean-reversion effect (teams on
a hot streak facing teams on a cold streak don't track form well as a standalone signal once
overall win-rate is already in the model).

## Bottom line

- The pipeline now actually **publishes** updated models/metrics to Supabase Storage on every
  retrain, and the admin "Model Metrics" panel will show real numbers instead of "No metrics
  found".
- The "Upcoming Match Predictions" list now uses the correct feature vector for the deployed
  model, so its probabilities are meaningful (previously: garbage).
- Realistic expectation for this league's data today: **~60% accuracy, ~0.66 AUC** — a real but
  modest edge over a 52% coin-flip baseline. The new V4-derived stats (ADR/KAST/HS%/entry/clutch)
  aren't hurting (thanks to the regularization fix) and aren't helping much *yet*, but they give
  the model more to work with as more matches accumulate V4 stats.

## Future improvement ideas (not implemented here)

- **More data**: accuracy/AUC will likely improve simply as more seasons of completed matches
  with full `match_stats_map` V4 stats accumulate — the current dataset is small (270 rows, 216
  train).
- **Backfill V4 stats** for older matches that predate the HenrikDev V4 import work — many
  `player_history` entries currently fall back to rank-scaled defaults for `adr`/`kast`/`hs_pct`/
  `entry`/`clutch_rate` because the raw columns are `NULL`.
- **Time-based holdout**: the current 80/20 split is a random shuffle (consistent with the
  original v1 design). A chronological holdout (train on earlier matches, test on the most
  recent ones) would better simulate real "predict the next match" usage, at the cost of a
  smaller/noisier test set with only 270 rows.
- **Playoff Monte Carlo sims** (`getPlayoffProbability`/`getTournamentWinProbability` in
  `src/lib/data.ts`) still use a simple `Wins/Played` heuristic, independent of this model —
  could eventually be swapped to use `/api/predict` probabilities.
