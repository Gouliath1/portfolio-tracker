/**
 * Request-side helpers for accounts: the session cookie, the signed-in user for
 * a request, and the same-origin check that stands in for CSRF tokens.
 */

import { getSessionUser, SESSION_TTL_MS, type AuthUser } from './authStore';

export const SESSION_COOKIE = 'pt_session';

const isProd = () => process.env.NODE_ENV === 'production';

export function readCookie(request: Request, name: string): string | null {
    const header = request.headers.get('cookie');
    if (!header) return null;
    for (const part of header.split(';')) {
        const eq = part.indexOf('=');
        if (eq > 0 && part.slice(0, eq).trim() === name) return decodeURIComponent(part.slice(eq + 1).trim());
    }
    return null;
}

export const getRequestUser = (request: Request): Promise<AuthUser | null> =>
    getSessionUser(readCookie(request, SESSION_COOKIE));

/** HttpOnly (scripts can't read it), Secure in production, Lax so it isn't sent on cross-site POSTs. */
export function sessionCookie(sessionId: string): string {
    return `${SESSION_COOKIE}=${sessionId}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}${isProd() ? '; Secure' : ''}`;
}

export function clearedSessionCookie(): string {
    return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${isProd() ? '; Secure' : ''}`;
}

/**
 * State-changing auth requests must come from this site. Browsers always send
 * `Origin` on cross-origin and fetch POSTs, so a missing or foreign Origin is
 * refused. Together with SameSite=Lax this closes CSRF without tokens.
 */
export function isSameOrigin(request: Request): boolean {
    const origin = request.headers.get('origin');
    const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host');
    if (!origin || !host) return false;
    try { return new URL(origin).host === host; } catch { return false; }
}

/**
 * Where sign-in links point. In production this must come from configuration:
 * building it from the Host header would let an attacker request a link for
 * someone else's address and have the email point at a domain they control.
 */
export function appOrigin(request: Request): string | null {
    const configured = process.env.APP_URL?.replace(/\/+$/, '');
    if (configured) return configured;
    if (isProd()) return null;
    return new URL(request.url).origin;
}
