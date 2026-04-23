import discord
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
import matplotlib.patheffects as pe
from matplotlib.patches import FancyArrowPatch
from scipy.interpolate import make_interp_spline
import numpy as np
import seaborn as sns
import pandas as pd
import io
from database import get_conn

# ── Valorant Design Tokens ────────────────────────────────────────────────────
V_RED     = "#FF4655"
V_TEAL    = "#24FFAB"
V_GOLD    = "#FFB800"
V_BLUE    = "#3FD1FF"
V_PURPLE  = "#B47FFF"
V_BG      = "#0F1923"
V_BG2     = "#1A2634"
V_GRID    = "#1C3040"
V_TEXT    = "#ECEDEE"
V_MUTED   = "#7B8FA1"

def _valorant_style(fig, ax):
    """Apply unified Valorant dark theme to a figure."""
    fig.patch.set_facecolor(V_BG)
    ax.set_facecolor(V_BG2)
    ax.tick_params(colors=V_MUTED, labelsize=9)
    ax.xaxis.label.set_color(V_MUTED)
    ax.yaxis.label.set_color(V_MUTED)
    ax.spines['bottom'].set_color(V_GRID)
    ax.spines['top'].set_visible(False)
    ax.spines['right'].set_visible(False)
    ax.spines['left'].set_color(V_GRID)
    ax.grid(True, color=V_GRID, linewidth=0.7, linestyle='--', alpha=0.5)

def _save_and_pack(fig, filename):
    buf = io.BytesIO()
    plt.savefig(buf, format='png', bbox_inches='tight', dpi=130,
                facecolor=V_BG, edgecolor='none')
    buf.seek(0)
    plt.close(fig)
    return discord.File(buf, filename=filename)


