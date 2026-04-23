import discord
from database import get_conn

# ── Valorant Design Tokens (echo of charts.py) ────────────────────────────────
V_RED    = 0xFF4655
V_TEAL   = 0x24FFAB
V_GOLD   = 0xFFB800
V_BLUE   = 0x3FD1FF
V_PURPLE = 0xB47FFF
V_DARK   = 0x0F1923

# Ordered medal ranks
RANK_MEDALS = ["🥇", "🥈", "🥉"]

def _bar(val, max_val=100, width=10):
    """Render a compact ASCII-style progress bar."""
    filled = round((val / max_val) * width) if max_val else 0
    return "█" * filled + "░" * (width - filled)


# ─────────────────────────────────────────────────────────────────────────────
# MATCH EMBEDS
# ─────────────────────────────────────────────────────────────────────────────

def get_match_overview_embed(match_id):
    with get_conn() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT m.id, m.week, m.group_name, t1.name, t2.name,
                   m.score_t1, m.score_t2, m.status, m.season_id, m.maps_played,
                   m.winner_id, t1.id, t2.id
            FROM matches m
            JOIN teams t1 ON m.team1_id = t1.id
            JOIN teams t2 ON m.team2_id = t2.id
            WHERE m.id = %s
        """, (match_id,))
        m = cursor.fetchone()
        if not m:
            return discord.Embed(title="Error", description="Match not found.", color=V_RED)
        mid, wk, grp, t1n, t2n, s1, s2, status, sid, maps_p, wid, t1id, t2id = m

        # MVP
        cursor.execute("""
            SELECT p.name, msm.agent, msm.acs, msm.kills, msm.deaths,
                   msm.assists, msm.adr, msm.hs_pct, t.tag, p.uuid
            FROM match_stats_map msm
            JOIN players p ON msm.player_id = p.id
            JOIN teams t ON msm.team_id = t.id
            WHERE msm.match_id = %s
            ORDER BY msm.acs DESC LIMIT 1
        """, (match_id,))
        mvp = cursor.fetchone()

        # Score bar
        total = (s1 or 0) + (s2 or 0)
        if total:
            t1_pct = round((s1 or 0) / total * 20)
            score_bar = f"{'█' * t1_pct}{'░' * (20 - t1_pct)}"
        else:
            score_bar = "░" * 20

        winner_name = t1n if wid == t1id else (t2n if wid == t2id else "—")
        status_str = "✅ COMPLETE" if status == 'completed' else f"⏳ {status.upper()}"

        desc = (
            f"### {t1n}  `{s1 or 0}`  —  `{s2 or 0}`  {t2n}\n"
            f"```{score_bar}```\n"
            f"🏆 **Winner:** {winner_name}  ·  {status_str}\n"
            f"📅 `{sid or 'S23'}` · Week **{wk}** · Group **{grp}**\n"
            f"🗺️ Maps played: `{maps_p or 'Unknown'}`"
        )

        embed = discord.Embed(
            title=f"🎮 Match Overview  ·  #{mid}",
            description=desc,
            color=V_TEAL if wid else V_BLUE
        )

        if mvp:
            mn, ma, macs, mk, md, mast, madr, mhs, mtag, muuid = mvp
            kd = mk / max(md, 1)
            mvp_val = (
                f"{'<@'+muuid+'>' if muuid else '**'+mn+'**'} · `{mtag}` · {ma}\n"
                f"`{int(macs)} ACS` · `{mk}/{md}/{mast}` · K/D: `{kd:.2f}`\n"
                f"ADR: `{round(madr or 0, 1)}` · HS: `{round(mhs or 0, 1)}%`"
            )
            embed.add_field(name="⭐ Match MVP", value=mvp_val, inline=False)

        embed.set_footer(text="Use the buttons below to explore Economy, Performance & Rounds")
        return embed


def get_match_performance_embed(match_id):
    with get_conn() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT p.name, msm.agent, msm.acs, msm.kills, msm.deaths,
                   msm.assists, msm.clutches, t.tag, msm.adr, msm.hs_pct,
                   msm.fk, msm.fd, msm.plants, msm.defuses, p.uuid,
                   msm.team_id, m.winner_id
            FROM match_stats_map msm
            JOIN players p ON msm.player_id = p.id
            JOIN teams t ON msm.team_id = t.id
            JOIN matches m ON msm.match_id = m.id
            WHERE msm.match_id = %s
            ORDER BY t.id, msm.acs DESC
        """, (match_id,))
        perf = cursor.fetchall()

        cursor.execute("""
            SELECT t1.name, t2.name, m.winner_id, t1.id, t2.id
            FROM matches m
            JOIN teams t1 ON m.team1_id = t1.id
            JOIN teams t2 ON m.team2_id = t2.id
            WHERE m.id = %s
        """, (match_id,))
        match_row = cursor.fetchone()

    embed = discord.Embed(
        title=f"⭐ Performance Scoreboard  ·  Match #{match_id}",
        color=V_PURPLE
    )
    if not perf:
        embed.description = "No performance data found."
        return embed

    t1n, t2n, wid, t1id, t2id = match_row if match_row else ("T1","T2",None,None,None)

    # Group by team
    teams = {}
    for row in perf:
        n, agent, acs, k, d, ast, cl, ttag, adr, hs, fk, fd, plants, defuses, uuid, tid, _ = row
        teams.setdefault(tid, {"tag": ttag, "players": []})
        teams[tid]["players"].append(row)

    for tid, tdata in teams.items():
        team_label = f"{'🏆 ' if wid == tid else ''}{tdata['tag']}"
        lines = []
        for i, row in enumerate(tdata["players"]):
            n, agent, acs, k, d, ast, cl, ttag, adr, hs, fk, fd, plants, defuses, uuid, _, winner = row
            acs  = int(acs  or 0)
            k    = k    or 0
            d    = d    or 1
            ast  = ast  or 0
            cl   = cl   or 0
            fk   = fk   or 0
            fd   = fd   or 0
            kd   = k / d
            medal = RANK_MEDALS[i] if i < 3 else f"`{i+1}.`"
            name_str = f"<@{uuid}>" if uuid else f"**{n}**"
            line = (
                f"{medal} {name_str} ({agent})\n"
                f"` ACS {acs:>3} · K/D {kd:>4.2f} · {k}/{d}/{ast} `"
                f"{'  ⚡' * cl if cl else ''}"
                f"{'  📍' * plants if plants else ''}"
                f"{'  🛡️' * defuses if defuses else ''}"
            )
            lines.append(line)

        embed.add_field(name=team_label, value="\n".join(lines), inline=False)

    embed.set_footer(text="⚡ Clutch  📍 Plant  🛡️ Defuse")
    return embed


