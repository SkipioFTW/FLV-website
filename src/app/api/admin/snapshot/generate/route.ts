import { NextRequest, NextResponse } from 'next/server';
import { isAuthorized } from '@/lib/adminAuth';
import { generateLeagueSnapshot } from '@/lib/ai/snapshot';
import { supabaseServer } from '@/lib/supabaseServer';

/**
 * POST /api/admin/snapshot/generate
 *
 * Admin-only route that generates a fresh league snapshot
 * and saves it to the league_snapshots table.
 *
 * The previous active snapshot is deactivated first.
 */
export async function POST(req: NextRequest) {
    if (!isAuthorized(req)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        // 1. Generate the snapshot
        const snapshot = await generateLeagueSnapshot();

        // 2. Deactivate all existing snapshots
        const { error: deactivateErr } = await supabaseServer
            .from('league_snapshots')
            .update({ is_active: false })
            .eq('is_active', true);

        if (deactivateErr) {
            console.error('Deactivate error:', deactivateErr);
            // Non-fatal — proceed to insert
        }

        // 3. Insert the new active snapshot
        const { error: insertErr } = await supabaseServer
            .from('league_snapshots')
            .insert({
                data: snapshot,
                is_active: true,
                generated_by: 'admin',
            });

        if (insertErr) {
            console.error('Insert error:', insertErr);
            return NextResponse.json({ error: `Failed to save snapshot: ${insertErr.message}` }, { status: 500 });
        }

        return NextResponse.json({
            ok: true,
            at: snapshot.at,
            ov: snapshot.ov,
        });
    } catch (err: any) {
        console.error('Snapshot generation error:', err);
        return NextResponse.json({ error: err.message || 'Failed to generate snapshot' }, { status: 500 });
    }
}

/**
 * GET /api/admin/snapshot/generate
 *
 * Returns the currently active snapshot metadata (not the full data).
 */
export async function GET(req: NextRequest) {
    if (!isAuthorized(req)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const { data, error } = await supabaseServer
            .from('league_snapshots')
            .select('id, created_at, is_active, generated_by, data')
            .eq('is_active', true)
            .limit(1);

        if (error) throw error;

        if (!data || data.length === 0) {
            return NextResponse.json({ snapshot: null, message: 'No active snapshot found' });
        }

        return NextResponse.json({ snapshot: data[0] });
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
