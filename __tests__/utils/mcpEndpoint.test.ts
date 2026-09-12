/**
 * @jest-environment node
 *
 * Protocol conformance for the hosted MCP endpoint.
 *
 * A client that can't complete the handshake shows the user "connection
 * failed" with nothing to go on, so the lifecycle methods matter as much as
 * the tool output. The notification cases are the easiest thing to get wrong:
 * JSON-RPC forbids replying to a message with no id, and a server that does
 * anyway can wedge a client.
 */

import {
    handleMcpMessage, type ShareContext, type JsonRpcRequest,
} from '../../src/lib/server/mcpEndpoint';
import type { PortfolioSnapshot } from '../../src/utils/portfolioSnapshot';

interface ToolDescriptor {
    name: string;
    description: string;
    inputSchema: { type: string };
}

const SNAPSHOT: PortfolioSnapshot = {
    generatedAt: '2026-09-12',
    baseCurrency: 'JPY',
    portfolioName: 'Test Portfolio',
    holdingCount: 2,
    totals: {
        value: 1_000_000, cost: 800_000,
        unrealizedPnl: 200_000, unrealizedPnlPct: 25,
        realizedPnl: 50_000, realizedPnlPct: 10,
        dividends: 12_000, totalReturnPct: 28.4,
    },
    holdings: [
        {
            ticker: 'AAPL', name: 'Apple Inc.', account: 'US', assetClass: 'Equity',
            stockCcy: 'USD', quantity: 50, avgCost: 75.5, price: 326.57,
            value: 700_000, cost: 500_000, weightPct: 70, pnlPct: 40,
            totalReturnPct: 42, dividends: 8_000, heldSince: '2020/01/15',
        },
        {
            ticker: '7203.T', name: 'Toyota', account: 'JP', assetClass: 'Equity',
            stockCcy: 'JPY', quantity: 100, avgCost: 6800, price: null,
            value: 300_000, cost: 300_000, weightPct: 30, pnlPct: 0,
            totalReturnPct: 1.33, dividends: 4_000, heldSince: '2019/06/01',
        },
    ],
    byAssetClass: [{ label: 'Equity', value: 1_000_000, pct: 100 }],
    byCurrency: [
        { label: 'USD', value: 700_000, pct: 70 },
        { label: 'JPY', value: 300_000, pct: 30 },
    ],
    byAccount: [
        { label: 'US', value: 700_000, pct: 70 },
        { label: 'JP', value: 300_000, pct: 30 },
    ],
    top5Pct: 100,
    closedCount: 1,
    recentClosed: [{
        ticker: 'NVDA', name: 'NVIDIA', account: 'US',
        soldOn: '2024/02/15', realizedPnl: 50_000, realizedPnlPct: 10,
    }],
};

const NOW = new Date('2026-09-12T12:00:00Z');

const ctx: ShareContext = {
    snapshot: SNAPSHOT,
    markdown: '# Portfolio brief — Test Portfolio\n\nEverything here.',
    updatedAt: '2026-09-12T08:00:00Z',
};

const call = (name: string, args: Record<string, unknown> = {}) =>
    handleMcpMessage({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }, ctx, NOW);

const textOf = (response: ReturnType<typeof handleMcpMessage>): string =>
    (response!.result as { content: { text: string }[] }).content[0].text;

/** Narrow a result to a record so assertions can index it without `any`. */
const resultOf = (response: ReturnType<typeof handleMcpMessage>): Record<string, unknown> =>
    response!.result as Record<string, unknown>;

describe('lifecycle', () => {
    it('completes the handshake with a protocol version and tool capability', () => {
        const response = handleMcpMessage(
            { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }, ctx, NOW);

        const result = resultOf(response);
        expect(result.protocolVersion).toBe('2024-11-05');
        expect((result.capabilities as { tools?: unknown }).tools).toBeDefined();
        expect((result.serverInfo as { name: string }).name).toBe('portfolio-tracker');
    });

    it('says nothing in reply to a notification', () => {
        expect(handleMcpMessage(
            { jsonrpc: '2.0', method: 'notifications/initialized' }, ctx, NOW)).toBeNull();
        expect(handleMcpMessage(
            { jsonrpc: '2.0', method: 'notifications/cancelled' }, ctx, NOW)).toBeNull();
    });

    it('stays silent even for an unknown notification', () => {
        // A reply to a message with no id has nothing to correlate against.
        expect(handleMcpMessage(
            { jsonrpc: '2.0', method: 'notifications/somethingNew' }, ctx, NOW)).toBeNull();
    });

    it('answers ping', () => {
        expect(handleMcpMessage({ jsonrpc: '2.0', id: 7, method: 'ping' }, ctx, NOW))
            .toEqual({ jsonrpc: '2.0', id: 7, result: {} });
    });

    it('returns empty lists for capabilities it does not implement', () => {
        expect(resultOf(handleMcpMessage(
            { jsonrpc: '2.0', id: 1, method: 'resources/list' }, ctx, NOW)).resources).toEqual([]);
        expect(resultOf(handleMcpMessage(
            { jsonrpc: '2.0', id: 1, method: 'prompts/list' }, ctx, NOW)).prompts).toEqual([]);
    });

    it('rejects an unknown method with -32601', () => {
        const response = handleMcpMessage({ jsonrpc: '2.0', id: 1, method: 'nope/atAll' }, ctx, NOW);
        expect(response!.error?.code).toBe(-32601);
    });

    it('rejects a malformed envelope with -32600', () => {
        const response = handleMcpMessage(
            { jsonrpc: '1.0', id: 1, method: 'initialize' } as unknown as JsonRpcRequest, ctx, NOW);
        expect(response!.error?.code).toBe(-32600);
    });

    it('preserves the request id, including id 0', () => {
        // A falsy-but-valid id is the classic place this breaks.
        expect(handleMcpMessage({ jsonrpc: '2.0', id: 0, method: 'ping' }, ctx, NOW)!.id).toBe(0);
        expect(handleMcpMessage({ jsonrpc: '2.0', id: 'abc', method: 'ping' }, ctx, NOW)!.id).toBe('abc');
    });
});

