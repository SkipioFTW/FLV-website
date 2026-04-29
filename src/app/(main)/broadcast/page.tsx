import { supabase } from "@/lib/supabase";
import BroadcastHubClient from "./BroadcastHubClient";
import { getDefaultSeason } from "@/lib/data";

export default async function BroadcastHubPage() {
  const seasonId = await getDefaultSeason();
  
  // Fetch Teams
  const { data: teamsData } = await supabase
    .from('teams')
    .select('id, name, tag')
    .order('name');
    
  // Fetch Players
  const { data: playersData } = await supabase
    .from('players')
    .select('id, name, riot_id')
    .order('name');

  return (
    <div className="container mx-auto p-8 pt-32">
      <div className="mb-8 border-l-4 border-val-red pl-4">
        <h1 className="text-4xl font-display font-bold uppercase tracking-wider text-white">Broadcast Hub</h1>
        <p className="text-gray-400 mt-2 font-sans">
          Production suite for generating transparent OBS overlays. Ensure your OBS Browser Source is set to 1920x1080.
        </p>
      </div>
      
      <BroadcastHubClient 
        teams={teamsData || []} 
        players={playersData || []} 
        seasonId={seasonId}
      />
    </div>
  );
}
