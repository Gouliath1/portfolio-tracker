/**
 * POST { email } — email a single-use sign-in link.
 *
 * The response never reveals whether an address has an account, or whether it
 * was rate-limited per address: the same `{ ok: true }` comes back, so this
 * can't be used to probe for accounts. Abuse is bounded three ways: a
 * per-address hourly cap and an app-wide daily cap (both in the DB, so they
 * hold across instances), plus a best-effort per-IP limit.
 */

import { NextResponse } from 'next/server';
import { normalizeEmail, checkLoginRequestAllowed, createLoginToken } from '../../../../lib/server/authStore';
import { sendLoginEmail } from '../../../../lib/server/mailer';
import { appOrigin, isSameOrigin } from '../../../../lib/server/authSession';
import { clientIp, overLimit, NO_STORE } from '../../../../lib/server/requestGuards';

export const dynamic = 'force-dynamic';

const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: NO_STORE });

export async function POST(request: Request) {
    if (!isSameOrigin(request)) return json({ ok: false, error: 'Forbidden' }, 403);
    if (overLimit(`auth-req:${clientIp(request)}`, 10, 10 * 60_000)) {
        return json({ ok: false, error: 'Too many requests — try again later' }, 429);
    }

    let email: string | null = null;
    try {
        const raw = await request.text();
        if (raw.length > 2_000) return json({ ok: false, error: 'Invalid request' }, 400);
        email = normalizeEmail((JSON.parse(raw) as { email?: unknown }).email);
    } catch {
        return json({ ok: false, error: 'Invalid request' }, 400);
    }
    if (!email) return json({ ok: false, error: 'Enter a valid email address' }, 400);

    const origin = appOrigin(request);
    if (!origin) return json({ ok: false, error: 'Sign-in is not configured' }, 503);

    const allowed = await checkLoginRequestAllowed(email);
    if (!allowed.ok) {
        if (allowed.reason === 'unavailable') return json({ ok: false, error: 'Sign-in is unavailable' }, 503);
        if (allowed.reason === 'global') return json({ ok: false, error: 'Sign-in is busy — try again later' }, 429);
        return json({ ok: true }); // per-address cap: say nothing about it
    }

    const token = await createLoginToken(email);
    if (!token) return json({ ok: false, error: 'Sign-in is unavailable' }, 503);

    // The token travels in the URL fragment: it never reaches server logs, and
    // mail scanners that GET the link can't consume it — only the page's own
    // script posts it.
    const sent = await sendLoginEmail(email, `${origin}/auth/verify#t=${token}`);
    if (!sent.ok) {
        return json({ ok: false, error: sent.reason === 'not-configured' ? 'Sign-in is not configured' : 'Could not send the email' }, 502);
    }
    return json({ ok: true, ...(sent.devLink ? { devLink: sent.devLink } : {}) });
}