# ── Radar / Pentagon Chart ────────────────────────────────────────────────────
def generate_radar_chart(player_id, season):
    """Combat Pentagon — visualises 5 skill dimensions."""
    with get_conn() as conn:
        cursor = conn.cursor()
        sf = "(m.season_id = %s OR (m.season_id IS NULL AND %s = 'S23'))" if season != 'all' else "1=1"
        cursor.execute(f"""
            SELECT p.name,
                   AVG(msm.acs), AVG(msm.kills::float/NULLIF(msm.deaths,0)),
                   AVG(msm.adr), AVG(msm.kast), AVG(msm.hs_pct),
                   AVG(msm.fk::float/NULLIF(msm.fd,0)),
                   SUM(msm.clutches)::float / NULLIF(COUNT(*),0),
                   SUM(msm.plants)::float   / NULLIF(COUNT(*),0)
            FROM match_stats_map msm
            JOIN matches m ON msm.match_id = m.id
            JOIN players p ON msm.player_id = p.id
            WHERE msm.player_id = %s AND m.status = 'completed' AND {sf}
            GROUP BY p.name
        """, (player_id, season, season) if season != 'all' else (player_id,))
        row = cursor.fetchone()
        if not row or not row[1]:
            return None, None
        name, acs, kd, adr, kast, hs, fk_ratio, clutch_rate, plant_rate = (
            row[0],
            row[1] or 0, row[2] or 0, row[3] or 0, row[4] or 0, row[5] or 0,
            row[6] or 0, row[7] or 0, row[8] or 0
        )

        # League benchmarks (used to normalise 0-100)
        cursor.execute(f"""
            SELECT AVG(msm.acs), AVG(msm.kills::float/NULLIF(msm.deaths,0)),
                   AVG(msm.adr), AVG(msm.kast), AVG(msm.hs_pct)
            FROM match_stats_map msm JOIN matches m ON msm.match_id = m.id
            WHERE m.status = 'completed' AND {sf}
        """, (season, season) if season != 'all' else ())
        lg = cursor.fetchone()
        lg_acs, lg_kd, lg_adr, lg_kast, lg_hs = [v or 1 for v in lg]

    def _norm(v, bench, cap=2.0): return min(100, max(0, float(v or 0) / (float(bench) * cap) * 100))

    labels  = ["Fragging\n(ACS)", "Dueling\n(K/D)", "Pressure\n(ADR)",
               "Consistency\n(KAST)", "Precision\n(HS%)"]
    raw     = [acs, kd, adr, kast, hs]
    benches = [lg_acs, lg_kd, lg_adr, lg_kast, lg_hs]
    values  = [_norm(r, b) for r, b in zip(raw, benches)]
    values += values[:1]

    N = len(labels)
    angles = [n / N * 2 * np.pi for n in range(N)] + [0]

    fig = plt.figure(figsize=(6, 6), dpi=130)
    fig.patch.set_facecolor(V_BG)
    ax = fig.add_subplot(111, polar=True)
    ax.set_facecolor(V_BG2)

    # Background rings
    for lvl in [20, 40, 60, 80, 100]:
        ax.plot(angles, [lvl]*len(angles), color=V_GRID, linewidth=0.5, linestyle='--', alpha=0.4)

    # Fill area
    ax.fill(angles, values, color=V_TEAL, alpha=0.15)
    ax.plot(angles, values, color=V_TEAL, linewidth=2,
            path_effects=[pe.withStroke(linewidth=4, foreground=V_BG)])

    # Dot markers
    ax.scatter(angles[:-1], values[:-1], color=V_TEAL, s=60,
               zorder=5, path_effects=[pe.withStroke(linewidth=3, foreground=V_BG)])

    ax.set_xticks(angles[:-1])
    ax.set_xticklabels(labels, color=V_TEXT, fontsize=8.5, fontweight='bold')
    ax.set_yticks([])
    ax.spines['polar'].set_color(V_GRID)
    ax.tick_params(pad=12)

    # Center score
    avg_score = int(sum(values[:-1]) / N)
    ax.text(0, 0, f"{avg_score}", ha='center', va='center', fontsize=22,
            fontweight='bold', color=V_TEAL, transform=ax.transData)

    fig.suptitle(f"⬡  {name}  —  Combat Pentagon", fontsize=12,
                 fontweight='bold', color=V_TEXT, y=0.97)
    ax.set_ylim(0, 105)

    file = _save_and_pack(fig, "radar.png")
    embed = discord.Embed(
        title=f"⬡ {name} — Combat Profile",
        description=f"Pentagon score: **{avg_score}/100** | Season `{season}`",
        color=int(V_TEAL.lstrip('#'), 16)
    )
    embed.set_image(url="attachment://radar.png")
    return file, embed


