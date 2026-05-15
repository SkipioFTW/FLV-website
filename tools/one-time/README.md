# One-Time Scripts Archive

These scripts were used for specific debugging, repair, or testing tasks during development. They are kept here for reference but are **not part of the regular application workflow**.

> ⚠️ Most of these scripts contain hardcoded Supabase URLs and placeholder API keys. You'll need to update credentials before running them.

## Scripts

| File | Purpose | When Used |
|------|---------|-----------|
| `check_playoffs.js` | Lists all playoff matches from the database (console output) | Debugging playoff bracket layout |
| `check_playoffs_file.js` | Same as above but writes output to a text file | Debugging playoff bracket layout |
| `list_matches.js` | Lists all playoff-type matches with scores | Verifying match data integrity |
| `repair_bracket_data.js` | Fixes corrupted bracket data (specific match ID 268) | One-time S23 bracket repair |
| `repair_playoffs.js` | Repairs playoff round/position metadata for all playoff matches | One-time S23 playoff structure fix |
| `playoff_test.py` | Evaluates prediction model accuracy on playoff matches | Model validation during S23 |

## Generated Output Files

| File | Source Script |
|------|--------------|
| `playoff_accuracy.png` | `playoff_test.py` |
| `rating_distribution.png` | `playoff_test.py` |
| `playoff_report.md` | `playoff_test.py` |
