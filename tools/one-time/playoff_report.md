# Prediction Model Performance Report (Playoffs)

## Executive Summary
This report evaluates the accuracy of the B-Rating prediction model on playoff matches. 
To ensure unbiased results, the model was trained **only** on regular season data before predicting playoff outcomes.

**Overall Accuracy: 59.1% (13/22 matches)**

## Mathematical Formulae

The model uses a **Blended Rating (B)** to compare teams.

### 1. Raw Point Rating (R)
Calculated from match wins and round differentials:
$$R = \text{Points} + 0.5 \times \text{RoundDiff}$$
- **Points**: 15 for a win, capped rounds for a loss.
- **RoundDiff**: Total rounds won - Total rounds lost.

### 2. Player Strength (S)
Derived from advanced player statistics (ACS, K/D, ADR, KAST, Clutches, etc.):
$$S = (\text{AvgACS} - 200) + 100 \times (\text{AvgKD} - 1) + 0.5 \times (\text{AvgADR} - 130) + 0.2 \times (\text{AvgKAST} - 70) + \text{DeepStats}$$

### 3. Final Blended Rating (B)
Combines team results with player performance:
$$B = R + 10 \times \text{Z-Score}(S)$$

## Match Breakdown
|   match_id | team1               | team2                 |   t1_rating |   t2_rating | predicted_winner    | actual_winner   | correct   |
|-----------:|:--------------------|:----------------------|------------:|------------:|:--------------------|:----------------|:----------|
|        214 | The Vant1c Effect   | Ayrox Esports         |     39.056  |     63.5015 | Ayrox Esports       | Ayrox Esports   | True      |
|        213 | Solar Reign         | One Designated Driver |     66.1969 |     53.8467 | Solar Reign         | Solar Reign     | True      |
|        215 | DSS Gaming          | Gooner Academy        |     49.1057 |     59.0852 | Gooner Academy      | Gooner Academy  | True      |
|        218 | Chumber Mains       | ATOR Black            |     46.7721 |     73.439  | ATOR Black          | ATOR Black      | True      |
|        219 | Nomads              | NOT winning           |     53.7253 |     65.3694 | NOT winning         | NOT winning     | True      |
|        217 | Misfits             | Frag Frogs            |     64.7223 |     40.9453 | Misfits             | Frag Frogs      | False     |
|        223 | Lime Green Kia Soul | Gooner Academy        |     85.7309 |     59.0852 | Lime Green Kia Soul | Gooner Academy  | False     |
|        216 | Frogs               | The Zenith            |     59.3346 |     55.5859 | Frogs               | Frogs           | True      |
|        226 | Seattle Knights     | ATOR Black            |     69.4524 |     73.439  | ATOR Black          | ATOR Black      | True      |
|        212 | Total Bad Asses     | Genius Evils          |     57.2732 |     49.1129 | Total Bad Asses     | Genius Evils    | False     |
|        221 | Team Snoopy         | Solar Reign           |    103.045  |     66.1969 | Team Snoopy         | Solar Reign     | False     |
|        269 | Baguette 5          | Gooner Academy        |     74.068  |     59.0852 | Baguette 5          | Gooner Academy  | False     |
|        271 | Frogs               | Frag Frogs            |     59.3346 |     40.9453 | Frogs               | Frag Frogs      | False     |
|        273 | Just Banana         | Gooner Academy        |    113.442  |     59.0852 | Just Banana         | Just Banana     | True      |
|        220 | Just Banana         | Genius Evils          |    113.442  |     49.1129 | Just Banana         | Just Banana     | True      |
|        224 | Great Uncs          | Frogs                 |    112.723  |     59.3346 | Great Uncs          | Frogs           | False     |
|        270 | Just Banana         | Solar Reign           |    113.442  |     66.1969 | Just Banana         | Just Banana     | True      |
|        272 | ATOR Black          | NOT winning           |     73.439  |     65.3694 | ATOR Black          | ATOR Black      | True      |
|        274 | Frag Frogs          | ATOR Black            |     40.9453 |     73.439  | ATOR Black          | ATOR Black      | True      |
|        225 | ATOR White          | Frag Frogs            |     64.4778 |     40.9453 | ATOR White          | Frag Frogs      | False     |
|        227 | GIN AND TOXIC       | NOT winning           |     83.1946 |     65.3694 | GIN AND TOXIC       | NOT winning     | False     |
|        222 | Baguette 5          | Ayrox Esports         |     74.068  |     63.5015 | Baguette 5          | Baguette 5      | True      |