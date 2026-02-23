import { NextRequest } from 'next/server';
import crypto from 'crypto';

export function isAuthorized(req: NextRequest) {
    const cookie = req.cookies.get('admin_session')?.value;
    const token = process.env.ADMIN_TOKEN;
    if (!cookie || !token) return false;

    try {
        const [ts, sig] = cookie.split('.');
        if (!ts || !sig) return false;

        const msg = `admin:${ts}`;
        const expected = crypto.createHmac('sha256', token).update(msg).digest('hex');

        // Check signature
        if (expected !== sig) return false;

        // Check if token is within 12 hours (same as update/route.ts)
        const fresh = Math.abs(Date.now() - Number(ts)) < 12 * 60 * 60 * 1000;
        return fresh;
    } catch (e) {
        return false;
    }
}
