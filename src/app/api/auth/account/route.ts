/** DELETE — delete the signed-in account, all its sessions, and its synced portfolio. */

import { NextResponse } from 'next/server';
import { deleteAccount } from '../../../../lib/server/authStore';
import { getRequestUser, isSameOrigin, clearedSessionCookie } from '../../../../lib/server/authSession';
import { NO_STORE } from '../../../../lib/server/requestGuards';

export const dynamic = 'force-dynamic';

export async function DELETE(request: Request) {
    if (!isSameOrigin(request)) return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403, headers: NO_STORE });
    const user = await getRequestUser(request);
    if (!user) return NextResponse.json({ ok: false, error: 'Not signed in' }, { status: 401, headers: NO_STORE });

    await deleteAccount(user.id);
    return NextResponse.json({ ok: true }, { headers: { ...NO_STORE, 'Set-Cookie': clearedSessionCookie() } });
}