# ── Player Trend Chart ────────────────────────────────────────────────────────
def generate_player_chart(player_id, season, chart_type="acs"):
    with get_conn() as conn:
        cursor = conn.cursor()
        sf = "(m.season_id = %s OR (m.season_id IS NULL AND %s = 'S23'))" if season != 'all' else "1=1"
        cursor.execute(f"""
            SELECT m.week, msm.acs, msm.kills, msm.deaths, msm.adr, p.name, msm.clutches, msm.fk
            FROM match_stats_map msm
            JOIN matches m ON msm.match_id = m.id
            JOIN players p ON msm.player_id = p.id
            WHERE msm.player_id = %s AND m.status = 'completed' AND {sf}
            ORDER BY m.week ASC
        """, (player_id, season, season) if season != 'all' else (player_id,))
        data = cursor.fetchall()
        if not data: return None, None

        df = pd.DataFrame(data, columns=['week','acs','kills','deaths','adr','name','clutches','fk'])
        df = df.fillna(0).infer_objects(copy=False)  # Null-safe: treat missing stats as 0
        player_name = df['name'].iloc[0]
        df['kd'] = df['kills'] / df['deaths'].replace(0, 1)

        # League average
        if chart_type == "kd":
            cursor.execute(f"SELECT AVG(msm.kills::float/NULLIF(msm.deaths,0)) FROM match_stats_map msm JOIN matches m ON msm.match_id=m.id WHERE m.status='completed' AND {sf}", (season,season) if season!='all' else ())
        else:
            cursor.execute(f"SELECT AVG(msm.{chart_type}) FROM match_stats_map msm JOIN matches m ON msm.match_id=m.id WHERE m.status='completed' AND {sf}", (season,season) if season!='all' else ())
        lg_avg = (cursor.fetchone() or [0])[0] or 0

    colors  = {"acs": V_TEAL, "kd": V_RED, "adr": V_GOLD}
    labels  = {"acs": "Average Combat Score", "kd": "Kill / Death Ratio", "adr": "Avg Damage / Round"}
    col     = colors[chart_type]

    fig, ax = plt.subplots(figsize=(10, 5))
    _valorant_style(fig, ax)

    # Aggregate by week for the trend line (one point per week as the average)
    df_trend = df.groupby('week')[chart_type].mean().reset_index().sort_values('week')
    
    x_trend = df_trend['week'].values.astype(float)
    y_trend = df_trend[chart_type].values.astype(float)

    # Use original data for scatter (show individual maps)
    x_scatter = df['week'].values.astype(float)
    y_scatter = df[chart_type].values.astype(float)

    # Smooth spline if enough points
    if len(x_trend) >= 4:
        x_new = np.linspace(x_trend.min(), x_trend.max(), 300)
        spl   = make_interp_spline(x_trend, y_trend, k=min(3, len(x_trend)-1))
        y_new = spl(x_new)
    else:
        x_new, y_new = x_trend, y_trend

    ax.fill_between(x_new, y_new, alpha=0.12, color=col)
    ax.plot(x_new, y_new, color=col, linewidth=2.5,
            path_effects=[pe.withStroke(linewidth=5, foreground=V_BG)])
    ax.scatter(x_scatter, y_scatter, color=col, s=55, zorder=5,
               path_effects=[pe.withStroke(linewidth=3, foreground=V_BG)])

    # Annotate clutch games
    for _, row in df.iterrows():
        if (row['clutches'] or 0) >= 1:
            ax.annotate("⚡", xy=(row['week'], row[chart_type]),
                        xytext=(0, 12), textcoords='offset points',
                        ha='center', fontsize=9, color=V_GOLD)

    # League avg line
    ax.axhline(lg_avg, color=V_MUTED, linestyle='--', linewidth=1.2, alpha=0.7,
               label=f'League AVG  {lg_avg:.1f}')

    # Peak label
    peak_idx = y_scatter.argmax()
    ax.annotate(f"PEAK\n{y_scatter[peak_idx]:.0f}", xy=(x_scatter[peak_idx], y_scatter[peak_idx]),
                xytext=(0, 18), textcoords='offset points', ha='center',
                fontsize=8, color=V_TEXT, fontweight='bold',
                arrowprops=dict(arrowstyle='->', color=V_MUTED, lw=1))

    ax.set_title(f"{player_name}  ·  {labels[chart_type]}  ·  {season}",
                 color=V_TEXT, fontsize=13, fontweight='bold', pad=14)
    ax.set_xlabel("Week", fontsize=10)
    ax.set_ylabel(labels[chart_type], fontsize=10)
    leg = ax.legend(facecolor=V_BG2, edgecolor=V_GRID, labelcolor=V_MUTED, fontsize=9)

    file = _save_and_pack(fig, "chart.png")
    embed = discord.Embed(
        title=f"📈 {player_name} — {chart_type.upper()} Trend",
        description=f"Season `{season}` · League avg: **{lg_avg:.1f}**",
        color=int(col.lstrip('#'), 16)
    )
    embed.set_image(url="attachment://chart.png")
    return file, embed


