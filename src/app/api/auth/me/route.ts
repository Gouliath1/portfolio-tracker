/**
 * GET   — who is signed in on this request, if anyone.
 * PATCH — { name } set the display name shown in the app (empty clears it).
 */

import { NextResponse } from 'next/server';
import { normalizeDisplayName, updateUserName } from '../../../../lib/server/authStore';
import { getRequestUser, isSameOrigin } from '../../../../lib/server/authSession';
import { NO_STORE } from '../../../../lib/server/requestGuards';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    const user = await getRequestUser(request);
    return NextResponse.json(
        { user: user ? { email: user.email, name: user.name } : null },
        { headers: NO_STORE },
    );
}

export async function PATCH(request: Request) {
    if (!isSameOrigin(request)) return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403, headers: NO_STORE });
    const user = await getRequestUser(request);
    if (!user) return NextResponse.json({ ok: false, error: 'Not signed in' }, { status: 401, headers: NO_STORE });

    let raw: unknown;
    try {
        const text = await request.text();
        if (text.length > 1_000) return NextResponse.json({ ok: false, error: 'Invalid request' }, { status: 400, headers: NO_STORE });
        raw = (JSON.parse(text) as { name?: unknown }).name;
    } catch {
        return NextResponse.json({ ok: false, error: 'Invalid request' }, { status: 400, headers: NO_STORE });
    }
    if (typeof raw !== 'string') return NextResponse.json({ ok: false, error: 'Expected { name: string }' }, { status: 400, headers: NO_STORE });

    const name = normalizeDisplayName(raw);
    await updateUserName(user.id, name);
    return NextResponse.json({ ok: true, user: { email: user.email, name } }, { headers: NO_STORE });
}
