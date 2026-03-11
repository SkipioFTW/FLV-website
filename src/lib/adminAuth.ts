import { NextRequest } from 'next/server';
import crypto from 'crypto';

/**
 * Securely compare two strings to prevent timing attacks.
 * Hashes both strings before comparison to handle varying lengths safely.
 */
export function secureCompare(a: string, b: string): boolean {
    if (typeof a !== 'string' || typeof b !== 'string') return false;
    const hashA = crypto.createHash('sha256').update(a).digest();
    const hashB = crypto.createHash('sha256').update(b).digest();
    return crypto.timingSafeEqual(hashA, hashB);
}

export function isAuthorized(req: NextRequest) {
    const cookie = req.cookies.get('admin_session')?.value;
    const token = process.env.ADMIN_TOKEN;
    if (!cookie || !token) return false;

    try {
        const [ts, sig] = cookie.split('.');
        if (!ts || !sig) return false;

        const msg = `admin:${ts}`;
        const expected = crypto.createHmac('sha256', token).update(msg).digest('hex');

        // Check signature using timing-safe comparison
        if (!secureCompare(expected, sig)) return false;

        // Check if token is within 12 hours
        const tsNum = Number(ts);
        if (isNaN(tsNum)) return false;

        const fresh = Math.abs(Date.now() - tsNum) < 12 * 60 * 60 * 1000;
        return fresh;
    } catch {
        return false;
    }
}
