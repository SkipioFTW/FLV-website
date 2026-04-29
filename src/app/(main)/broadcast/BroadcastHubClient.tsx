"use client";

import { useState, useEffect, useRef } from "react";

type Team = { id: number; name: string; tag: string };
type Player = { id: number; name: string; riot_id: string; team: string };

interface Props {
  teams: Team[];
  players: Player[];
  seasonId: string;
}

function SearchableSelect({ 
  label, 
  options, 
  value, 
  onChange, 
  placeholder 
}: { 
  label: string; 
  options: { id: string; label: string; sublabel?: string }[]; 
  value: string; 
  onChange: (val: string) => void;
  placeholder: string;
}) {
  const [search, setSearch] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Find the label for the current value
  const selectedOption = options.find(opt => opt.id === value);
  const displayValue = selectedOption ? selectedOption.label : "";

  const filteredOptions = options.filter(opt => 
    opt.label.toLowerCase().includes(search.toLowerCase()) || 
    (opt.sublabel && opt.sublabel.toLowerCase().includes(search.toLowerCase()))
  );

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="relative mb-4" ref={containerRef}>
      <label className="block text-sm text-gray-300 mb-2">{label}</label>
      <div 
        className="w-full bg-val-deep border border-white/10 rounded-md p-2 text-white outline-none focus-within:border-val-red cursor-text flex items-center justify-between"
        onClick={() => setIsOpen(true)}
      >
        <input
          type="text"
          className="bg-transparent border-none outline-none w-full text-white placeholder:text-gray-500"
          placeholder={displayValue || placeholder}
          value={isOpen ? search : displayValue}
          onChange={(e) => {
            setSearch(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => {
            setSearch("");
            setIsOpen(true);
          }}
        />
        <svg className={`w-4 h-4 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </div>

      {isOpen && (
        <div className="absolute z-50 w-full mt-1 bg-val-deep border border-white/10 rounded-md shadow-xl max-h-60 overflow-y-auto custom-scrollbar">
          {filteredOptions.length > 0 ? (
            filteredOptions.map(opt => (
              <div
                key={opt.id}
                className="p-2 hover:bg-val-red/20 cursor-pointer text-sm"
                onClick={() => {
                  onChange(opt.id);
                  setSearch("");
                  setIsOpen(false);
                }}
              >
                <div className="font-medium text-white">{opt.label}</div>
                {opt.sublabel && <div className="text-xs text-gray-400">{opt.sublabel}</div>}
              </div>
            ))
          ) : (
            <div className="p-2 text-sm text-gray-500 italic">No results found</div>
          )}
        </div>
      )}
    </div>
  );
}

export default function BroadcastHubClient({ teams, players, seasonId }: Props) {
  const [baseUrl, setBaseUrl] = useState("");
  
  useEffect(() => {
    if (typeof window !== "undefined") {
      setBaseUrl(window.location.origin);
    }
  }, []);

  const [standingsGroup, setStandingsGroup] = useState("Earth");
  const [player1, setPlayer1] = useState("");
  const [player2, setPlayer2] = useState("");
  const [team1, setTeam1] = useState("");
  const [team2, setTeam2] = useState("");

  // Initialize defaults if available
  useEffect(() => {
    if (players.length >= 2) {
      if (!player1) setPlayer1(players[0].id.toString());
      if (!player2) setPlayer2(players[1].id.toString());
    }
    if (teams.length >= 2) {
      if (!team1) setTeam1(teams[0].id.toString());
      if (!team2) setTeam2(teams[1].id.toString());
    }
  }, [players, teams]);

  const copyToClipboard = (url: string) => {
    navigator.clipboard.writeText(url);
    alert("OBS URL Copied to clipboard!");
  };

  const getUrl = (path: string) => `${baseUrl}/overlay/${path}`;

  const teamOptions = teams.map(t => ({ id: t.id.toString(), label: t.name, sublabel: t.tag }));
  const playerOptions = players.map(p => ({ id: p.id.toString(), label: p.name, sublabel: `${p.riot_id} (${p.team})` }));

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pb-20">
      
      {/* STANDINGS OVERLAY */}
      <div className="glass p-6 rounded-xl border border-white/5 flex flex-col h-full">
        <h2 className="text-xl font-display font-semibold text-val-blue mb-4 uppercase tracking-tight">Standings Overlay</h2>
        <p className="text-sm text-gray-400 mb-6">Displays the current standings for a specific group.</p>
        
        <div className="flex-1">
          <label className="block text-sm text-gray-300 mb-2">Select Group</label>
          <div className="grid grid-cols-2 gap-2 mb-6">
            {['Earth', 'Fire', 'Water', 'Air'].map(g => (
              <button
                key={g}
                onClick={() => setStandingsGroup(g)}
                className={`py-2 px-3 rounded-md border text-sm transition-all font-display uppercase tracking-wider ${
                  standingsGroup === g 
                  ? 'bg-val-red border-val-red text-white shadow-lg shadow-val-red/20' 
                  : 'bg-val-deep border-white/10 text-gray-400 hover:border-white/30'
                }`}
              >
                {g}
              </button>
            ))}
          </div>
        </div>

        <button 
          onClick={() => copyToClipboard(getUrl(`standings?season=${seasonId}&group=${standingsGroup}`))}
          className="w-full bg-val-red hover:bg-val-red/80 text-white font-display font-bold py-3 rounded-md transition-all uppercase tracking-widest text-sm"
        >
          Copy Standings Link
        </button>
      </div>

      {/* PLAYOFFS OVERLAY */}
      <div className="glass p-6 rounded-xl border border-white/5 flex flex-col h-full">
        <h2 className="text-xl font-display font-semibold text-val-blue mb-4 uppercase tracking-tight">Playoffs Bracket Overlay</h2>
        <p className="text-sm text-gray-400 mb-6">Displays the interactive playoff bracket for the season.</p>
        <div className="flex-1 flex items-center justify-center text-sm text-gray-500 italic mb-6 bg-black/20 rounded-lg p-4">
          No additional configuration needed.
        </div>
        <button 
          onClick={() => copyToClipboard(getUrl(`playoffs?season=${seasonId}`))}
          className="w-full bg-val-red hover:bg-val-red/80 text-white font-display font-bold py-3 rounded-md transition-all uppercase tracking-widest text-sm"
        >
          Copy Bracket Link
        </button>
      </div>

      {/* PLAYER COMPARISON OVERLAY */}
      <div className="glass p-6 rounded-xl border border-white/5 flex flex-col h-full">
        <h2 className="text-xl font-display font-semibold text-val-blue mb-4 uppercase tracking-tight">Player Comparison Overlay</h2>
        <p className="text-sm text-gray-400 mb-6">Side-by-side stats comparison of two players.</p>
        
        <div className="flex-1">
          <div className="grid grid-cols-1 gap-2">
            <SearchableSelect 
              label="Player 1"
              placeholder="Search player name or Riot ID..."
              options={playerOptions}
              value={player1}
              onChange={setPlayer1}
            />
            <SearchableSelect 
              label="Player 2"
              placeholder="Search player name or Riot ID..."
              options={playerOptions}
              value={player2}
              onChange={setPlayer2}
            />
          </div>
        </div>

        <button 
          onClick={() => copyToClipboard(getUrl(`player-comparison?season=${seasonId}&p1=${player1}&p2=${player2}`))}
          className="w-full bg-val-red hover:bg-val-red/80 text-white font-display font-bold py-3 rounded-md transition-all uppercase tracking-widest text-sm mt-4"
        >
          Copy Comparison Link
        </button>
      </div>

      {/* MATCHUP CAROUSEL OVERLAY */}
      <div className="glass p-6 rounded-xl border border-white/5 flex flex-col h-full">
        <h2 className="text-xl font-display font-semibold text-val-blue mb-4 uppercase tracking-tight">Matchup Overlay</h2>
        <p className="text-sm text-gray-400 mb-6">Rotating cards showing team stats and head-to-head info.</p>
        
        <div className="flex-1">
          <div className="grid grid-cols-1 gap-2">
            <SearchableSelect 
              label="Team 1"
              placeholder="Search team name..."
              options={teamOptions}
              value={team1}
              onChange={setTeam1}
            />
            <SearchableSelect 
              label="Team 2"
              placeholder="Search team name..."
              options={teamOptions}
              value={team2}
              onChange={setTeam2}
            />
          </div>
        </div>

        <button 
          onClick={() => copyToClipboard(getUrl(`matchup?season=${seasonId}&t1=${team1}&t2=${team2}`))}
          className="w-full bg-val-red hover:bg-val-red/80 text-white font-display font-bold py-3 rounded-md transition-all uppercase tracking-widest text-sm mt-4"
        >
          Copy Matchup Link
        </button>
      </div>

    </div>
  );
}
