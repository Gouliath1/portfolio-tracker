/** POST — end this session (revoked server-side, cookie cleared). */

import { NextResponse } from 'next/server';
import { deleteSession } from '../../../../lib/server/authStore';
import { SESSION_COOKIE, readCookie, isSameOrigin, clearedSessionCookie } from '../../../../lib/server/authSession';
import { NO_STORE } from '../../../../lib/server/requestGuards';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
    if (!isSameOrigin(request)) return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403, headers: NO_STORE });
    await deleteSession(readCookie(request, SESSION_COOKIE));
    return NextResponse.json({ ok: true }, { headers: { ...NO_STORE, 'Set-Cookie': clearedSessionCookie() } });
}
