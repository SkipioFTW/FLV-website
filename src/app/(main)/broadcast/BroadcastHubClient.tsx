"use client";

import { useState, useEffect } from "react";

type Team = { id: number; name: string; tag: string };
type Player = { id: number; name: string; riot_id: string; team: string };

interface Props {
  teams: Team[];
  players: Player[];
  seasonId: string;
}

export default function BroadcastHubClient({ teams, players, seasonId }: Props) {
  const [baseUrl, setBaseUrl] = useState("");
  
  useEffect(() => {
    if (typeof window !== "undefined") {
      setBaseUrl(window.location.origin);
    }
  }, []);

  const [standingsGroup, setStandingsGroup] = useState("A");
  const [player1, setPlayer1] = useState(players[0]?.id?.toString() || "");
  const [player2, setPlayer2] = useState(players[1]?.id?.toString() || "");
  const [team1, setTeam1] = useState(teams[0]?.id?.toString() || "");
  const [team2, setTeam2] = useState(teams[1]?.id?.toString() || "");

  const copyToClipboard = (url: string) => {
    navigator.clipboard.writeText(url);
    alert("OBS URL Copied to clipboard!");
  };

  const getUrl = (path: string) => `${baseUrl}/overlay/${path}`;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      
      {/* STANDINGS OVERLAY */}
      <div className="glass p-6 rounded-xl border border-white/5">
        <h2 className="text-xl font-display font-semibold text-val-blue mb-4">Standings Overlay</h2>
        <p className="text-sm text-gray-400 mb-4">Displays the current standings for a specific group.</p>
        <div className="mb-4">
          <label className="block text-sm text-gray-300 mb-2">Select Group</label>
          <select 
            className="w-full bg-val-deep border border-white/10 rounded-md p-2 text-white outline-none focus:border-val-red"
            value={standingsGroup}
            onChange={(e) => setStandingsGroup(e.target.value)}
          >
            {['A', 'B', 'C', 'D'].map(g => <option key={g} value={g}>Group {g}</option>)}
          </select>
        </div>
        <button 
          onClick={() => copyToClipboard(getUrl(`standings?season=${seasonId}&group=${standingsGroup}`))}
          className="w-full bg-val-red hover:bg-val-red/80 text-white font-bold py-2 rounded transition-colors"
        >
          Copy OBS Link
        </button>
      </div>

      {/* PLAYOFFS OVERLAY */}
      <div className="glass p-6 rounded-xl border border-white/5">
        <h2 className="text-xl font-display font-semibold text-val-blue mb-4">Playoffs Bracket Overlay</h2>
        <p className="text-sm text-gray-400 mb-4">Displays the interactive playoff bracket for the season.</p>
        <div className="mb-4 h-[72px] flex items-center text-sm text-gray-500 italic">
          No additional configuration needed.
        </div>
        <button 
          onClick={() => copyToClipboard(getUrl(`playoffs?season=${seasonId}`))}
          className="w-full bg-val-red hover:bg-val-red/80 text-white font-bold py-2 rounded transition-colors"
        >
          Copy OBS Link
        </button>
      </div>

      {/* PLAYER COMPARISON OVERLAY */}
      <div className="glass p-6 rounded-xl border border-white/5">
        <h2 className="text-xl font-display font-semibold text-val-blue mb-4">Player Comparison Overlay</h2>
        <p className="text-sm text-gray-400 mb-4">Side-by-side stats comparison of two players.</p>
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-sm text-gray-300 mb-2">Player 1</label>
            <select 
              className="w-full bg-val-deep border border-white/10 rounded-md p-2 text-white outline-none focus:border-val-red"
              value={player1}
              onChange={(e) => setPlayer1(e.target.value)}
            >
              {players.map(p => <option key={p.id} value={p.id}>{p.name} ({p.team})</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm text-gray-300 mb-2">Player 2</label>
            <select 
              className="w-full bg-val-deep border border-white/10 rounded-md p-2 text-white outline-none focus:border-val-red"
              value={player2}
              onChange={(e) => setPlayer2(e.target.value)}
            >
              {players.map(p => <option key={p.id} value={p.id}>{p.name} ({p.team})</option>)}
            </select>
          </div>
        </div>
        <button 
          onClick={() => copyToClipboard(getUrl(`player-comparison?season=${seasonId}&p1=${player1}&p2=${player2}`))}
          className="w-full bg-val-red hover:bg-val-red/80 text-white font-bold py-2 rounded transition-colors"
        >
          Copy OBS Link
        </button>
      </div>

      {/* MATCHUP CAROUSEL OVERLAY */}
      <div className="glass p-6 rounded-xl border border-white/5">
        <h2 className="text-xl font-display font-semibold text-val-blue mb-4">Matchup Overlay</h2>
        <p className="text-sm text-gray-400 mb-4">Rotating cards showing team stats and head-to-head info.</p>
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-sm text-gray-300 mb-2">Team 1</label>
            <select 
              className="w-full bg-val-deep border border-white/10 rounded-md p-2 text-white outline-none focus:border-val-red"
              value={team1}
              onChange={(e) => setTeam1(e.target.value)}
            >
              {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm text-gray-300 mb-2">Team 2</label>
            <select 
              className="w-full bg-val-deep border border-white/10 rounded-md p-2 text-white outline-none focus:border-val-red"
              value={team2}
              onChange={(e) => setTeam2(e.target.value)}
            >
              {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
        </div>
        <button 
          onClick={() => copyToClipboard(getUrl(`matchup?season=${seasonId}&t1=${team1}&t2=${team2}`))}
          className="w-full bg-val-red hover:bg-val-red/80 text-white font-bold py-2 rounded transition-colors"
        >
          Copy OBS Link
        </button>
      </div>

    </div>
  );
}
