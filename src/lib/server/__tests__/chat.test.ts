/** @jest-environment node */
import {
    MAX_BRIEF_CHARS, MAX_HISTORY_MESSAGES, MAX_USER_MESSAGE_CHARS,
    admitIp, buildSystem, chatEnabled, parseChatRequest,
} from '../chat';
import { resetGuardsForTests } from '../requestGuards';

const brief = '# Portfolio brief\n\n| AAPL | 10 |';
const user = (content: string) => ({ role: 'user', content });
const bot = (content: string) => ({ role: 'assistant', content });

describe('chatEnabled', () => {
    it('needs a key and no kill switch', () => {
        const env = (vars: Record<string, string>) => vars as unknown as NodeJS.ProcessEnv;
        expect(chatEnabled(env({ ANTHROPIC_API_KEY: 'k' }))).toBe(true);
        expect(chatEnabled(env({}))).toBe(false);
        expect(chatEnabled(env({ ANTHROPIC_API_KEY: 'k', CHAT_DISABLED: '1' }))).toBe(false);
    });
});

describe('parseChatRequest', () => {
    it('accepts a normal question and defaults to English', () => {
        const r = parseChatRequest({ brief, messages: [user('hi')] });
        expect(r).toEqual({ ok: true, request: { brief, messages: [user('hi')], language: 'en' } });
    });

    it('passes French through and falls back for anything else', () => {
        const lang = (language: unknown) => {
            const r = parseChatRequest({ brief, messages: [user('hi')], language });
            return r.ok ? r.request.language : null;
        };
        expect(lang('fr')).toBe('fr');
        expect(lang('de')).toBe('en');
    });

    it.each([
        ['non-object', null],
        ['missing brief', { messages: [user('hi')] }],
        ['blank brief', { brief: '  ', messages: [user('hi')] }],
        ['no messages', { brief, messages: [] }],
        ['bad role', { brief, messages: [{ role: 'system', content: 'x' }] }],
        ['non-string content', { brief, messages: [{ role: 'user', content: 5 }] }],
        ['empty user message', { brief, messages: [user('   ')] }],
        ['ends on assistant', { brief, messages: [user('a'), bot('b')] }],
    ])('rejects %s with 400', (_name, body) => {
        const r = parseChatRequest(body);
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.status).toBe(400);
    });

    it('rejects an oversized brief or question with 413', () => {
        const big = parseChatRequest({ brief: 'x'.repeat(MAX_BRIEF_CHARS + 1), messages: [user('hi')] });
        const long = parseChatRequest({ brief, messages: [user('x'.repeat(MAX_USER_MESSAGE_CHARS + 1))] });
        expect(big.ok || big.status).toBe(413);
        expect(long.ok || long.status).toBe(413);
    });

    it('keeps only recent turns, starting on a user turn', () => {
        const messages = Array.from({ length: 12 }, (_, i) => (i % 2 === 0 ? user(`q${i}`) : bot(`a${i}`)));
        messages.push(user('last'));
        const r = parseChatRequest({ brief, messages });
        if (!r.ok) throw new Error('expected ok');
        expect(r.request.messages.length).toBeLessThanOrEqual(MAX_HISTORY_MESSAGES);
        expect(r.request.messages[0].role).toBe('user');
        expect(r.request.messages.at(-1)?.content).toBe('last');
    });

    it('drops empty assistant turns instead of replaying them', () => {
        const r = parseChatRequest({ brief, messages: [user('a'), bot(''), user('b')] });
        if (!r.ok) throw new Error('expected ok');
        expect(r.request.messages.map(m => m.content)).toEqual(['a', 'b']);
    });
});

describe('buildSystem', () => {
    it('is one cached block containing the brief and the reply language', () => {
        const [block, ...rest] = buildSystem(brief, 'fr');
        expect(rest).toHaveLength(0);
        expect(block.cache_control).toEqual({ type: 'ephemeral' });
        expect(block.text).toContain(brief);
        expect(block.text).toContain('French');
    });

    it('is deterministic, so identical input hits the cache', () => {
        expect(buildSystem(brief, 'en')).toEqual(buildSystem(brief, 'en'));
    });
});

describe('admitIp', () => {
    beforeEach(() => resetGuardsForTests());

    it('limits one IP without blocking another', () => {
        const t0 = Date.UTC(2026, 0, 1);
        for (let i = 0; i < 20; i++) expect(admitIp('1.1.1.1', t0)).toBe(true);
        expect(admitIp('1.1.1.1', t0)).toBe(false);
        expect(admitIp('2.2.2.2', t0)).toBe(true);
    });
});
