/** GET — who is signed in on this request, if anyone. */

import { NextResponse } from 'next/server';
import { getRequestUser } from '../../../../lib/server/authSession';
import { NO_STORE } from '../../../../lib/server/requestGuards';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    const user = await getRequestUser(request);
    return NextResponse.json({ user: user ? { email: user.email } : null }, { headers: NO_STORE });
}
