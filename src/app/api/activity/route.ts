import { NextRequest, NextResponse } from 'next/server';
import { updateSessionActivity } from '@/lib/data';

export async function GET(req: NextRequest) {
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0] || '127.0.0.1';
    await updateSessionActivity(ip);
    return NextResponse.json({ ok: true });
}
