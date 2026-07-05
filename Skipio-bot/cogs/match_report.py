import re
import logging
import discord
from discord.ext import commands
from discord import app_commands
import requests as http_requests

from database import get_conn, get_default_season
from utils.helpers import run_in_executor
from config import PORTAL_URL, BOT_SECRET, REPORT_ROLE_IDS
from utils.design import C_RED as V_RED, C_TEAL as V_TEAL, C_GOLD as V_GOLD, C_BLUE as V_BLUE

logger = logging.getLogger(__name__)

WINS_NEEDED = {"BO1": 1, "BO3": 2, "BO5": 3}
MAP_CAP = {"BO1": 1, "BO3": 3, "BO5": 5}
FF_RE = re.compile(r"^ff\s*[:=]\s*(.+)$", re.IGNORECASE)
TRACKER_RE = re.compile(r"match/([A-Za-z0-9\-]+)")

REGION_CHOICES = [
    app_commands.Choice(name="Europe (eu)", value="eu"),
    app_commands.Choice(name="North America (na)", value="na"),
    app_commands.Choice(name="Asia Pacific (ap)", value="ap"),
    app_commands.Choice(name="Korea (kr)", value="kr"),
    app_commands.Choice(name="LATAM (latam)", value="latam"),
    app_commands.Choice(name="Brazil (br)", value="br"),
]


# --- BLOCKING HELPERS (run via run_in_executor) ---

def _fetch_reportable_choices(query):
    try:
        season = get_default_season()
        with get_conn() as conn:
            cursor = conn.cursor()
            q = f"%{query}%"
            cursor.execute("""
                SELECT m.id, t1.tag, t2.tag, m.week, m.format, m.group_name
                FROM matches m
                JOIN teams t1 ON m.team1_id = t1.id
                JOIN teams t2 ON m.team2_id = t2.id
                WHERE COALESCE(m.status, 'scheduled') != 'completed'
                  AND (m.season_id = %s OR (m.season_id IS NULL AND %s = 'S23'))
                  AND (t1.tag ILIKE %s OR t2.tag ILIKE %s OR t1.name ILIKE %s OR t2.name ILIKE %s)
                ORDER BY m.week, m.id LIMIT 25
            """, (season, season, q, q, q, q))
            rows = cursor.fetchall()
            return [
                app_commands.Choice(
                    name=f"W{wk} · {t1} vs {t2} · {fmt or 'BO3'} ({grp or '-'}) #{mid}",
                    value=str(mid),
                )
                for mid, t1, t2, wk, fmt, grp in rows
            ]
    except Exception as e:
        logger.warning("reportable match autocomplete failed: %s", e)
        return []


