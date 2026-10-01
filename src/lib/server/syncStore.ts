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

import { createClient, Client } from '@libsql/client';
import { dirname } from 'path';
import { mkdirSync } from 'fs';
import { hashToken } from './shareStore';

const DEFAULT_LOCAL_PATH = './data/sync.db';

/** Refreshed on every push, so an in-use portfolio never lapses. */
export const SYNC_TTL_DAYS = 90;

export interface SyncRecord {
    blob: string;
    version: number;
    updatedAt: string;
    expiresAt: string;
}

export type PushResult =
    | { ok: true; version: number; updatedAt: string; expiresAt: string }
    | { ok: false; conflict: SyncRecord | null };

let _client: Client | null = null;
let _initPromise: Promise<void> | null = null;
let _unavailable = false;
let _unavailableReason: string | null = null;

export function syncUnavailableReason(): string | null {
    return _unavailableReason;
}

function markUnavailable(reason: string): null {
    _unavailable = true;
    _unavailableReason = reason;
    console.warn(`[syncStore] ${reason}`);
    return null;
}

function getClient(): Client | null {
    if (_unavailable) return null;
    if (_client) return _client;

    const url = process.env.TURSO_DATABASE_URL;
    const token = process.env.TURSO_AUTH_TOKEN;

    try {
        if (url && token) {
            _client = createClient({ url, authToken: token });
        } else if (process.env.VERCEL) {
            return markUnavailable(
                'TURSO_DATABASE_URL / TURSO_AUTH_TOKEN are not set in this environment, ' +
                'and a serverless filesystem cannot hold a local database.',
            );
        } else {
            const path = process.env.SYNC_DB_PATH ?? DEFAULT_LOCAL_PATH;
            try { mkdirSync(dirname(path), { recursive: true }); } catch { /* exists */ }
            _client = createClient({ url: `file:${path}` });
        }
        return _client;
    } catch (error) {
        return markUnavailable(
            `Could not open the database: ${error instanceof Error ? error.message : String(error)}`,
        );
    }
}

async function ensureInit(): Promise<Client | null> {
    const client = getClient();
    if (!client) return null;

    if (!_initPromise) {
        _initPromise = (async () => {
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
        })();
    }

    try {
        await _initPromise;
    } catch (error) {
        _initPromise = null;
        return markUnavailable(
            `Database rejected the schema setup: ${error instanceof Error ? error.message : String(error)}`,
        );
    }
    return client;
}

function expiryFrom(now: Date): string {
    return new Date(now.getTime() + SYNC_TTL_DAYS * 86_400_000).toISOString();
}

/** Fetch the current blob. An expired row counts as absent and is deleted on the way past. */
export async function getSync(token: string, now = new Date()): Promise<SyncRecord | null> {
    const client = await ensureInit();
    if (!client) return null;

    const result = await client.execute({
        sql: `SELECT blob, version, updated_at, expires_at FROM sync_sessions WHERE token_hash = ?`,
        args: [hashToken(token)],
    });
    const row = result.rows[0];
    if (!row) return null;

    const expiresAt = String(row.expires_at);
    if (new Date(expiresAt).getTime() <= now.getTime()) {
        await deleteSync(token);
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
    token: string,
    blob: string,
    baseVersion: number,
    now = new Date(),
): Promise<PushResult | null> {
    const client = await ensureInit();
    if (!client) return null;

    const hash = hashToken(token);
    const iso = now.toISOString();
    const expiresAt = expiryFrom(now);
    const nextVersion = baseVersion + 1;

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
                  WHERE token_hash = ? AND version = ?`,
            args: [blob, nextVersion, iso, expiresAt, hash, baseVersion],
        });

    if (result.rowsAffected > 0) {
        return { ok: true, version: nextVersion, updatedAt: iso, expiresAt };
    }
    return { ok: false, conflict: await getSync(token, now) };
}

/** Revoke a sync session. Holding the key is the only authorisation required. */
export async function deleteSync(token: string): Promise<boolean> {
    const client = await ensureInit();
    if (!client) return false;

    const result = await client.execute({
        sql: `DELETE FROM sync_sessions WHERE token_hash = ?`,
        args: [hashToken(token)],
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
export function resetSyncStoreForTests(): void {
    _client = null;
    _initPromise = null;
    _unavailable = false;
    _unavailableReason = null;
}
