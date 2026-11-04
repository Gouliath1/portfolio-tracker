/**
 * Per-account daily chat allowance.
 *
 * One row per (account, UTC day). It lives in the app database rather than in
 * memory so the limit holds across serverless instances, which don't share
 * memory. Claiming a question is a single upsert, so two requests
 * arriving together can't both slip under the cap.
 */

import { withSchema } from './appDb';

export const DEFAULT_USER_DAILY_LIMIT = 30;

export const userDailyLimit = (env: NodeJS.ProcessEnv = process.env): number => {
    const n = Number(env.CHAT_USER_DAILY);
    return Number.isInteger(n) && n > 0 ? n : DEFAULT_USER_DAILY_LIMIT;
};

const dayOf = (now: Date) => now.toISOString().slice(0, 10);

async function db() {
    return withSchema('chat_usage', async c => {
        await c.execute(`
            CREATE TABLE IF NOT EXISTS chat_usage (
                user_id TEXT NOT NULL,
                day     TEXT NOT NULL,
                count   INTEGER NOT NULL,
                PRIMARY KEY (user_id, day)
            )
        `);
    });
}

export type Claim =
    | { ok: true; remaining: number }
    | { ok: false; reason: 'limit' | 'unavailable' };

/** Spend one question from today's allowance, or say why not. */
export async function claimQuestion(
    userId: string,
    now = new Date(),
    limit = userDailyLimit(),
): Promise<Claim> {
    const c = await db();
    if (!c) return { ok: false, reason: 'unavailable' };
    const day = dayOf(now);

    // One statement: create today's row, or bump it only while under the cap.
    // When the cap is reached the update is skipped and nothing is returned.
    const claimed = await c.execute({
        sql: `INSERT INTO chat_usage (user_id, day, count) VALUES (?, ?, 1)
              ON CONFLICT(user_id, day) DO UPDATE SET count = count + 1 WHERE count < ?
              RETURNING count`,
        args: [userId, day, limit],
    });
    if (claimed.rows.length === 0) return { ok: false, reason: 'limit' };
    return { ok: true, remaining: limit - Number(claimed.rows[0].count) };
}

/** Give back a question whose answer never started, so a failure costs the user nothing. */
export async function refundQuestion(userId: string, now = new Date()): Promise<void> {
    const c = await db();
    if (!c) return;
    await c.execute({
        sql: `UPDATE chat_usage SET count = count - 1 WHERE user_id = ? AND day = ? AND count > 0`,
        args: [userId, dayOf(now)],
    });
}

/** Questions left today, without spending one. */
export async function remainingToday(
    userId: string,
    now = new Date(),
    limit = userDailyLimit(),
): Promise<number | null> {
    const c = await db();
    if (!c) return null;
    const r = await c.execute({
        sql: `SELECT count FROM chat_usage WHERE user_id = ? AND day = ?`,
        args: [userId, dayOf(now)],
    });
    return Math.max(0, limit - Number(r.rows[0]?.count ?? 0));
}
