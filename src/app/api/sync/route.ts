/**
 * Cross-device sync — the portal's side of "sync my portfolio".
 *
 * Opt-in: nothing reaches this route unless the user enabled sync. The key
 * (token) is generated in the browser and sent in the request body, never in
 * a query string, for the same log/history/referrer reasons as /api/share.
 * The server stores an opaque, versioned blob and never inspects it.
 *
 *   POST   { token, blob, baseVersion }  push (baseVersion 0 = create); 409 on a stale base
 *   PUT    { token }                     pull the current blob
 *   DELETE { token }                     revoke
 */

import { NextRequest, NextResponse } from 'next/server';
import { isValidToken } from '../../../lib/server/shareStore';
import {
    getSync, pushSync, deleteSync, syncUnavailableReason, SYNC_TTL_DAYS,
} from '../../../lib/server/syncStore';

export const dynamic = 'force-dynamic';

const NO_STORE = { 'cache-control': 'no-store, private' } as const;

const json = (body: unknown, status = 200) =>
    NextResponse.json(body, { status, headers: NO_STORE });

/** Generous enough for a large portfolio, small enough to bound abuse. */
const MAX_BYTES = 2 * 1024 * 1024;

// Best-effort per-instance limiter. Serverless instances don't share memory,
// so this only blunts a single hot client; real limits belong at the edge.
const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 60;
const hits = new Map<string, { count: number; resetAt: number }>();

function rateLimited(request: NextRequest, now = Date.now()): boolean {
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'unknown';
    const entry = hits.get(ip);
    if (!entry || entry.resetAt <= now) {
        if (hits.size > 5000) hits.clear();
        hits.set(ip, { count: 1, resetAt: now + WINDOW_MS });
        return false;
    }
    entry.count += 1;
    return entry.count > MAX_REQUESTS_PER_WINDOW;
}

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

function unavailable() {
    const reason = syncUnavailableReason();
    return json(
        { ok: false, error: `Sync is unavailable — ${reason ?? 'sync storage could not be opened'}` },
        503,
    );
}

export async function POST(request: NextRequest) {
    if (rateLimited(request)) return json({ ok: false, error: 'Too many requests' }, 429);

    const body = await readBody(request);
    if (!body) return json({ ok: false, error: 'Invalid request body' }, 400);

    const { token, blob, baseVersion } = body as {
        token?: unknown; blob?: unknown; baseVersion?: unknown;
    };
    if (!isValidToken(token)) return json({ ok: false, error: 'Invalid token' }, 400);
    if (typeof blob !== 'string') return json({ ok: false, error: 'Expected { blob: string }' }, 400);
    if (typeof baseVersion !== 'number' || !Number.isInteger(baseVersion) || baseVersion < 0) {
        return json({ ok: false, error: 'Expected { baseVersion: non-negative integer }' }, 400);
    }

    const result = await pushSync(token, blob, baseVersion);
    if (!result) return unavailable();

    if (!result.ok) {
        return json({
            ok: false,
            error: 'Version conflict',
            conflict: result.conflict
                ? { blob: result.conflict.blob, version: result.conflict.version, updatedAt: result.conflict.updatedAt }
                : null,
        }, 409);
    }
    return json({
        ok: true,
        version: result.version,
        updatedAt: result.updatedAt,
        expiresAt: result.expiresAt,
        ttlDays: SYNC_TTL_DAYS,
    });
}

export async function PUT(request: NextRequest) {
    if (rateLimited(request)) return json({ ok: false, error: 'Too many requests' }, 429);

    const body = await readBody(request);
    const token = body?.token;
    if (!isValidToken(token)) return json({ ok: false, error: 'Invalid token' }, 400);

    const record = await getSync(token);
    if (!record) {
        // Distinguish "no such session" from "store down" without leaking more.
        if (syncUnavailableReason()) return unavailable();
        return json({ ok: true, found: false });
    }
    return json({
        ok: true,
        found: true,
        blob: record.blob,
        version: record.version,
        updatedAt: record.updatedAt,
        expiresAt: record.expiresAt,
    });
}

export async function DELETE(request: NextRequest) {
    if (rateLimited(request)) return json({ ok: false, error: 'Too many requests' }, 429);

    const body = await readBody(request);
    const token = body?.token;
    if (!isValidToken(token)) return json({ ok: false, error: 'Invalid token' }, 400);

    // Deleting an absent session reports success: "must not be reachable" holds either way.
    await deleteSync(token);
    return json({ ok: true });
}
