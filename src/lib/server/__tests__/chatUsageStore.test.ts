/** @jest-environment node */
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { resetAppDbForTests } from '../appDb';
import { claimQuestion, refundQuestion, remainingToday, userDailyLimit } from '../chatUsageStore';

let dir: string;
beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'chat-usage-'));
    process.env.APP_DB_PATH = join(dir, 'app.db');
    delete process.env.TURSO_DATABASE_URL;
    delete process.env.TURSO_AUTH_TOKEN;
    resetAppDbForTests();
});
afterEach(() => {
    delete process.env.APP_DB_PATH;
    resetAppDbForTests();
    rmSync(dir, { recursive: true, force: true });
});

const T0 = new Date('2026-10-13T12:00:00Z');
const nextDay = new Date(T0.getTime() + 86_400_000);
const env = (vars: Record<string, string>) => vars as unknown as NodeJS.ProcessEnv;

describe('userDailyLimit', () => {
    it('defaults to 30 and accepts a positive integer override', () => {
        expect(userDailyLimit(env({}))).toBe(30);
        expect(userDailyLimit(env({ CHAT_USER_DAILY: '5' }))).toBe(5);
        expect(userDailyLimit(env({ CHAT_USER_DAILY: 'abc' }))).toBe(30);
        expect(userDailyLimit(env({ CHAT_USER_DAILY: '0' }))).toBe(30);
    });
});

describe('claimQuestion', () => {
    it('counts down to zero, then refuses', async () => {
        expect(await claimQuestion('u1', T0, 2)).toEqual({ ok: true, remaining: 1 });
        expect(await claimQuestion('u1', T0, 2)).toEqual({ ok: true, remaining: 0 });
        expect(await claimQuestion('u1', T0, 2)).toEqual({ ok: false, reason: 'limit' });
    });

    it('keeps accounts separate and resets the next UTC day', async () => {
        await claimQuestion('u1', T0, 1);
        expect((await claimQuestion('u2', T0, 1)).ok).toBe(true);
        expect((await claimQuestion('u1', T0, 1)).ok).toBe(false);
        expect((await claimQuestion('u1', nextDay, 1)).ok).toBe(true);
    });

    it('never lets simultaneous requests exceed the cap', async () => {
        const results = await Promise.all(Array.from({ length: 10 }, () => claimQuestion('u1', T0, 3)));
        expect(results.filter(r => r.ok)).toHaveLength(3);
    });
});

describe('refundQuestion and remainingToday', () => {
    it('gives a question back and reports what is left', async () => {
        expect(await remainingToday('u1', T0, 3)).toBe(3);
        await claimQuestion('u1', T0, 3);
        expect(await remainingToday('u1', T0, 3)).toBe(2);
        await refundQuestion('u1', T0);
        expect(await remainingToday('u1', T0, 3)).toBe(3);
    });

    it('never refunds below zero', async () => {
        await refundQuestion('u1', T0);
        expect(await remainingToday('u1', T0, 3)).toBe(3);
    });
});
