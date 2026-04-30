# Skipio ELO System: Mathematical Foundation & Documentation

The **Skipio Indicator** is a premium performance analytics system designed for the Skipio Valorant ecosystem. Unlike traditional leaderboard systems that reward play volume (cumulative points), the Skipio ELO system measures **relative skill density**, rewarding players who consistently outperform their peers regardless of how many maps they have played.

---

## 1. The Raw Performance Score (RPS)

Every match appearance begins by calculating a **Raw Performance Score**. This is a weighted aggregate of the most impactful statistics in a Valorant match.

**Formula:**
$$RPS = (ACS \times 0.40) + (KD \times 30 \times 0.30) + (ADR \times 0.20) + (KAST \times 0.10)$$

*   **ACS (Average Combat Score):** 40% weight.
*   **K/D Ratio:** 30% weight (multiplied by 30 to scale with ACS).
*   **ADR (Average Damage per Round):** 20% weight.
*   **KAST (Kill, Assist, Survive, Traded):** 10% weight.

---

## 2. Peer Normalization (Blended Averaging)

The core innovation of Skipio ELO is that it does not judge an RPS in a vacuum. A score of 250 in an Immortal lobby is more impressive than a 250 in a Silver lobby. To account for this, every score is normalized against two peer groups:

### A. Global Rank-Group Average ($G_{avg}$)
Players are categorized into four Rank Groups:
1.  **Group 1:** Iron / Bronze
2.  **Group 2:** Silver / Gold
3.  **Group 3:** Platinum / Diamond
4.  **Group 4:** Ascendant / Immortal / Radiant

$G_{avg}$ is the average RPS of all players in that group across the entire season.

### B. Lobby Average ($L_{avg}$)
$L_{avg}$ is the average RPS of all players in the **same rank group** within that **specific match lobby**. If a player is the only one of their group in the lobby, the Global average is used instead.

### The Blended Performance ($B$)
We calculate two normalized percentages and average them:
$$G_{norm} = \frac{RPS}{G_{avg}} \times 100$$
$$L_{norm} = \frac{RPS}{L_{avg}} \times 100$$
$$B = (G_{norm} \times 0.5) + (L_{norm} \times 0.5)$$

---

## 3. Final ELO Calculation

A player's Skipio ELO is the longitudinal average of their Blended Performance ($B$) over all maps played, scaled from a baseline of 1000.

**Formula:**
$$ELO = 1000 + (\bar{B} - 100) \times 20$$

*   **Baseline (1000):** A player performing exactly at their rank average will have an ELO of 1000.
*   **Scaling (x20):** Every 5% performance increase over the average results in +100 ELO points.
*   **Volume Independence:** Since we use the average ($\bar{B}$), playing more games does not automatically increase your ELO; you must maintain a high performance level to keep it high.

---

## 4. Performance Tiers

| ELO Range | Tier Label | Color Code | Description |
| :--- | :--- | :--- | :--- |
| **1400+** | 🔥 Godlike | Orange | Top 1% performance; consistently dominating the server. |
| **1200 - 1400** | 💎 Elite | Blue | Significantly higher impact than rank peers. |
| **1050 - 1200** | 🟢 Strong | Green | Reliable and efficient; above-average contribution. |
| **950 - 1050** | ⚪ Baseline | White | Performing exactly as expected for your current rank. |
| **850 - 950** | 🟠 Below Avg | Yellow | struggling to keep up with rank-equivalent peers. |
| **< 850** | 🔴 Struggling | Red | High priority for VOD review or rank adjustment. |

---

## 5. Progression & Trend Tracking

The Skipio system tracks the delta ($\Delta$) between the current ELO and the ELO after the previous match.

*   **🟢 +12:** Indicates a strong performance in the most recent match, raising the career average.
*   **🔴 -8:** Indicates a recent underperformance relative to the player's established baseline.

---

## 6. Qualifying Criteria
To ensure statistical significance and prevent leaderboard "sniping" by players with only one good game, the following rule is enforced:
*   **Minimum Maps:** 3 (Three maps must be completed in the selected season to appear on the leaderboard).
