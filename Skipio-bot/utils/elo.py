import logging

logger = logging.getLogger(__name__)


def _rank_grp(rank: str) -> int:
    if not rank:
        return 2
    ru = rank.upper()
    if 'IRON' in ru or 'BRONZE' in ru:
        return 1
    if 'SILVER' in ru or 'GOLD' in ru:
        return 2
    if 'PLATINUM' in ru or 'DIAMOND' in ru:
        return 3
    if 'ASCENDANT' in ru or 'IMMORTAL' in ru or 'RADIANT' in ru:
        return 4
    return 2


def calculate_skipio_elos(cursor, season: str = 'all') -> tuple[dict, list]:
    """Compute Skipio ELO history for all players from an open DB cursor.

    Uses a blended normalisation: 50% vs global rank-tier average, 50% vs
    in-match lobby average.  Sorted by match_id for chronological ordering.

    Returns:
        player_history  — {player_id: [elo_after_each_map, ...]}
        appearances     — [(player_id, match_id, raw_score, rank_group)]
    """
    cursor.execute("SELECT id, rank FROM players")
    p_groups = {r[0]: _rank_grp(r[1]) for r in cursor.fetchall()}

    sf = "1=1" if season == 'all' else "m.season_id = %s"
    cursor.execute(
        f"SELECT id FROM matches m WHERE m.status = 'completed' AND {sf}",
        (season,) if season != 'all' else ()
    )
    m_ids = [r[0] for r in cursor.fetchall()]
    if not m_ids:
        return {}, []

    placeholders = ','.join(['%s'] * len(m_ids))
    cursor.execute(f"""
        SELECT player_id, match_id, acs, kills, deaths, adr, kast
        FROM match_stats_map
        WHERE match_id IN ({placeholders})
    """, tuple(m_ids))

    grp_totals: dict[int, list] = {1: [0.0, 0], 2: [0.0, 0], 3: [0.0, 0], 4: [0.0, 0]}
    lobby_scores: dict[tuple, list] = {}
    appearances: list[tuple] = []

    for pid, mid, acs, kills, deaths, adr, kast in cursor.fetchall():
        grp = p_groups.get(pid, 2)
        kd = (kills / deaths) if deaths else (kills or 0)
        raw = (acs or 0) * 0.40 + kd * 30 * 0.30 + (adr or 0) * 0.20 + (kast or 0) * 0.10
        grp_totals[grp][0] += raw
        grp_totals[grp][1] += 1
        lobby_scores.setdefault((mid, grp), []).append(raw)
        appearances.append((pid, mid, raw, grp))

    grp_avgs = {g: (v[0] / v[1] if v[1] > 0 else 150.0) for g, v in grp_totals.items()}

    player_history: dict[int, list] = {}
    blended_acc: dict[int, list] = {}
    appearances.sort(key=lambda x: x[1])

    for pid, mid, raw, grp in appearances:
        g_avg = grp_avgs[grp]
        lobby = lobby_scores.get((mid, grp), [])
        l_avg = sum(lobby) / len(lobby) if len(lobby) > 1 else g_avg
        g_norm = (raw / g_avg * 100) if g_avg else 100.0
        l_norm = (raw / l_avg * 100) if l_avg else 100.0
        blended = g_norm * 0.5 + l_norm * 0.5
        blended_acc.setdefault(pid, []).append(blended)
        avg_so_far = sum(blended_acc[pid]) / len(blended_acc[pid])
        player_history.setdefault(pid, []).append(round(1000 + (avg_so_far - 100) * 20))

    return player_history, appearances