def get_match_rounds_embed(match_id):
    with get_conn() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT round_number, winning_team_id, win_type,
                   m.team1_id, t1.tag, t2.tag, plant, defuse
            FROM match_rounds mr
            JOIN matches m ON mr.match_id = m.id
            JOIN teams t1 ON m.team1_id = t1.id
            JOIN teams t2 ON m.team2_id = t2.id
            WHERE mr.match_id = %s ORDER BY round_number ASC
        """, (match_id,))
        rounds = cursor.fetchall()

    embed = discord.Embed(
        title=f"🧩 Round Breakdown  ·  Match #{match_id}",
        color=int("FFB800", 16)
    )
    if not rounds:
        embed.description = "No round data found."
        return embed

    t1tag, t2tag = rounds[0][4], rounds[0][5]
    t1id = rounds[0][3]
    t1_score, t2_score = 0, 0

    win_icons = {
        "Elimination": "💀",
        "Bomb defused": "🛡️",
        "Bomb detonated": "💣",
        "Thrifty": "⚡",
        "Time ran out": "⌛"
    }

    # Build compact grid: 2 columns of 13 rounds each
    col1, col2 = [], []
    for rn, wid, wtype, t1id_orig, t1t, t2t, plant, defuse in rounds:
        winner_tag = t1tag if wid == t1id else t2tag
        icon = win_icons.get(wtype, "❓")
        if wid == t1id:
            t1_score += 1
        else:
            t2_score += 1
        side = "🔵" if wid == t1id else "🔴"
        plant_icon = "📍" if plant else "  "
        entry = f"`R{rn:02}` {side} {icon} {plant_icon}"
        if rn <= 12:
            col1.append(entry)
        else:
            col2.append(entry)

    score_line = f"**{t1tag}** 🔵 `{t1_score}` — `{t2_score}` 🔴 **{t2tag}**"
    embed.description = score_line

    if col1:
        embed.add_field(name="Rounds 1–12", value="\n".join(col1), inline=True)
    if col2:
        embed.add_field(name="Rounds 13+", value="\n".join(col2), inline=True)

    # Win type breakdown
    wtype_counts = {}
    for _, _, wt, *_ in rounds:
        wtype_counts[wt] = wtype_counts.get(wt, 0) + 1
    breakdown = " · ".join([f"{win_icons.get(k,'❓')} {k}: **{v}**" for k, v in sorted(wtype_counts.items(), key=lambda x: -x[1])])
    embed.add_field(name="Round Types", value=breakdown or "N/A", inline=False)
    embed.set_footer(text="📍 Spike planted this round")
    return embed
