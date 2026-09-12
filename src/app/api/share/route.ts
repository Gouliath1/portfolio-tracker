/**
 * Share management — the portal's side of "Connect my AI".
 *
 * POST publishes (or refreshes) a snapshot under a token the browser
 * generated; DELETE revokes it; GET reports whether a token is still live, so
 * the UI can show an accurate state after a reload.
 *
 * The token never arrives in a query string on the write paths, and the
 * responses never echo it back. Query strings end up in server logs, browser
 * history and referrer headers; for the one credential that grants access to
 * someone's holdings, that is worth avoiding.
 */

import { NextRequest, NextResponse } from 'next/server';
import {
    putShare, deleteShare, getShare, isValidToken, SHARE_TTL_DAYS,
} from '../../../lib/server/shareStore';

export const dynamic = 'force-dynamic';

const NO_STORE = { 'cache-control': 'no-store, private' } as const;

const json = (body: unknown, status = 200) =>
    NextResponse.json(body, { status, headers: NO_STORE });

/** Generous enough for a large portfolio, small enough to bound abuse. */
const MAX_BYTES = 2 * 1024 * 1024;

async function readBody(request: NextRequest): Promise<Record<string, unknown> | null> {
    try {
        const raw = await request.text();
        if (raw.length > MAX_BYTES) return null;
        const parsed = JSON.parse(raw);
        return typeof parsed === 'object' && parsed !== null ? parsed : null;
    } catch {
        return null;
    }
}

export async function POST(request: NextRequest) {
    const body = await readBody(request);
    if (!body) return json({ ok: false, error: 'Invalid request body' }, 400);

    const { token, snapshot, markdown } = body as {
        token?: unknown; snapshot?: unknown; markdown?: unknown;
    };

    if (!isValidToken(token)) {
        return json({ ok: false, error: 'Invalid token' }, 400);
    }
    if (typeof snapshot !== 'object' || snapshot === null || typeof markdown !== 'string') {
        return json({ ok: false, error: 'Expected { snapshot: object, markdown: string }' }, 400);
    }

    const result = await putShare(token, snapshot, markdown);
    if (!result) {
        return json(
            { ok: false, error: 'Sharing is unavailable — no snapshot storage is configured' },
            503,
        );
    }

    return json({ ok: true, expiresAt: result.expiresAt, ttlDays: SHARE_TTL_DAYS });
}

export async function DELETE(request: NextRequest) {
    const body = await readBody(request);
    const token = body?.token;
    if (!isValidToken(token)) {
        return json({ ok: false, error: 'Invalid token' }, 400);
    }

    // Deleting an already-absent share reports success: the caller's intent —
    // "this must not be reachable" — is satisfied either way, and saying
    // otherwise would leak whether the token existed.
    await deleteShare(token);
    return json({ ok: true });
}

export async function GET(request: NextRequest) {
    // Read-only status check; the token identifies only the caller's own share.
    const token = request.nextUrl.searchParams.get('token');
    if (!isValidToken(token)) {
        return json({ ok: false, error: 'Invalid token' }, 400);
    }

    const share = await getShare(token);
    return json(share
        ? { ok: true, active: true, updatedAt: share.updatedAt, expiresAt: share.expiresAt }
        : { ok: true, active: false });
}