describe('tools/list', () => {
    it('advertises the four portfolio tools with valid schemas', () => {
        const response = handleMcpMessage({ jsonrpc: '2.0', id: 1, method: 'tools/list' }, ctx, NOW);
        const tools = resultOf(response).tools as ToolDescriptor[];

        expect(tools.map(t => t.name)).toEqual([
            'get_portfolio_brief',
            'get_portfolio_positions',
            'get_portfolio_pnl',
            'get_position_details',
        ]);
        for (const tool of tools) {
            expect(tool.description.length).toBeGreaterThan(20);
            expect(tool.inputSchema.type).toBe('object');
        }
    });
});

describe('tools/call', () => {
    it('returns the brief verbatim', () => {
        expect(textOf(call('get_portfolio_brief'))).toContain('Everything here.');
    });

    it('lists holdings largest first by default', () => {
        const text = textOf(call('get_portfolio_positions'));
        expect(text.indexOf('AAPL')).toBeLessThan(text.indexOf('7203.T'));
    });

    it('honours sortBy', () => {
        const text = textOf(call('get_portfolio_positions', { sortBy: 'ticker' }));
        expect(text.indexOf('7203.T')).toBeLessThan(text.indexOf('AAPL'));
    });

    it('says when a price is unavailable rather than showing a zero', () => {
        expect(textOf(call('get_portfolio_positions'))).toContain('price unavailable');
    });

    it('reports each P&L component separately', () => {
        const text = textOf(call('get_portfolio_pnl'));
        expect(text).toContain('Unrealized P&L:');
        expect(text).toContain('Realized (sales):');
        expect(text).toContain('Dividends:');
        expect(text).toContain('top 5 holdings are 100%');
    });

    it('matches tickers case-insensitively', () => {
        expect(textOf(call('get_position_details', { tickers: ['aapl'] }))).toContain('Apple Inc.');
    });

    it('explains that a requested ticker was sold', () => {
        expect(textOf(call('get_position_details', { tickers: ['NVDA'] }))).toContain('no longer held');
    });

    it('lists what is held when nothing matches', () => {
        expect(textOf(call('get_position_details', { tickers: ['ZZZZ'] }))).toContain('Currently held');
    });

    it('reports a tool failure as a result, not a protocol error', () => {
        const response = call('get_position_details', { tickers: [] });
        // A protocol error would make the client hide this from the model.
        expect(response!.error).toBeUndefined();
        expect(resultOf(response).isError).toBe(true);
        expect(textOf(response)).toContain('non-empty');
    });

    it('reports an unknown tool the same way', () => {
        expect(resultOf(call('no_such_tool')).isError).toBe(true);
    });

    it('rejects tools/call without a name', () => {
        const response = handleMcpMessage(
            { jsonrpc: '2.0', id: 1, method: 'tools/call', params: {} }, ctx, NOW);
        expect(response!.error?.code).toBe(-32602);
    });
});

describe('staleness reporting', () => {
    const at = (updatedAt: string, now: string) =>
        textOf(handleMcpMessage(
            { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'get_portfolio_pnl' } },
            { ...ctx, updatedAt }, new Date(now)));

    it('says "today" for a same-day update', () => {
        expect(at('2026-09-12T08:00:00Z', '2026-09-12T20:00:00Z')).toContain('updated today');
    });

    it('says "yesterday" at one day', () => {
        expect(at('2026-09-11T08:00:00Z', '2026-09-12T20:00:00Z')).toContain('updated yesterday');
    });

    it('warns loudly past three days', () => {
        const text = at('2026-08-12T08:00:00Z', '2026-09-12T08:00:00Z');
        expect(text).toContain('⚠️');
        expect(text).toContain('31 days ago');
        expect(text).toContain('not today');
    });

    it('leads every tool with the freshness line', () => {
        for (const tool of ['get_portfolio_brief', 'get_portfolio_positions', 'get_portfolio_pnl']) {
            expect(textOf(call(tool)).startsWith('Portfolio last updated')).toBe(true);
        }
    });
});
