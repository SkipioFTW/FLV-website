import os
from supabase import create_client, Client
from dotenv import load_dotenv

dotenv_path = os.path.join(os.path.dirname(__file__), '..', '.env.local')
load_dotenv(dotenv_path)

url: str = os.getenv("NEXT_PUBLIC_SUPABASE_URL")
key: str = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
if not key:
    key = os.getenv("NEXT_PUBLIC_SUPABASE_ANON_KEY")

supabase: Client = create_client(url, key)

rank_mapping = {
    '7pr': 'Immortal 3/Radiant',
    '6pr': 'Immortal 1/2',
    '5pr': 'Ascendant',
    '4pr': 'Diamond',
    '3pr': 'Platinum',
    '2pr': 'Gold',
    '1pr': 'Silver',
    '0pr': 'Iron/Bronze'
}

def fix_ranks():
    print("Fixing players...")
    for old_rank, new_rank in rank_mapping.items():
        res = supabase.table('players').update({'rank': new_rank}).eq('rank', old_rank).execute()
        print(f"Updated {len(res.data)} players from {old_rank} to {new_rank}")
    
    print("Fetching player_history for deduplication and rank fixes...")
    try:
        res = supabase.table('player_history').select('*').execute()
        histories = res.data
        
        seen = {}
        to_delete = []
        
        for h in histories:
            pid = h.get('player_id')
            sid = h.get('season_id')
            key_tuple = (pid, sid)
            hid = h.get('id')
            
            if key_tuple not in seen:
                seen[key_tuple] = hid
                r = h.get('rank')
                if r in rank_mapping:
                    supabase.table('player_history').update({'rank': rank_mapping[r]}).eq('id', hid).execute()
            else:
                to_delete.append(hid)
                
        if to_delete:
            print(f"Deleting {len(to_delete)} duplicate player_history entries...")
            for split in range(0, len(to_delete), 100):
                batch = to_delete[split:split+100]
                supabase.table('player_history').delete().in_('id', batch).execute()
    except Exception as e:
        print(f"Failed handling player_history table (might not exist or missing rank column): {e}")
        
    print("Database rank fixing and deduplication completed successfully.")

if __name__ == "__main__":
    fix_ranks()