# ── Map Analytics Chart ───────────────────────────────────────────────────────
def generate_team_map_chart(team_id, season):
    with get_conn() as conn:
        cursor = conn.cursor()
        sf = "(m.season_id = %s OR (m.season_id IS NULL AND %s = 'S23'))" if season != 'all' else "1=1"
        cursor.execute(f"""
            SELECT mm.map_name, COUNT(*) as played,
                   SUM(CASE WHEN m.winner_id = %s THEN 1 ELSE 0 END) as wins
            FROM match_maps mm JOIN matches m ON mm.match_id = m.id
            WHERE (m.team1_id = %s OR m.team2_id = %s) AND {sf} AND m.status = 'completed'
            GROUP BY mm.map_name ORDER BY played DESC
        """, (team_id, team_id, team_id, season, season) if season != 'all' else (team_id, team_id, team_id))
        data = cursor.fetchall()
        if not data: return None, None
        cursor.execute("SELECT name FROM teams WHERE id = %s", (team_id,))
        team_name = cursor.fetchone()[0]

    df = pd.DataFrame(data, columns=['map','played','wins'])
    df['losses'] = df['played'] - df['wins']
    df['wr'] = (df['wins'] / df['played'] * 100).round(1)
    df = df.sort_values('wr', ascending=True)

    fig, ax = plt.subplots(figsize=(10, max(4, len(df) * 0.85)))
    _valorant_style(fig, ax)

    y_pos = range(len(df))
    bars_w = ax.barh(y_pos, df['wins'],  color=V_TEAL, height=0.5, label='Wins',
                     path_effects=[pe.withStroke(linewidth=1, foreground=V_BG)])
    bars_l = ax.barh(y_pos, df['losses'], left=df['wins'], color=V_RED, height=0.5,
                     label='Losses', alpha=0.75)

    # WR labels on the right
    for i, (_, row) in enumerate(df.iterrows()):
        wr_color = V_TEAL if row['wr'] >= 50 else V_RED
        ax.text(row['played'] + 0.15, i, f"{row['wr']}%",
                va='center', ha='left', color=wr_color, fontsize=9, fontweight='bold')

    ax.set_yticks(list(y_pos))
    ax.set_yticklabels(df['map'].tolist(), color=V_TEXT, fontsize=10)
    ax.set_xlabel("Maps Played", fontsize=10)
    ax.set_title(f"🗺  {team_name}  —  Map Win Rates  ·  {season}",
                 color=V_TEXT, fontsize=13, fontweight='bold', pad=12)
    leg = ax.legend(facecolor=V_BG2, edgecolor=V_GRID, labelcolor=V_MUTED, fontsize=9,
                    loc='lower right')
    ax.set_xlim(0, df['played'].max() * 1.25)

    file = _save_and_pack(fig, "map_chart.png")
    embed = discord.Embed(
        title=f"🗺️ {team_name} — Map Performance",
        description=f"Season `{season}`",
        color=int(V_BLUE.lstrip('#'), 16)
    )
    embed.set_image(url="attachment://map_chart.png")
    return file, embed


