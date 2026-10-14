/**
 * Accounts: passwordless email sign-in and revocable sessions.
 *
 * There are no passwords to store, hash, reset or leak. Signing in is a
 * single-use link emailed to the address; the link carries a 256-bit token, of
 * which only the SHA-256 hash is stored, and which expires in 15 minutes. A
 * session is likewise a 256-bit random id, hashed at rest, so a database leak
 * yields nothing that can be replayed and any session can be revoked by
 * deleting its row.
 *
 * The email is stored in plain text — it's the account's identity and what the
 * user sees as "signed in as" — and removed with the account.
 */

import { randomBytes, randomUUID } from 'crypto';
import { withSchema } from './appDb';
import { hashToken, isValidToken } from './shareStore';
import { deleteSync } from './syncStore';

export const LOGIN_TOKEN_TTL_MS = 15 * 60_000;
export const SESSION_TTL_MS = 30 * 86_400_000;
/** Sliding expiry is refreshed at most this often, so reading a session isn't a write. */
const SESSION_TOUCH_MS = 24 * 3_600_000;

/** Per address per hour, and across the whole app per day: bounds email abuse and provider quota. */
export const MAX_LOGIN_EMAILS_PER_ADDRESS_PER_HOUR = 3;
export const DEFAULT_DAILY_EMAIL_CAP = 90;

export interface AuthUser { id: string; email: string }

const newSecret = () => randomBytes(32).toString('base64url');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Lowercased, trimmed address, or null when it isn't plausibly an email. */
export function normalizeEmail(input: unknown): string | null {
    if (typeof input !== 'string') return null;
    const email = input.trim().toLowerCase();
    if (email.length > 254 || !EMAIL_RE.test(email)) return null;
    return email;
}

async function db() {
    return withSchema('auth', async c => {
        await c.execute(`
            CREATE TABLE IF NOT EXISTS auth_users (
                id            TEXT PRIMARY KEY,
                email         TEXT NOT NULL UNIQUE,
                created_at    TEXT NOT NULL,
                last_login_at TEXT NOT NULL
            )
        `);
        await c.execute(`
            CREATE TABLE IF NOT EXISTS auth_login_tokens (
                token_hash TEXT PRIMARY KEY,
                email      TEXT NOT NULL,
                created_at TEXT NOT NULL,
                expires_at TEXT NOT NULL,
                used_at    TEXT
            )
        `);
        await c.execute(`CREATE INDEX IF NOT EXISTS idx_login_email ON auth_login_tokens(email, created_at)`);
        await c.execute(`CREATE INDEX IF NOT EXISTS idx_login_created ON auth_login_tokens(created_at)`);
        await c.execute(`
            CREATE TABLE IF NOT EXISTS auth_sessions (
                session_hash TEXT PRIMARY KEY,
                user_id      TEXT NOT NULL,
                created_at   TEXT NOT NULL,
                expires_at   TEXT NOT NULL,
                last_seen_at TEXT NOT NULL
            )
        `);
        await c.execute(`CREATE INDEX IF NOT EXISTS idx_sessions_user ON auth_sessions(user_id)`);
    });
}

export type LoginRequestCheck = { ok: true } | { ok: false; reason: 'address' | 'global' | 'unavailable' };

/** DB-backed limits (they hold across serverless instances, unlike in-memory counters). */
export async function checkLoginRequestAllowed(
    email: string,
    now = new Date(),
    dailyCap = Number(process.env.AUTH_DAILY_EMAIL_CAP) || DEFAULT_DAILY_EMAIL_CAP,
): Promise<LoginRequestCheck> {
    const c = await db();
    if (!c) return { ok: false, reason: 'unavailable' };

    const hourAgo = new Date(now.getTime() - 3_600_000).toISOString();
    const dayAgo = new Date(now.getTime() - 86_400_000).toISOString();

    const perAddress = await c.execute({
        sql: `SELECT COUNT(*) AS n FROM auth_login_tokens WHERE email = ? AND created_at > ?`,
        args: [email, hourAgo],
    });
    if (Number(perAddress.rows[0]?.n ?? 0) >= MAX_LOGIN_EMAILS_PER_ADDRESS_PER_HOUR) {
        return { ok: false, reason: 'address' };
    }
    const global = await c.execute({
        sql: `SELECT COUNT(*) AS n FROM auth_login_tokens WHERE created_at > ?`,
        args: [dayAgo],
    });
    if (Number(global.rows[0]?.n ?? 0) >= dailyCap) return { ok: false, reason: 'global' };
    return { ok: true };
}

