/** @jest-environment node */
import { NextRequest } from 'next/server';

type Block = { type: 'text'; text: string } | { type: 'tool_use'; id: string; name: string; input: unknown };
interface Turn { blocks: Block[]; stop: 'end_turn' | 'tool_use' }

// Scripted model: each stream() call plays the next turn.
let script: Turn[] = [];
const streamCalls: { tools: { name: string }[]; messages: unknown[] }[] = [];

jest.mock('@anthropic-ai/sdk', () => ({
    __esModule: true,
    default: class {
        messages = {
            stream: (params: { tools: { name: string }[]; messages: unknown[] }) => {
                streamCalls.push({ tools: params.tools, messages: JSON.parse(JSON.stringify(params.messages)) });
                const turn = script.shift()!;
                return {
                    async *[Symbol.asyncIterator]() {
                        for (const b of turn.blocks) {
                            if (b.type === 'text') yield { type: 'content_block_delta', delta: { type: 'text_delta', text: b.text } };
                        }
                    },
                    finalMessage: async () => ({ content: turn.blocks, stop_reason: turn.stop, usage: {} }),
                    abort: () => undefined,
                };
            },
        };
    },
}));
jest.mock('../../src/lib/server/authSession', () => ({ getRequestUser: async () => ({ id: 'u1' }) }));
const refund = jest.fn(async () => undefined);
jest.mock('../../src/lib/server/chatUsageStore', () => ({
    claimQuestion: async () => ({ ok: true }),
    refundQuestion: () => refund(),
    remainingToday: async () => 10,
}));

import { POST } from '../../src/app/api/chat/route';
import { resetGuardsForTests } from '../../src/lib/server/requestGuards';

const ask = async (extra: object = {}) => {
    const res = await POST(new NextRequest('http://localhost/api/chat', {
        method: 'POST',
        body: JSON.stringify({ brief: '# brief', messages: [{ role: 'user', content: 'refresh the screener' }], ...extra }),
    }));
    return { status: res.status, text: await res.text() };
};

const actions = [{ id: 'refresh_pinned', description: 'Refresh pinned stocks' }];

beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = 'test';
    delete process.env.CHAT_DISABLED;
    script = [];
    streamCalls.length = 0;
    refund.mockClear();
    resetGuardsForTests();
});

describe('POST /api/chat — proposing page actions', () => {
    it('streams a confirm block when the model proposes an offered action, and tells it nothing ran', async () => {
        script = [
            { stop: 'tool_use', blocks: [{ type: 'tool_use', id: 't1', name: 'propose_action', input: { id: 'refresh_pinned', reason: 'Prices look old' } }] },
            { stop: 'end_turn', blocks: [{ type: 'text', text: 'I put a button below; it runs when you confirm.' }] },
        ];
        const { status, text } = await ask({ actions });
        expect(status).toBe(200);
        expect(text).toContain('```action\n{"id":"refresh_pinned","reason":"Prices look old"}\n```');
        expect(text.indexOf('```action')).toBeLessThan(text.indexOf('I put a button'));

        const toolResult = (streamCalls[1].messages.at(-1) as { content: { content: string }[] }).content[0].content;
        expect(toolResult).toMatch(/only if they click/);
    });

    it('offers propose_action to the model only when the page sent actions', async () => {
        script = [{ stop: 'end_turn', blocks: [{ type: 'text', text: 'ok' }] }];
        await ask();
        expect(streamCalls[0].tools.map(t => t.name)).not.toContain('propose_action');

        script = [{ stop: 'end_turn', blocks: [{ type: 'text', text: 'ok' }] }];
        await ask({ actions });
        expect(streamCalls[1].tools.map(t => t.name)).toContain('propose_action');
    });

    it('streams nothing for an action the page did not offer', async () => {
        script = [
            { stop: 'tool_use', blocks: [{ type: 'tool_use', id: 't1', name: 'propose_action', input: { id: 'drop_database' } }] },
            { stop: 'end_turn', blocks: [{ type: 'text', text: 'Sorry, I cannot do that.' }] },
        ];
        const { text } = await ask({ actions });
        expect(text).not.toContain('```action');
        expect(text).toContain('Sorry, I cannot do that.');
    });

    it('shows one card per action however many times the model asks', async () => {
        const propose = (id: string) => ({ type: 'tool_use' as const, id, name: 'propose_action', input: { id: 'refresh_pinned' } });
        script = [
            { stop: 'tool_use', blocks: [propose('t1'), propose('t2')] },
            { stop: 'end_turn', blocks: [{ type: 'text', text: 'done asking' }] },
        ];
        const { text } = await ask({ actions });
        expect(text.match(/```action/g)).toHaveLength(1);
    });
});
