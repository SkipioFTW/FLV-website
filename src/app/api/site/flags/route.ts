import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET() {
  // playoffs_public flag with fallback: true if max week >= 6
  try {
    const { data: rows } = await supabase.from('site_settings').select('key,value').eq('key', 'playoffs_public').limit(1);
    if (rows && rows.length > 0) {
      return NextResponse.json({ playoffs_public: rows[0].value === 'true' });
    }
  } catch {}
  try {
    const { data: weeks } = await supabase.from('matches').select('week').order('week', { ascending: false }).limit(1);
    const maxWeek = weeks && weeks.length > 0 ? (weeks[0].week || 0) : 0;
    return NextResponse.json({ playoffs_public: maxWeek >= 6 });
  } catch {
    return NextResponse.json({ playoffs_public: false });
  }
}
