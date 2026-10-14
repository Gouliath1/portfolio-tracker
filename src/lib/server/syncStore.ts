/**
 * Storage for cross-device sync — one opaque blob of portfolio state per
 * sync key.
 *
 * Same trust model as `shareStore`: no accounts, the key is the only
 * credential, only its SHA-256 hash is stored, and rows expire when abandoned.
 * The server never interprets the blob; it only versions it.
 *
 * Writes are optimistic-concurrency: a push names the version it was based on
 * and is rejected (with the current row) if another device got there first.
 * The compare-and-set lives in the SQL, so two racing pushes can't both win.
 */

import { hashToken } from './shareStore';
import { withSchema, appDbUnavailableReason, resetAppDbForTests } from './appDb';

/** Refreshed on every push, so an in-use portfolio never lapses. */
export const SYNC_TTL_DAYS = 90;

export interface SyncRecord {
    blob: string;
    version: number;
    updatedAt: string;
    expiresAt: string;
}

/**
 * Minimum gap between two writes to one session. Every push is a Turso row
 * write, and a client stuck in a change loop (or a script) could otherwise
 * write continuously; a legitimate client pushes at most once per few seconds.
 */
export const MIN_PUSH_INTERVAL_MS = 3_000;

export type PushResult =
    | { ok: true; version: number; updatedAt: string; expiresAt: string }
    | { ok: false; throttled: true; retryAfterMs: number }
    | { ok: false; throttled?: false; conflict: SyncRecord | null };

export const syncUnavailableReason = appDbUnavailableReason;

/**
 * Who a sync row belongs to: an anonymous sync key (the browser-held secret;
 * only its hash is stored) or a signed-in account (addressed by account id, so
 * no key to lose). The two key spaces can't collide: token hashes are 64 hex
 * characters, account keys start with `acct:`.
 */
export type SyncPrincipal = string | { accountId: string };

const keyFor = (p: SyncPrincipal): string =>
    typeof p === 'string' ? hashToken(p) : `acct:${p.accountId}`;

async function ensureInit() {
    return withSchema('sync', async client => {
        await client.execute(`
            CREATE TABLE IF NOT EXISTS sync_sessions (
                token_hash TEXT PRIMARY KEY,
                blob       TEXT NOT NULL,
                version    INTEGER NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                expires_at TEXT NOT NULL
            )
        `);
        await client.execute(
            `CREATE INDEX IF NOT EXISTS idx_sync_expires ON sync_sessions(expires_at)`,
        );
    });
}

function expiryFrom(now: Date): string {
    return new Date(now.getTime() + SYNC_TTL_DAYS * 86_400_000).toISOString();
}

/** Fetch the current blob. An expired row counts as absent and is deleted on the way past. */
export async function getSync(principal: SyncPrincipal, now = new Date()): Promise<SyncRecord | null> {
    const client = await ensureInit();
    if (!client) return null;

    const result = await client.execute({
        sql: `SELECT blob, version, updated_at, expires_at FROM sync_sessions WHERE token_hash = ?`,
        args: [keyFor(principal)],
    });
    const row = result.rows[0];
    if (!row) return null;

    const expiresAt = String(row.expires_at);
    if (new Date(expiresAt).getTime() <= now.getTime()) {
        await deleteSync(principal);
        return null;
    }
    return {
        blob: String(row.blob),
        version: Number(row.version),
        updatedAt: String(row.updated_at),
        expiresAt,
    };
}

/**
 * Push a new blob based on `baseVersion` (0 = "I expect no row yet").
 * Returns `null` when storage is unavailable.
 */
export async function pushSync(
    principal: SyncPrincipal,
    blob: string,
    baseVersion: number,
    now = new Date(),
): Promise<PushResult | null> {
    const client = await ensureInit();
    if (!client) return null;

    const hash = keyFor(principal);
    const iso = now.toISOString();
    const expiresAt = expiryFrom(now);
    const nextVersion = baseVersion + 1;

    // Updates only land if the previous write is old enough; creation has no previous write.
    const notAfter = new Date(now.getTime() - MIN_PUSH_INTERVAL_MS).toISOString();

    const result = baseVersion === 0
        ? await client.execute({
            sql: `INSERT INTO sync_sessions (token_hash, blob, version, created_at, updated_at, expires_at)
                  VALUES (?, ?, ?, ?, ?, ?)
                  ON CONFLICT(token_hash) DO NOTHING`,
            args: [hash, blob, nextVersion, iso, iso, expiresAt],
        })
        : await client.execute({
            sql: `UPDATE sync_sessions
                  SET blob = ?, version = ?, updated_at = ?, expires_at = ?
                  WHERE token_hash = ? AND version = ? AND updated_at <= ?`,
            args: [blob, nextVersion, iso, expiresAt, hash, baseVersion, notAfter],
        });

    if (result.rowsAffected > 0) {
        return { ok: true, version: nextVersion, updatedAt: iso, expiresAt };
    }

    const current = await getSync(principal, now);
    if (baseVersion > 0 && current && current.version === baseVersion) {
        // Right version, rejected anyway: too soon after the last write.
        const retryAfterMs = Math.max(
            1, MIN_PUSH_INTERVAL_MS - (now.getTime() - new Date(current.updatedAt).getTime()),
        );
        return { ok: false, throttled: true, retryAfterMs };
    }
    return { ok: false, conflict: current };
}

/** Revoke a sync session. Holding the key is the only authorisation required. */
export async function deleteSync(principal: SyncPrincipal): Promise<boolean> {
    const client = await ensureInit();
    if (!client) return false;

    const result = await client.execute({
        sql: `DELETE FROM sync_sessions WHERE token_hash = ?`,
        args: [keyFor(principal)],
    });
    return result.rowsAffected > 0;
}

/** Remove everything already past its expiry. */
export async function purgeExpiredSync(now = new Date()): Promise<number> {
    const client = await ensureInit();
    if (!client) return 0;

    const result = await client.execute({
        sql: `DELETE FROM sync_sessions WHERE expires_at <= ?`,
        args: [now.toISOString()],
    });
    return result.rowsAffected;
}

/** Test seam — drops the memoised client so a new DB path takes effect. */
export const resetSyncStoreForTests = resetAppDbForTests;
