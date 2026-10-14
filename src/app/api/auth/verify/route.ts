/** POST { token } — redeem a sign-in link and start a session (sets the cookie). */

import { NextResponse } from 'next/server';
import { consumeLoginToken, createSession } from '../../../../lib/server/authStore';
import { isSameOrigin, sessionCookie } from '../../../../lib/server/authSession';
import { clientIp, overLimit, NO_STORE } from '../../../../lib/server/requestGuards';

export const dynamic = 'force-dynamic';

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
    NextResponse.json(body, { status, headers: { ...NO_STORE, ...headers } });

export async function POST(request: Request) {
    if (!isSameOrigin(request)) return json({ ok: false, error: 'Forbidden' }, 403);
    if (overLimit(`auth-verify:${clientIp(request)}`, 20, 10 * 60_000)) {
        return json({ ok: false, error: 'Too many attempts' }, 429);
    }

    let token: unknown;
    try { token = (JSON.parse(await request.text()) as { token?: unknown }).token; }
    catch { return json({ ok: false, error: 'Invalid request' }, 400); }

    const user = await consumeLoginToken(token);
    // One message for unknown, used and expired: a probe learns nothing.
    if (!user) return json({ ok: false, error: 'This sign-in link is invalid or has expired' }, 400);

    const session = await createSession(user.id);
    if (!session) return json({ ok: false, error: 'Sign-in is unavailable' }, 503);

    return json({ ok: true, user: { email: user.email } }, 200, { 'Set-Cookie': sessionCookie(session) });
}
