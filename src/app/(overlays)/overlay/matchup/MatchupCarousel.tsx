"use client";

import { useEffect, useState } from "react";
import type { TeamPerformance } from "@/lib/data";

interface Props {
  t1: TeamPerformance;
  t2: TeamPerformance;
  seasonId: string;
}

type Slide = "overview" | "stats" | "players" | "maps";
const SLIDES: Slide[] = ["overview", "stats", "players", "maps"];
const SLIDE_LABELS: Record<Slide, string> = {
  overview: "Match Overview",
  stats: "Key Statistics",
  players: "Star Players",
  maps: "Map Mastery",
};
const SLIDE_DURATION = 10000; // 10 seconds

function pct(n: number) {
  return `${(n*100).toFixed(1)}%`;
}

function StatCompare({ label, v1, v2, format = "pct" }: { label: string; v1: number; v2: number; format?: "pct" | "num" }) {
  const t1Wins = v1 > v2;
  const t2Wins = v2 > v1;
  const display = (v: number) => format === "pct" ? pct(v) : v.toFixed(1);

  return (
    <div className="stat-compare-row">
      <span className={`stat-val ${t1Wins ? "stat-win" : t2Wins ? "stat-lose" : "stat-tie"}`}>{display(v1)}</span>
      <span className="stat-lbl">{label}</span>
      <span className={`stat-val ${t2Wins ? "stat-win" : t1Wins ? "stat-lose" : "stat-tie"}`}>{display(v2)}</span>
    </div>
  );
}

function OverviewSlide({ t1, t2 }: { t1: TeamPerformance; t2: TeamPerformance }) {
  const t1Matches = t1.summary.matchesCompleted;
  const t2Matches = t2.summary.matchesCompleted;

  return (
    <div className="slide-content">
      <div className="team-names-row">
        <div className="team-block">
          <div className="team-tag-badge">{t1.tag}</div>
          <div className="team-name-big">{t1.name}</div>
          <div className="team-group">Group {t1.group}</div>
        </div>
        <div className="vs-center">
          <div className="vs-text">VS</div>
          <div className="vs-sub">Week Matchup</div>
        </div>
        <div className="team-block team-block--right">
          <div className="team-tag-badge team-tag-badge--right">{t2.tag}</div>
          <div className="team-name-big">{t2.name}</div>
          <div className="team-group team-group--right">Group {t2.group}</div>
        </div>
      </div>
      <div className="divider" />
      <StatCompare label="Matches Played" v1={t1Matches} v2={t2Matches} format="num" />
    </div>
  );
}

function StatsSlide({ t1, t2 }: { t1: TeamPerformance; t2: TeamPerformance }) {
  return (
    <div className="slide-content">
      <StatCompare label="Round Win %" v1={t1.summary.roundWinRate} v2={t2.summary.roundWinRate} />
      <StatCompare label="Pistol Win %" v1={t1.summary.pistolWinRate} v2={t2.summary.pistolWinRate} />
      <StatCompare label="Avg Rounds / Map" v1={t1.summary.avgRoundsPerMap} v2={t2.summary.avgRoundsPerMap} format="num" />
    </div>
  );
}

function PlayersSlide({ t1, t2 }: { t1: TeamPerformance; t2: TeamPerformance }) {
  const star1 = [...t1.playerStats].sort((a, b) => b.avgAcs - a.avgAcs)[0];
  const star2 = [...t2.playerStats].sort((a, b) => b.avgAcs - a.avgAcs)[0];

  if (!star1 || !star2) {
    return <div className="slide-content flex items-center justify-center text-gray-500 italic">No player data available yet.</div>;
  }

  return (
    <div className="slide-content">
      <div className="player-matchup">
        <div className="player-card">
          <div className="player-label">STAR PLAYER</div>
          <div className="player-name-big">{star1.name}</div>
          <div className="player-kpi">{star1.avgAcs.toFixed(0)} <span className="kpi-lbl">ACS</span></div>
          <div className="player-kd">{star1.kd.toFixed(2)} K/D</div>
        </div>
        <div className="player-vs">
          <div className="sword-icon">⚔</div>
        </div>
        <div className="player-card player-card--right">
          <div className="player-label">STAR PLAYER</div>
          <div className="player-name-big">{star2.name}</div>
          <div className="player-kpi">{star2.avgAcs.toFixed(0)} <span className="kpi-lbl">ACS</span></div>
          <div className="player-kd">{star2.kd.toFixed(2)} K/D</div>
        </div>
      </div>
    </div>
  );
}

