/**
 * Storage for shared portfolio snapshots — the server side of "Connect my AI".
 *
 * This is the one place the app holds a user's actual positions. Everywhere
 * else they stay in the browser. That makes the design constraints unusual, so
 * they're worth stating:
 *
 *  - **The token is the only credential.** There are no accounts. A share is
 *    reachable by whoever holds its URL, and by nobody else. Tokens are 256
 *    bits of CSPRNG output generated in the browser.
 *  - **Only a hash of the token is stored.** A leaked database gives an
 *    attacker no working URLs, the same reason password hashes exist. Lookups
 *    are by hash, so this costs nothing.
 *  - **Shares expire.** Thirty days from the last update, refreshed on every
 *    publish. A portfolio someone actually uses never expires; one they
 *    abandon disappears without anyone having to remember to clean it up.
 *  - **Anyone can revoke.** Holding the token is sufficient to delete the row.
 *
 * Storage mirrors `marketDataDb`: a local SQLite file in dev, Turso on Vercel
 * where the filesystem is read-only.
 */

import { createClient, Client } from '@libsql/client';
import { createHash, timingSafeEqual } from 'crypto';
import { dirname } from 'path';
import { mkdirSync } from 'fs';

const DEFAULT_LOCAL_PATH = './data/shares.db';

/** Refreshed on every publish, so active portfolios never lapse. */
export const SHARE_TTL_DAYS = 30;

/**
 * Tokens are 32 random bytes, base64url-encoded — 43 characters. Accept a
 * little slack for future formats, but reject anything short enough to be
 * worth guessing, and anything long enough to be an attack on the hash.
 */
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{32,128}$/;

let _client: Client | null = null;
let _initPromise: Promise<void> | null = null;
let _unavailable = false;

/**
 * Why storage is unavailable, when it is.
 *
 * "Sharing is unavailable" on its own sends you looking for missing
 * credentials even when the credentials are fine and the database refused the
 * connection. Keeping the cause lets the caller say which it was.
 */
let _unavailableReason: string | null = null;

export function storageUnavailableReason(): string | null {
    return _unavailableReason;
}

function markUnavailable(reason: string): null {
    _unavailable = true;
    _unavailableReason = reason;
    console.warn(`[shareStore] ${reason}`);
    return null;
}

export interface ShareRecord {
    snapshot: unknown;
    markdown: string;
    createdAt: string;
    updatedAt: string;
    expiresAt: string;
}

export function isValidToken(token: unknown): token is string {
    return typeof token === 'string' && TOKEN_PATTERN.test(token);
}

/**
 * SHA-256 is the right primitive here, not a password hash: the input is 256
 * bits of uniform randomness, so there is no dictionary to attack and nothing
 * for a slow KDF to buy. Deliberate, not an oversight.
 */
export function hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
}

/**
 * Compare two hashes without leaking where they diverge. Lookups go through
 * the primary key so this is belt-and-braces, but share verification is the
 * one comparison in the app worth making constant-time.
 */
export function hashesMatch(a: string, b: string): boolean {
    const bufA = Buffer.from(a, 'hex');
    const bufB = Buffer.from(b, 'hex');
    return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
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
            const path = process.env.SHARE_DB_PATH ?? DEFAULT_LOCAL_PATH;
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
                CREATE TABLE IF NOT EXISTS portfolio_shares (
                    token_hash TEXT PRIMARY KEY,
                    snapshot   TEXT NOT NULL,
                    markdown   TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    expires_at TEXT NOT NULL
                )
            `);
            // Expiry sweeps scan by date, and the table is otherwise only ever
            // hit by primary key.
            await client.execute(
                `CREATE INDEX IF NOT EXISTS idx_shares_expires ON portfolio_shares(expires_at)`,
            );
        })();
    }

    try {
        await _initPromise;
    } catch (error) {
        // A fresh promise next time, so a transient outage can recover rather
        // than pinning the process to a permanent failure.
        _initPromise = null;
        return markUnavailable(
            `Database rejected the schema setup: ${error instanceof Error ? error.message : String(error)}`,
        );
    }
    return client;
}

function expiryFrom(now: Date): string {
    return new Date(now.getTime() + SHARE_TTL_DAYS * 86_400_000).toISOString();
}

/**
 * Create or update a share. Returns the new expiry, or null when storage is
 * unavailable — callers surface that rather than pretending the save worked.
 */
export async function putShare(
    token: string,
    snapshot: unknown,
    markdown: string,
    now = new Date(),
): Promise<{ expiresAt: string } | null> {
    const client = await ensureInit();
    if (!client) return null;

    const hash = hashToken(token);
    const iso = now.toISOString();
    const expiresAt = expiryFrom(now);

    await client.execute({
        sql: `
            INSERT INTO portfolio_shares
                (token_hash, snapshot, markdown, created_at, updated_at, expires_at)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(token_hash) DO UPDATE SET
                snapshot   = excluded.snapshot,
                markdown   = excluded.markdown,
                updated_at = excluded.updated_at,
                expires_at = excluded.expires_at
        `,
        args: [hash, JSON.stringify(snapshot), markdown, iso, iso, expiresAt],
    });

    return { expiresAt };
}

/**
 * Fetch a share by token. An expired row is treated as absent and deleted on
 * the way past — cheap opportunistic cleanup that avoids needing a cron job
 * for a table this small.
 */
export async function getShare(token: string, now = new Date()): Promise<ShareRecord | null> {
    const client = await ensureInit();
    if (!client) return null;

    const hash = hashToken(token);
    const result = await client.execute({
        sql: `SELECT token_hash, snapshot, markdown, created_at, updated_at, expires_at
              FROM portfolio_shares WHERE token_hash = ?`,
        args: [hash],
    });

    const row = result.rows[0];
    if (!row) return null;
    if (!hashesMatch(String(row.token_hash), hash)) return null;

    const expiresAt = String(row.expires_at);
    if (new Date(expiresAt).getTime() <= now.getTime()) {
        await deleteShare(token);
        return null;
    }

    let snapshot: unknown;
    try {
        snapshot = JSON.parse(String(row.snapshot));
    } catch {
        return null;
    }

    return {
        snapshot,
        markdown: String(row.markdown),
        createdAt: String(row.created_at),
        updatedAt: String(row.updated_at),
        expiresAt,
    };
}

/** Revoke a share. Holding the token is the only authorisation required. */
export async function deleteShare(token: string): Promise<boolean> {
    const client = await ensureInit();
    if (!client) return false;

    const result = await client.execute({
        sql: `DELETE FROM portfolio_shares WHERE token_hash = ?`,
        args: [hashToken(token)],
    });
    return result.rowsAffected > 0;
}

/** Remove everything already past its expiry. Safe to call at any time. */
export async function purgeExpired(now = new Date()): Promise<number> {
    const client = await ensureInit();
    if (!client) return 0;

    const result = await client.execute({
        sql: `DELETE FROM portfolio_shares WHERE expires_at <= ?`,
        args: [now.toISOString()],
    });
    return result.rowsAffected;
}

/** Test seam — drops the memoised client so a new DB path takes effect. */
export function resetShareStoreForTests(): void {
    _client = null;
    _initPromise = null;
    _unavailable = false;
    _unavailableReason = null;
}
