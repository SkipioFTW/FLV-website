import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';

export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const teamId = searchParams.get('teamId');
    const groupName = searchParams.get('groupName');

    if (!teamId || !groupName) {
        return NextResponse.json({ error: 'bad request' }, { status: 400 });
    }

    try {
        const { data, error } = await supabaseServer
            .from('ai_scenarios')
            .select('scenario')
            .eq('team_id', teamId)
            .eq('group_name', groupName)
            .maybeSingle();

        if (error) throw error;
        return NextResponse.json({ scenario: data?.scenario || null });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