function MapsSlide({ t1, t2 }: { t1: TeamPerformance; t2: TeamPerformance }) {
  const top1 = [...t1.maps].sort((a, b) => (b.wins + b.losses) - (a.wins + a.losses)).slice(0, 3);
  const top2 = [...t2.maps].sort((a, b) => (b.wins + b.losses) - (a.wins + a.losses)).slice(0, 3);
  const allMaps = [...new Set([...top1.map(m => m.name), ...top2.map(m => m.name)])].slice(0, 3);

  const getWr = (maps: TeamPerformance["maps"], name: string) => {
    const m = maps.find(x => x.name === name);
    if (!m) return null;
    const total = m.wins + m.losses;
    return total > 0 ? m.wins / total : null;
  };

  if (allMaps.length === 0) {
    return <div className="slide-content flex items-center justify-center text-gray-500 italic">No map data available yet.</div>;
  }

  return (
    <div className="slide-content">
      {allMaps.map(map => {
        const wr1 = getWr(t1.maps, map);
        const wr2 = getWr(t2.maps, map);
        return (
          <div key={map} className="map-row">
            <span className={`map-wr ${wr1 !== null && wr2 !== null && wr1 > wr2 ? "stat-win" : wr1 !== null && wr2 !== null && wr1 < wr2 ? "stat-lose" : "stat-tie"}`}>
              {wr1 !== null ? pct(wr1) : "—"}
            </span>
            <span className="map-name">{map}</span>
            <span className={`map-wr ${wr2 !== null && wr1 !== null && wr2 > wr1 ? "stat-win" : wr2 !== null && wr1 !== null && wr2 < wr1 ? "stat-lose" : "stat-tie"}`}>
              {wr2 !== null ? pct(wr2) : "—"}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export default function MatchupCarousel({ t1, t2, seasonId }: Props) {
  const [currentIdx, setCurrentIdx] = useState(0);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const interval = setInterval(() => {
      setVisible(false);
      setTimeout(() => {
        setCurrentIdx(prev => (prev + 1) % SLIDES.length);
        setVisible(true);
      }, 400);
    }, SLIDE_DURATION);
    return () => clearInterval(interval);
  }, []);

  const slide = SLIDES[currentIdx];

  return (
    <div className="carousel-wrapper">
      {/* Header */}
      <div className="carousel-header">
        <div className="carousel-title">
          <div className="title-eyebrow">S{seasonId.replace('S', '')} · {SLIDE_LABELS[slide]}</div>
          <div className="title-teams">{t1.tag} <span className="title-vs">vs</span> {t2.tag}</div>
        </div>
        {/* Slide indicators */}
        <div className="slide-dots">
          {SLIDES.map((s, i) => (
            <button
              key={s}
              onClick={() => { setVisible(false); setTimeout(() => { setCurrentIdx(i); setVisible(true); }, 400); }}
              className={`slide-dot ${i === currentIdx ? "slide-dot--active" : ""}`}
            />
          ))}
        </div>
      </div>

      {/* Team labels bar */}
      <div className="team-labels-bar">
        <span className="team-label-left">{t1.name}</span>
        <span className="team-label-right">{t2.name}</span>
      </div>

      {/* Content */}
      <div className={`carousel-body ${visible ? "carousel-visible" : "carousel-hidden"}`}>
        {slide === "overview" && <OverviewSlide t1={t1} t2={t2} />}
        {slide === "stats" && <StatsSlide t1={t1} t2={t2} />}
        {slide === "players" && <PlayersSlide t1={t1} t2={t2} />}
        {slide === "maps" && <MapsSlide t1={t1} t2={t2} />}
      </div>

      {/* Footer */}
      <div className="carousel-footer">
        <div className="footer-line" />
        <span className="footer-text">FLV League</span>
        <div className="footer-line" />
      </div>

      <style>{`
        .carousel-wrapper {
          background: rgba(8,14,20,0.9);
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          border: 1px solid rgba(255,255,255,0.08);
          border-top: 2px solid #FF4655;
          border-radius: 14px;
          padding: 28px 36px;
          min-width: 580px;
          max-width: 700px;
          box-shadow: 0 32px 80px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,70,85,0.05);
        }
        .carousel-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 16px; }
        .title-eyebrow { font-family: 'Orbitron', sans-serif; font-size: 10px; font-weight: 700; letter-spacing: 0.25em; text-transform: uppercase; color: #FF4655; margin-bottom: 4px; }
        .title-teams { font-family: 'Orbitron', sans-serif; font-size: 22px; font-weight: 900; color: white; letter-spacing: 0.05em; }
        .title-vs { color: rgba(255,255,255,0.3); font-size: 16px; margin: 0 8px; }
        .slide-dots { display: flex; gap: 6px; margin-top: 4px; }
        .slide-dot { width: 8px; height: 8px; border-radius: 50%; background: rgba(255,255,255,0.15); border: none; cursor: pointer; transition: background 0.3s; }
        .slide-dot--active { background: #FF4655; }
        .team-labels-bar { display: grid; grid-template-columns: 1fr 1fr; margin-bottom: 12px; border-bottom: 1px solid rgba(255,255,255,0.06); padding-bottom: 10px; }
        .team-label-left { font-family: 'Orbitron', sans-serif; font-size: 11px; font-weight: 700; color: rgba(255,255,255,0.4); text-transform: uppercase; letter-spacing: 0.1em; }
        .team-label-right { font-family: 'Orbitron', sans-serif; font-size: 11px; font-weight: 700; color: rgba(255,255,255,0.4); text-transform: uppercase; letter-spacing: 0.1em; text-align: right; }
        .carousel-body { transition: opacity 0.4s ease, transform 0.4s ease; }
        .carousel-visible { opacity: 1; transform: translateY(0); }
        .carousel-hidden { opacity: 0; transform: translateY(8px); }
        .slide-content { display: flex; flex-direction: column; gap: 10px; min-height: 160px; }

        /* Stat compare */
        .stat-compare-row { display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; padding: 10px 0; border-bottom: 1px solid rgba(255,255,255,0.04); }
        .stat-val { font-family: 'Orbitron', sans-serif; font-size: 18px; font-weight: 800; }
        .stat-val:first-child { text-align: left; }
        .stat-val:last-child { text-align: right; }
        .stat-win { color: #3FD1FF; }
        .stat-lose { color: rgba(255,255,255,0.35); }
        .stat-tie { color: rgba(255,255,255,0.7); }
        .stat-lbl { font-family: 'Orbitron', sans-serif; font-size: 10px; font-weight: 700; letter-spacing: 0.15em; text-transform: uppercase; color: rgba(255,255,255,0.3); text-align: center; white-space: nowrap; padding: 0 16px; }

        /* Overview slide */
        .team-names-row { display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: 16px; margin-bottom: 16px; }
        .team-block { display: flex; flex-direction: column; gap: 4px; }
        .team-block--right { align-items: flex-end; }
        .team-tag-badge { font-family: 'Orbitron', sans-serif; font-size: 10px; font-weight: 900; color: #FF4655; letter-spacing: 0.2em; }
        .team-tag-badge--right { text-align: right; }
        .team-name-big { font-family: 'Orbitron', sans-serif; font-size: 17px; font-weight: 900; color: white; text-transform: uppercase; letter-spacing: 0.04em; }
        .team-group { font-family: 'Montserrat', sans-serif; font-size: 12px; color: rgba(255,255,255,0.35); }
        .team-group--right { text-align: right; }
        .vs-center { text-align: center; }
        .vs-text { font-family: 'Orbitron', sans-serif; font-size: 20px; font-weight: 900; color: rgba(255,70,85,0.8); }
        .vs-sub { font-family: 'Montserrat', sans-serif; font-size: 10px; color: rgba(255,255,255,0.2); text-transform: uppercase; letter-spacing: 0.1em; }
        .divider { height: 1px; background: rgba(255,255,255,0.06); margin: 4px 0; }

        /* Star players */
        .player-matchup { display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: 16px; margin-top: 10px; }
        .player-card { display: flex; flex-direction: column; gap: 6px; }
        .player-card--right { align-items: flex-end; }
        .player-label { font-family: 'Orbitron', sans-serif; font-size: 9px; font-weight: 700; color: #FF4655; letter-spacing: 0.2em; text-transform: uppercase; }
        .player-name-big { font-family: 'Montserrat', sans-serif; font-size: 18px; font-weight: 800; color: white; }
        .player-kpi { font-family: 'Orbitron', sans-serif; font-size: 28px; font-weight: 900; color: #3FD1FF; line-height: 1; }
        .kpi-lbl { font-size: 12px; font-weight: 600; color: rgba(63,209,255,0.5); }
        .player-kd { font-family: 'Montserrat', sans-serif; font-size: 13px; color: rgba(255,255,255,0.4); }
        .player-vs { text-align: center; }
        .sword-icon { font-size: 28px; opacity: 0.5; }

        /* Maps */
        .map-row { display: grid; grid-template-columns: 80px 1fr 80px; align-items: center; padding: 10px 0; border-bottom: 1px solid rgba(255,255,255,0.04); }
        .map-wr { font-family: 'Orbitron', sans-serif; font-size: 16px; font-weight: 800; }
        .map-wr:last-child { text-align: right; }
        .map-name { font-family: 'Montserrat', sans-serif; font-size: 13px; font-weight: 600; color: rgba(255,255,255,0.4); text-align: center; text-transform: uppercase; letter-spacing: 0.08em; }

        /* Footer */
        .carousel-footer { display: flex; align-items: center; gap: 10px; margin-top: 20px; opacity: 0.3; }
        .footer-line { flex: 1; height: 1px; background: rgba(255,255,255,0.3); }
        .footer-text { font-family: 'Orbitron', sans-serif; font-size: 10px; font-weight: 700; letter-spacing: 0.2em; text-transform: uppercase; color: white; white-space: nowrap; }
      `}</style>
    </div>
  );
}