/** Create a single-use sign-in token for `email`; returns the raw token (only its hash is stored). */
export async function createLoginToken(email: string, now = new Date()): Promise<string | null> {
    const c = await db();
    if (!c) return null;
    const token = newSecret();
    await c.execute({
        sql: `INSERT INTO auth_login_tokens (token_hash, email, created_at, expires_at) VALUES (?, ?, ?, ?)`,
        args: [hashToken(token), email, now.toISOString(), new Date(now.getTime() + LOGIN_TOKEN_TTL_MS).toISOString()],
    });
    return token;
}

/**
 * Redeem a sign-in token. The single-use and expiry checks are one atomic
 * UPDATE, so two simultaneous redemptions can't both succeed. Creates the
 * account on first sign-in.
 */
export async function consumeLoginToken(token: unknown, now = new Date()): Promise<AuthUser | null> {
    if (!isValidToken(token)) return null;
    const c = await db();
    if (!c) return null;

    const iso = now.toISOString();
    const claimed = await c.execute({
        sql: `UPDATE auth_login_tokens SET used_at = ?
              WHERE token_hash = ? AND used_at IS NULL AND expires_at > ?
              RETURNING email`,
        args: [iso, hashToken(token), iso],
    });
    const email = claimed.rows[0]?.email as string | undefined;
    if (!email) return null;

    await c.execute({
        sql: `INSERT INTO auth_users (id, email, created_at, last_login_at) VALUES (?, ?, ?, ?)
              ON CONFLICT(email) DO UPDATE SET last_login_at = excluded.last_login_at`,
        args: [randomUUID(), email, iso, iso],
    });
    const user = await c.execute({ sql: `SELECT id, email FROM auth_users WHERE email = ?`, args: [email] });
    const row = user.rows[0];
    return row ? { id: String(row.id), email: String(row.email) } : null;
}

export async function createSession(userId: string, now = new Date()): Promise<string | null> {
    const c = await db();
    if (!c) return null;
    const id = newSecret();
    const iso = now.toISOString();
    await c.execute({
        sql: `INSERT INTO auth_sessions (session_hash, user_id, created_at, expires_at, last_seen_at) VALUES (?, ?, ?, ?, ?)`,
        args: [hashToken(id), userId, iso, new Date(now.getTime() + SESSION_TTL_MS).toISOString(), iso],
    });
    return id;
}

/** The signed-in user for a raw session id, or null. Slides the expiry forward at most daily. */
export async function getSessionUser(sessionId: unknown, now = new Date()): Promise<AuthUser | null> {
    if (!isValidToken(sessionId)) return null;
    const c = await db();
    if (!c) return null;

    const hash = hashToken(sessionId);
    const res = await c.execute({
        sql: `SELECT s.last_seen_at, s.expires_at, u.id, u.email
              FROM auth_sessions s JOIN auth_users u ON u.id = s.user_id
              WHERE s.session_hash = ?`,
        args: [hash],
    });
    const row = res.rows[0];
    if (!row) return null;
    if (new Date(String(row.expires_at)).getTime() <= now.getTime()) {
        await c.execute({ sql: `DELETE FROM auth_sessions WHERE session_hash = ?`, args: [hash] });
        return null;
    }
    if (now.getTime() - new Date(String(row.last_seen_at)).getTime() > SESSION_TOUCH_MS) {
        await c.execute({
            sql: `UPDATE auth_sessions SET last_seen_at = ?, expires_at = ? WHERE session_hash = ?`,
            args: [now.toISOString(), new Date(now.getTime() + SESSION_TTL_MS).toISOString(), hash],
        });
    }
    return { id: String(row.id), email: String(row.email) };
}

export async function deleteSession(sessionId: unknown): Promise<void> {
    if (!isValidToken(sessionId)) return;
    const c = await db();
    if (!c) return;
    await c.execute({ sql: `DELETE FROM auth_sessions WHERE session_hash = ?`, args: [hashToken(sessionId)] });
}

/** Remove the account, every session it has, and its synced portfolio. */
export async function deleteAccount(userId: string): Promise<boolean> {
    const c = await db();
    if (!c) return false;
    await deleteSync({ accountId: userId });
    await c.execute({ sql: `DELETE FROM auth_sessions WHERE user_id = ?`, args: [userId] });
    const res = await c.execute({ sql: `DELETE FROM auth_users WHERE id = ?`, args: [userId] });
    return res.rowsAffected > 0;
}

/** Housekeeping: drop spent/expired tokens and sessions. Safe to call any time. */
export async function purgeExpiredAuth(now = new Date()): Promise<number> {
    const c = await db();
    if (!c) return 0;
    const iso = now.toISOString();
    const dayAgo = new Date(now.getTime() - 86_400_000).toISOString();
    const t = await c.execute({ sql: `DELETE FROM auth_login_tokens WHERE expires_at <= ? AND created_at <= ?`, args: [iso, dayAgo] });
    const s = await c.execute({ sql: `DELETE FROM auth_sessions WHERE expires_at <= ?`, args: [iso] });
    return t.rowsAffected + s.rowsAffected;
}