# ── Economy Flow Chart ────────────────────────────────────────────────────────
def generate_match_economy_chart(match_id):
    with get_conn() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT round_number, economy_t1, economy_t2, winning_team_id,
                   win_type, m.team1_id, m.team2_id, t1.tag, t2.tag
            FROM match_rounds mr
            JOIN matches m ON mr.match_id = m.id
            JOIN teams t1 ON m.team1_id = t1.id
            JOIN teams t2 ON m.team2_id = t2.id
            WHERE mr.match_id = %s ORDER BY round_number ASC
        """, (match_id,))
        data = cursor.fetchall()
        if not data: return None, None

    cols = ['round','econ1','econ2','winner','wtype','t1id','t2id','t1tag','t2tag']
    df = pd.DataFrame(data, columns=cols)
    t1tag, t2tag, t1id = df['t1tag'].iloc[0], df['t2tag'].iloc[0], df['t1id'].iloc[0]

    # Fill nulls
    df['econ1'] = df['econ1'].fillna(0).astype(float)
    df['econ2'] = df['econ2'].fillna(0).astype(float)

    fig, (ax_econ, ax_adv) = plt.subplots(2, 1, figsize=(12, 7),
                                           gridspec_kw={'height_ratios': [3, 1]})
    _valorant_style(fig, ax_econ)
    _valorant_style(fig, ax_adv)
    fig.subplots_adjust(hspace=0.08)

    rounds = df['round'].values

    # Economy lines (smooth if enough data)
    for y_data, col, label in [(df['econ1'].values, V_TEAL, t1tag),
                                (df['econ2'].values, V_RED, t2tag)]:
        sm_x, sm_y = rounds.astype(float), y_data
        if len(rounds) >= 4:
            spl = make_interp_spline(sm_x, sm_y, k=min(3, len(sm_x)-1))
            sm_x = np.linspace(sm_x.min(), sm_x.max(), 400)
            sm_y = spl(sm_x)
        ax_econ.fill_between(sm_x, sm_y, alpha=0.10, color=col)
        ax_econ.plot(sm_x, sm_y, color=col, linewidth=2.2, label=label,
                     path_effects=[pe.withStroke(linewidth=4, foreground=V_BG)])

    # Thrifty annotations
    for _, row in df.iterrows():
        if row['wtype'] == 'Thrifty':
            y = row['econ1'] if row['winner'] == t1id else row['econ2']
            ax_econ.annotate('⚡ THRIFTY', xy=(row['round'], y), xytext=(0, 14),
                             textcoords='offset points', ha='center', fontsize=7.5,
                             color=V_GOLD, fontweight='bold')

    # Half-time divider
    if len(rounds) >= 12:
        ax_econ.axvline(12.5, color=V_MUTED, linestyle=':', linewidth=1.2, alpha=0.5)
        ax_econ.text(12.7, ax_econ.get_ylim()[1]*0.92, 'HALF',
                     color=V_MUTED, fontsize=8)

    ax_econ.set_ylabel("Estimated Economy", fontsize=9)
    ax_econ.set_title(f"💰 Match #{match_id}  —  Economy & Momentum",
                      color=V_TEXT, fontsize=13, fontweight='bold', pad=10)
    leg = ax_econ.legend(facecolor=V_BG2, edgecolor=V_GRID, labelcolor=V_MUTED, fontsize=9)
    ax_econ.set_xticks([])

    # Running advantage bar (bottom)
    t1_lead = df['winner'].apply(lambda w: 1 if w == t1id else -1).cumsum().values
    bar_colors = [V_TEAL if v > 0 else V_RED for v in t1_lead]
    ax_adv.bar(rounds, t1_lead, color=bar_colors, width=0.85, alpha=0.85)
    ax_adv.axhline(0, color=V_MUTED, linewidth=0.8)
    ax_adv.set_xlabel("Round", fontsize=9)
    ax_adv.set_ylabel("Advantage", fontsize=8)
    ax_adv.set_xticks(range(1, len(rounds)+1, 2))
    ax_adv.tick_params(axis='x', labelsize=8)

    # Legend for advantage
    teal_patch = mpatches.Patch(color=V_TEAL, label=f'{t1tag} ahead')
    red_patch  = mpatches.Patch(color=V_RED,  label=f'{t2tag} ahead')
    ax_adv.legend(handles=[teal_patch, red_patch], facecolor=V_BG2, edgecolor=V_GRID,
                  labelcolor=V_MUTED, fontsize=8, loc='lower right')

    file = _save_and_pack(fig, "match_econ.png")
    embed = discord.Embed(
        title=f"💰 Economy Flow — {t1tag} vs {t2tag}",
        description=f"Match `#{match_id}` · Thrifty wins marked ⚡",
        color=int(V_GOLD.lstrip('#'), 16)
    )
    embed.set_image(url="attachment://match_econ.png")
    return file, embed