def _fetch_match_info(mid):
    with get_conn() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT m.id, m.team1_id, m.team2_id, t1.name, t1.tag, t2.name, t2.tag,
                   COALESCE(m.status, 'scheduled'), COALESCE(m.format, 'BO3'),
                   m.week, m.group_name, m.season_id
            FROM matches m
            JOIN teams t1 ON m.team1_id = t1.id
            JOIN teams t2 ON m.team2_id = t2.id
            WHERE m.id = %s
        """, (mid,))
        row = cursor.fetchone()
        if not row:
            return None
        keys = ["id", "team1_id", "team2_id", "t1_name", "t1_tag", "t2_name", "t2_tag",
                "status", "format", "week", "group_name", "season_id"]
        return dict(zip(keys, row))


def _fetch_all_players():
    with get_conn() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT id, name, riot_id, default_team_id FROM players")
        return [
            {"id": pid, "name": name, "riot_id": rid, "default_team_id": tid}
            for pid, name, rid, tid in cursor.fetchall()
        ]


def _api_post(path, payload):
    headers = {"Content-Type": "application/json", "x-bot-secret": BOT_SECRET or ""}
    return http_requests.post(f"{PORTAL_URL}{path}", json=payload, headers=headers, timeout=90)


def _apply_match_forfeit(mid, winner_id, team1_id):
    """Mirror the admin panel forfeit: wipe map details, set 13-0 on the match row."""
    s1 = 13 if winner_id == team1_id else 0
    s2 = 0 if winner_id == team1_id else 13
    with get_conn() as conn:
        cursor = conn.cursor()
        for table in ("match_maps", "match_stats_map", "match_rounds", "match_player_rounds"):
            cursor.execute(f"DELETE FROM {table} WHERE match_id = %s", (mid,))
        cursor.execute("""
            UPDATE matches
            SET score_t1 = %s, score_t2 = %s, winner_id = %s,
                status = 'completed', maps_played = '0', is_forfeit = 1
            WHERE id = %s
        """, (s1, s2, winner_id, mid))
        conn.commit()


def _mark_reported(mid, channel_id, submitter_id):
    try:
        with get_conn() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "UPDATE matches SET reported = true, channel_id = %s, submitter_id = %s WHERE id = %s",
                (str(channel_id), str(submitter_id), mid))
            conn.commit()
    except Exception as e:
        logger.warning("failed to mark match %s reported: %s", mid, e)


async def reportable_match_autocomplete(interaction, current):
    return await run_in_executor(_fetch_reportable_choices, current)


def _clean_tracker_id(link):
    link = link.strip()
    if "tracker.gg" in link:
        m = TRACKER_RE.search(link)
        if m:
            return m.group(1)
    return re.sub(r"[^A-Za-z0-9\-]", "", link)


def _resolve_team_token(token, info):
    """Resolve a forfeit target: team number, tag or name → (team_id, name)."""
    t = token.strip().lower()
    if t in ("1", "team1", "t1") or t == (info["t1_tag"] or "").lower() or t == info["t1_name"].lower():
        return info["team1_id"], info["t1_name"]
    if t in ("2", "team2", "t2") or t == (info["t2_tag"] or "").lower() or t == info["t2_name"].lower():
        return info["team2_id"], info["t2_name"]
    return None, None


class ConfirmReportView(discord.ui.View):
    def __init__(self, author_id):
        super().__init__(timeout=300)
        self.author_id = author_id
        self.value = None
        self.message = None

    async def interaction_check(self, interaction):
        if interaction.user.id != self.author_id:
            await interaction.response.send_message(
                "❌ Only the reporter who ran the command can confirm or cancel.", ephemeral=True)
            return False
        return True

    def _disable(self):
        for child in self.children:
            child.disabled = True

    @discord.ui.button(label="✅ Confirm & Save", style=discord.ButtonStyle.success)
    async def confirm_btn(self, interaction, button):
        self.value = True
        self._disable()
        await interaction.response.edit_message(view=self)
        self.stop()

    @discord.ui.button(label="❌ Cancel", style=discord.ButtonStyle.danger)
    async def cancel_btn(self, interaction, button):
        self.value = False
        self._disable()
        await interaction.response.edit_message(view=self)
        self.stop()

    async def on_timeout(self):
        self._disable()
        if self.message:
            try:
                await self.message.edit(view=self)
            except Exception:
                pass


class MatchReportCog(commands.Cog):
    def __init__(self, bot):
        self.bot = bot

    def _team_field_lines(self, rows, players_by_id):
        lines = []
        for r in rows:
            name = players_by_id.get(r.get("player_id"), {}).get("name", "?")
            agent = r.get("agent") or "?"
            kda = f"{r.get('kills', 0)}/{r.get('deaths', 0)}/{r.get('assists', 0)}"
            acs = int(r.get("acs") or 0)
            line = f"`{acs:>3}` **{name}** ({agent}) · {kda}"
            if r.get("is_sub"):
                sub_for = players_by_id.get(r.get("subbed_for_id"), {}).get("name")
                line += f" · 🔁 SUB{f' for {sub_for}' if sub_for else ''}"
            lines.append(line)
        return "\n".join(lines) or "—"

    def _build_series_embed(self, info, maps_data, players_by_id, title, color):
        w1 = sum(1 for md in maps_data if md["winner_id"] == info["team1_id"])
        w2 = sum(1 for md in maps_data if md["winner_id"] == info["team2_id"])
        winner = info["t1_name"] if w1 > w2 else info["t2_name"]
        embed = discord.Embed(
            title=title,
            description=(
                f"### {info['t1_name']}  `{w1}` — `{w2}`  {info['t2_name']}\n"
                f"🏆 **Winner:** {winner} · {info['format']} · Week **{info['week']}**"
                f" · Group **{info['group_name'] or '-'}** · Season `{info['season_id'] or 'S23'}`"
            ),
            color=color,
        )
        for md in maps_data:
            head = f"Map {md['index'] + 1} · {md['name']} · {md['t1_rounds']}-{md['t2_rounds']}"
            if md["is_forfeit"]:
                winner_name = info["t1_name"] if md["winner_id"] == info["team1_id"] else info["t2_name"]
                embed.add_field(name=f"🚩 {head}", value=f"Forfeit — awarded to **{winner_name}**", inline=False)
                continue
            embed.add_field(
                name=f"🗺️ {head} · {info['t1_tag'] or info['t1_name']}",
                value=self._team_field_lines(md["team1Rows"], players_by_id),
                inline=True,
            )
            embed.add_field(
                name=f"{info['t2_tag'] or info['t2_name']}",
                value=self._team_field_lines(md["team2Rows"], players_by_id),
                inline=True,
            )
            embed.add_field(name="​", value="​", inline=False)
        sub_count = sum(
            1 for md in maps_data if not md["is_forfeit"]
            for r in (md["team1Rows"] + md["team2Rows"]) if r.get("is_sub")
        )
        if sub_count:
            embed.add_field(name="🔁 Substitutes",
                            value=f"`{sub_count}` sub slot(s) detected — check the markers above.", inline=False)
        return embed

    @app_commands.command(name="report_match",
                          description="Report a match result from tracker.gg links (BO1/BO3/BO5, supports forfeits)")
    @app_commands.describe(
        match="The scheduled match to report (type a team name to search)",
        map1="Map 1: tracker.gg link/ID, or ff:<team tag> if the map was forfeited",
        map2="Map 2: tracker.gg link/ID, or ff:<team tag> (team that WINS the forfeit)",
        map3="Map 3: tracker.gg link/ID, or ff:<team tag>",
        map4="Map 4 (BO5): tracker.gg link/ID, or ff:<team tag>",
        map5="Map 5 (BO5): tracker.gg link/ID, or ff:<team tag>",
        forfeit="Full match forfeit: team tag/name that WINS by forfeit (leave map fields empty)",
        region="Valorant server region for stat lookup (default: eu)",
    )
    @app_commands.autocomplete(match=reportable_match_autocomplete)
    @app_commands.choices(region=REGION_CHOICES)
    async def report_match(self, interaction: discord.Interaction, match: str,
                           map1: str = None, map2: str = None, map3: str = None,
                           map4: str = None, map5: str = None,
                           forfeit: str = None, region: str = "eu"):
        # Optional role gate
        if REPORT_ROLE_IDS:
            member_roles = {r.id for r in getattr(interaction.user, "roles", [])}
            if not member_roles.intersection(REPORT_ROLE_IDS):
                return await interaction.response.send_message(
                    "❌ You don't have permission to report matches. Contact a moderator.", ephemeral=True)

        if not BOT_SECRET:
            return await interaction.response.send_message(
                "❌ Match reporting is not configured (missing BOT_SECRET). Contact a moderator.", ephemeral=True)

        await interaction.response.defer()
        try:
            mid = int(match)
        except ValueError:
            return await interaction.followup.send("❌ Invalid match selection.")

        info = await run_in_executor(_fetch_match_info, mid)
        if not info:
            return await interaction.followup.send(f"❌ Match `#{mid}` not found.")
        if info["status"] == "completed":
            return await interaction.followup.send(
                f"❌ Match `#{mid}` is already completed. Contact a moderator if the result needs to be changed.")

        # ---- Full match forfeit path ----
        if forfeit:
            winner_id, winner_name = _resolve_team_token(forfeit, info)
            if not winner_id:
                return await interaction.followup.send(
                    f"❌ `{forfeit}` doesn't match either team "
                    f"(**{info['t1_name']}** / **{info['t2_name']}**). Use the team tag, name, or 1/2.")
            embed = discord.Embed(
                title="🚩 Confirm Match Forfeit",
                description=(
                    f"**{info['t1_name']}** vs **{info['t2_name']}** · Week {info['week']}\n\n"
                    f"The match will be recorded as a **forfeit win for {winner_name}** (13-0, no maps played).\n"
                    f"⚠️ Any previously saved map data for this match will be wiped."
                ),
                color=V_GOLD,
            )
            view = ConfirmReportView(interaction.user.id)
            view.message = await interaction.followup.send(embed=embed, view=view, wait=True)
            await view.wait()
            if not view.value:
                embed.title = "🚫 Match Forfeit — Cancelled" if view.value is False else "⌛ Match Forfeit — Timed out"
                embed.color = V_RED
                return await view.message.edit(embed=embed)
            await run_in_executor(_apply_match_forfeit, mid, winner_id, info["team1_id"])
            await run_in_executor(_mark_reported, mid, interaction.channel_id, interaction.user.id)
            result = discord.Embed(
                title=f"✅ Match #{mid} Saved — Forfeit",
                description=(
                    f"### {info['t1_name']}  `{13 if winner_id == info['team1_id'] else 0}` — "
                    f"`{13 if winner_id == info['team2_id'] else 0}`  {info['t2_name']}\n"
                    f"🏆 **Winner:** {winner_name} (forfeit) · Week **{info['week']}** · Season `{info['season_id'] or 'S23'}`"
                ),
                color=V_TEAL,
            )
            result.set_footer(text=f"Reported by {interaction.user.display_name}")
            return await interaction.followup.send(embed=result)

        # ---- Normal series path ----
        raw_maps = [map1, map2, map3, map4, map5]
        map_inputs = []
        for i, v in enumerate(raw_maps):
            if v is None:
                if any(raw_maps[i + 1:]):
                    return await interaction.followup.send(
                        f"❌ Map fields must be filled in order — map{i + 1} is empty but a later map is set.")
                break
            map_inputs.append(v)

        fmt = info["format"] if info["format"] in WINS_NEEDED else "BO3"
        need, cap = WINS_NEEDED[fmt], MAP_CAP[fmt]
        if not map_inputs:
            return await interaction.followup.send(
                "❌ Provide at least `map1` (tracker.gg link) or use the `forfeit` option.")
        if len(map_inputs) > cap:
            return await interaction.followup.send(
                f"❌ This match is a **{fmt}** — at most {cap} map(s) allowed. "
                f"Contact a moderator if the format is wrong.")
        if len(map_inputs) < need:
            return await interaction.followup.send(
                f"❌ This match is a **{fmt}** — a team needs {need} map win(s), "
                f"so at least {need} map(s) are required.")

        all_players = await run_in_executor(_fetch_all_players)
        players_by_id = {p["id"]: p for p in all_players}

        maps_data = []
        undetected = []  # (map_number, [riot_ids])
        for i, entry in enumerate(map_inputs):
            ff = FF_RE.match(entry.strip())
            if ff:
                winner_id, winner_name = _resolve_team_token(ff.group(1), info)
                if not winner_id:
                    return await interaction.followup.send(
                        f"❌ Map {i + 1}: `{ff.group(1)}` doesn't match either team. Use the team tag, name, or 1/2.")
                maps_data.append({
                    "index": i, "name": "Forfeit",
                    "t1_rounds": 13 if winner_id == info["team1_id"] else 0,
                    "t2_rounds": 13 if winner_id == info["team2_id"] else 0,
                    "winner_id": winner_id, "is_forfeit": True, "tracker_id": None,
                    "team1Rows": [], "team2Rows": [], "rounds": [], "playerRounds": [],
                })
                continue

            tracker_id = _clean_tracker_id(entry)
            if not tracker_id:
                return await interaction.followup.send(f"❌ Map {i + 1}: couldn't read a match ID from `{entry}`.")

            payload = {
                "team1_id": info["team1_id"], "team2_id": info["team2_id"],
                "mapIndex": i, "allPlayers": all_players,
                "source": "url", "trackerUrl": tracker_id,
                "useApi": True, "apiRegion": region,
            }
            resp = await run_in_executor(_api_post, "/api/admin/maps/parse", payload)
            if resp.status_code != 200:
                try:
                    err = resp.json().get("error", resp.text)
                except Exception:
                    err = resp.text
                return await interaction.followup.send(f"❌ Map {i + 1}: failed to fetch match data — {err}")
            data = resp.json()

            missing = list((data.get("unmatched") or {}).get("team1", []))
            missing += list((data.get("unmatched") or {}).get("team2", []))
            fillers = sum(1 for r in data.get("team1Rows", []) + data.get("team2Rows", [])
                          if r.get("is_filler") or not r.get("player_id"))
            if missing:
                undetected.append((i + 1, missing))
                continue
            if fillers:
                undetected.append((i + 1, [f"(only {10 - fillers}/10 players found in the match data)"]))
                continue

            t1r, t2r = data["t1_rounds"], data["t2_rounds"]
            if t1r == t2r:
                return await interaction.followup.send(
                    f"❌ Map {i + 1} ({data.get('map_name', '?')}): tied score {t1r}-{t2r} — cannot determine a winner.")
            maps_data.append({
                "index": i, "name": data.get("map_name") or "Unknown",
                "t1_rounds": t1r, "t2_rounds": t2r,
                "winner_id": info["team1_id"] if t1r > t2r else info["team2_id"],
                "is_forfeit": False, "tracker_id": tracker_id,
                "team1Rows": data.get("team1Rows", []), "team2Rows": data.get("team2Rows", []),
                "rounds": data.get("rounds", []), "playerRounds": data.get("playerRounds", []),
            })

        if undetected:
            lines = []
            for map_no, rids in undetected:
                rid_list = "\n".join(f"> • `{r}`" for r in rids)
                lines.append(f"**Map {map_no}** — player(s) not found in the database:\n{rid_list}")
            embed = discord.Embed(
                title="❌ Match Report Blocked — Unknown Players",
                description=(
                    "\n\n".join(lines)
                    + "\n\nAll 10 players must be registered in the league database before a result "
                      "can be saved. **Please contact a moderator** to register or link these Riot IDs, then try again."
                ),
                color=V_RED,
            )
            return await interaction.followup.send(embed=embed)

        # Series must be decided exactly at the last provided map
        w1 = w2 = 0
        for md in maps_data:
            if max(w1, w2) >= need:
                return await interaction.followup.send(
                    f"❌ Map {md['index'] + 1} was provided but the series was already decided. "
                    f"A {fmt} ends when a team reaches {need} map win(s).")
            if md["winner_id"] == info["team1_id"]:
                w1 += 1
            else:
                w2 += 1
        if max(w1, w2) < need:
            return await interaction.followup.send(
                f"❌ Series incomplete: score is {w1}-{w2} but a {fmt} needs {need} map win(s). "
                f"Add the remaining map(s).")

        preview = self._build_series_embed(
            info, maps_data, players_by_id,
            f"📋 Match Report Preview · #{mid}", V_BLUE)
        preview.set_footer(
            text=f"Review the data above, then confirm to save · Requested by {interaction.user.display_name}")
        view = ConfirmReportView(interaction.user.id)
        view.message = await interaction.followup.send(embed=preview, view=view, wait=True)
        await view.wait()
        if not view.value:
            preview.title = (f"🚫 Match Report Cancelled · #{mid}" if view.value is False
                             else f"⌛ Match Report Timed Out · #{mid}")
            preview.color = V_RED
            return await view.message.edit(embed=preview)

        # Save each map through the portal API
        for md in maps_data:
            body = {
                "matchId": mid,
                "mapData": {
                    "index": md["index"], "name": md["name"],
                    "t1_rounds": md["t1_rounds"], "t2_rounds": md["t2_rounds"],
                    "winner_id": md["winner_id"], "is_forfeit": md["is_forfeit"],
                    "tracker_id": md["tracker_id"],
                },
                "playerStats": [
                    {**{k: v for k, v in r.items() if k not in ("rid", "is_filler")}, "team_id": tid}
                    for tid, rows in ((info["team1_id"], md["team1Rows"]), (info["team2_id"], md["team2Rows"]))
                    for r in rows
                ],
                "rounds": md["rounds"],
                "playerRounds": md["playerRounds"],
            }
            resp = await run_in_executor(_api_post, "/api/admin/maps/save", body)
            if resp.status_code != 200:
                try:
                    err = resp.json().get("error", resp.text)
                except Exception:
                    err = resp.text
                return await interaction.followup.send(
                    f"❌ Failed to save map {md['index'] + 1}: {err}\n"
                    f"⚠️ Earlier maps may already be saved — contact a moderator to verify match `#{mid}`.")

        await run_in_executor(_mark_reported, mid, interaction.channel_id, interaction.user.id)

        result = self._build_series_embed(
            info, maps_data, players_by_id,
            f"✅ Match Result Saved · #{mid}", V_TEAL)
        result.set_footer(text=f"Reported by {interaction.user.display_name}")
        await interaction.followup.send(embed=result)


async def setup(bot):
    await bot.add_cog(MatchReportCog(bot))
