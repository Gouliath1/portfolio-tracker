/**
 * A minimal MCP server over Streamable HTTP.
 *
 * This is what Claude (or any MCP client) talks to when someone pastes their
 * connector URL. It implements the three methods a tools-only server needs —
 * `initialize`, `tools/list`, `tools/call` — plus the notifications a client
 * sends that require no reply.
 *
 * **Stateless by design.** The spec allows a server to answer each POST with a
 * single JSON response instead of opening an SSE stream, and to skip session
 * ids entirely. That suits serverless exactly: no session to keep alive
 * between invocations, no stream to hold open against a function timeout. The
 * cost is no server-initiated messages, which a tools-only server never sends.
 *
 * Rather than reimplement the tool bodies, this reuses the same snapshot shape
 * the local MCP server reads, so both paths describe a portfolio identically.
 */

import type { PortfolioSnapshot, SnapshotHolding } from '../../utils/portfolioSnapshot';

/** The revision of the spec we implement. Echoed back at initialize. */
const PROTOCOL_VERSION = '2024-11-05';

// ── JSON-RPC ─────────────────────────────────────────────────

export interface JsonRpcRequest {
    jsonrpc: '2.0';
    id?: string | number | null;
    method: string;
    params?: Record<string, unknown>;
}

export interface JsonRpcResponse {
    jsonrpc: '2.0';
    id: string | number | null;
    result?: unknown;
    error?: { code: number; message: string; data?: unknown };
}

// Standard JSON-RPC codes; MCP adds no others for this surface.
const PARSE_ERROR = -32700;
const INVALID_REQUEST = -32600;
const METHOD_NOT_FOUND = -32601;
const INVALID_PARAMS = -32602;
const INTERNAL_ERROR = -32603;

const ok = (id: string | number | null, result: unknown): JsonRpcResponse =>
    ({ jsonrpc: '2.0', id, result });

const fail = (id: string | number | null, code: number, message: string): JsonRpcResponse =>
    ({ jsonrpc: '2.0', id, error: { code, message } });

// ── Tools ────────────────────────────────────────────────────

export interface ShareContext {
    snapshot: PortfolioSnapshot;
    markdown: string;
    /** When the portal last published. Surfaced so stale data is visible. */
    updatedAt: string;
}

const TOOLS = [
    {
        name: 'get_portfolio_brief',
        description:
            'Get a complete brief of the portfolio: totals, every holding with weights and returns, ' +
            'allocation by asset class / currency / account, concentration, and recent sales. ' +
            'Use this first for any general question about the portfolio, or any request for ' +
            'review, analysis or recommendations — it contains everything the other tools return.',
        inputSchema: { type: 'object' as const, properties: {}, required: [] },
    },
    {
        name: 'get_portfolio_positions',
        description:
            'List current holdings with quantity, average cost, latest price, market value and ' +
            'portfolio weight. Use when the question is about what is held rather than how it has performed.',
        inputSchema: {
            type: 'object' as const,
            properties: {
                sortBy: {
                    type: 'string',
                    enum: ['value', 'weight', 'return', 'ticker'],
                    description: 'Ordering for the list (default: value, largest first)',
                },
            },
            required: [],
        },
    },
    {
        name: 'get_portfolio_pnl',
        description:
            'Get profit and loss: unrealized, realized from sales, dividend income and total return ' +
            'on cost deployed, plus best and worst performers, concentration and allocation.',
        inputSchema: { type: 'object' as const, properties: {}, required: [] },
    },
    {
        name: 'get_position_details',
        description:
            'Get full detail for specific holdings by ticker symbol, including cost basis, ' +
            'dividends received, holding period, and both price-only and total return.',
        inputSchema: {
            type: 'object' as const,
            properties: {
                tickers: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Ticker symbols, e.g. ["AAPL", "7203.T"]',
                    minItems: 1,
                },
            },
            required: ['tickers'],
        },
    },
];

const signed = (n: number): string => (n >= 0 ? `+${n.toLocaleString()}` : n.toLocaleString());
const signedPct = (n: number): string => `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`;

/**
 * A one-line staleness note prefixed to every tool result.
 *
 * The portal republishes whenever it is opened, so a share can easily be weeks
 * behind. Stating the date in the text — rather than only in a field a model
 * might not read — is what stops an old valuation being reported as today's.
 */
function freshnessLine(updatedAt: string, now: Date): string {
    const written = new Date(updatedAt);
    const days = Math.max(0, Math.floor((now.getTime() - written.getTime()) / 86_400_000));
    const stamp = written.toISOString().slice(0, 10);
    if (days === 0) return `Portfolio last updated today (${stamp}).`;
    if (days === 1) return `Portfolio last updated yesterday (${stamp}).`;
    if (days < 3) return `Portfolio last updated ${days} days ago (${stamp}).`;
    return (
        `⚠️ Portfolio last updated ${days} days ago (${stamp}). Prices and valuations are ` +
        `from that date, not today — open the Portfolio Tracker app to refresh them.`
    );
}

function formatHolding(h: SnapshotHolding, ccy: string): string {
    let text = `${h.ticker} — ${h.name}\n`;
    text += `  Account:          ${h.account}\n`;
    text += `  Asset class:      ${h.assetClass}\n`;
    text += `  Quantity:         ${h.quantity.toLocaleString()}\n`;
    text += `  Average cost:     ${h.avgCost.toLocaleString()} ${h.stockCcy}\n`;
    text += `  Latest price:     ${h.price === null ? 'unavailable' : `${h.price.toLocaleString()} ${h.stockCcy}`}\n`;
    text += `  Cost basis:       ${h.cost.toLocaleString()} ${ccy}\n`;
    text += `  Market value:     ${h.value.toLocaleString()} ${ccy}\n`;
    text += `  Portfolio weight: ${h.weightPct}%\n`;
    text += `  Price return:     ${signedPct(h.pnlPct)}\n`;
    text += `  Total return:     ${signedPct(h.totalReturnPct)} (including ${h.dividends.toLocaleString()} ${ccy} dividends)\n`;
    text += `  Held since:       ${h.heldSince}\n\n`;
    return text;
}

function callTool(name: string, args: Record<string, unknown>, ctx: ShareContext, now: Date): string {
    const { snapshot } = ctx;
    const ccy = snapshot.baseCurrency;
    const header = freshnessLine(ctx.updatedAt, now);

    switch (name) {
        case 'get_portfolio_brief':
            return `${header}\n\n${ctx.markdown}`;

        case 'get_portfolio_positions': {
            const sortBy = typeof args.sortBy === 'string' ? args.sortBy : 'value';
            const sorted = [...snapshot.holdings];
            if (sortBy === 'ticker') sorted.sort((a, b) => a.ticker.localeCompare(b.ticker));
            else if (sortBy === 'return') sorted.sort((a, b) => b.totalReturnPct - a.totalReturnPct);
            else sorted.sort((a, b) => b.value - a.value);

            let text = `${header}\n\n${snapshot.portfolioName} — ${snapshot.holdingCount} holdings, `;
            text += `${snapshot.totals.value.toLocaleString()} ${ccy} total value.\n\n`;
            for (const h of sorted) {
                text += `• ${h.ticker} (${h.name}) — ${h.account}\n`;
                text += `  ${h.quantity.toLocaleString()} @ avg ${h.avgCost.toLocaleString()} ${h.stockCcy}`;
                text += h.price === null ? ', price unavailable' : `, now ${h.price.toLocaleString()} ${h.stockCcy}`;
                text += `\n  ${h.value.toLocaleString()} ${ccy} · ${h.weightPct}% of portfolio · `;
                text += `${signedPct(h.totalReturnPct)} total return · ${h.assetClass}\n`;
            }
            return text;
        }

        case 'get_portfolio_pnl': {
            const { totals } = snapshot;
            let text = `${header}\n\n${snapshot.portfolioName} — performance (all amounts in ${ccy})\n\n`;
            text += `Market value:      ${totals.value.toLocaleString()}\n`;
            text += `Cost basis:        ${totals.cost.toLocaleString()}\n`;
            text += `Unrealized P&L:    ${signed(totals.unrealizedPnl)} (${signedPct(totals.unrealizedPnlPct)})\n`;
            text += `Realized (sales):  ${signed(totals.realizedPnl)} (${signedPct(totals.realizedPnlPct)})\n`;
            text += `Dividends:         ${totals.dividends.toLocaleString()}\n`;
            text += `Total return:      ${signedPct(totals.totalReturnPct)} on cost deployed\n\n`;

            const ranked = snapshot.holdings.filter(h => h.price !== null)
                .sort((a, b) => b.totalReturnPct - a.totalReturnPct);
            if (ranked.length > 0) {
                text += `Best performers:\n`;
                for (const h of ranked.slice(0, 3)) {
                    text += `• ${h.ticker}: ${signedPct(h.totalReturnPct)} (${h.weightPct}% of portfolio)\n`;
                }
                text += `\nWorst performers:\n`;
                for (const h of ranked.slice(-3).reverse()) {
                    text += `• ${h.ticker}: ${signedPct(h.totalReturnPct)} (${h.weightPct}% of portfolio)\n`;
                }
            }
            text += `\nConcentration: top 5 holdings are ${snapshot.top5Pct}% of value.\n`;
            text += `Allocation by asset class: ${snapshot.byAssetClass.map(a => `${a.label} ${a.pct}%`).join(', ')}\n`;
            text += `Allocation by currency: ${snapshot.byCurrency.map(a => `${a.label} ${a.pct}%`).join(', ')}\n`;
            return text;
        }

        case 'get_position_details': {
            const raw = Array.isArray(args.tickers) ? args.tickers : [];
            if (raw.length === 0) throw new Error('get_position_details requires a non-empty "tickers" array');

            const wanted = new Set(raw.map(t => String(t).toLowerCase()));
            const matched = snapshot.holdings.filter(h => wanted.has(h.ticker.toLowerCase()));

            if (matched.length === 0) {
                const closed = snapshot.recentClosed.filter(c => wanted.has(c.ticker.toLowerCase()));
                const note = closed.length > 0
                    ? `\n\nNote: ${closed.map(c => c.ticker).join(', ')} appears in recently closed ` +
                      `positions, sold on ${closed.map(c => c.soldOn).join(', ')} — no longer held.`
                    : '';
                return `${header}\n\nNo open holdings match: ${raw.join(', ')}.\n\n` +
                       `Currently held: ${snapshot.holdings.map(h => h.ticker).join(', ') || '(none)'}${note}`;
            }
            return `${header}\n\n` + matched.map(h => formatHolding(h, ccy)).join('');
        }

        default:
            throw new Error(`Unknown tool: ${name}`);
    }
}

// ── Dispatch ─────────────────────────────────────────────────

/**
 * Handle one JSON-RPC message.
 *
 * Returns null for notifications (no `id`), which per JSON-RPC must not be
 * answered — the caller turns that into a 202 with an empty body.
 */
export function handleMcpMessage(
    message: JsonRpcRequest,
    ctx: ShareContext,
    now = new Date(),
): JsonRpcResponse | null {
    const isNotification = message.id === undefined || message.id === null;
    const id = isNotification ? null : message.id!;

    if (message.jsonrpc !== '2.0' || typeof message.method !== 'string') {
        return isNotification ? null : fail(id, INVALID_REQUEST, 'Not a valid JSON-RPC 2.0 request');
    }

    switch (message.method) {
        case 'initialize':
            return ok(id, {
                protocolVersion: PROTOCOL_VERSION,
                capabilities: { tools: {} },
                serverInfo: { name: 'portfolio-tracker', version: '1.0.0' },
            });

        // Lifecycle and keep-alive notifications: acknowledged by saying nothing.
        case 'notifications/initialized':
        case 'notifications/cancelled':
            return null;

        case 'ping':
            return ok(id, {});

        case 'tools/list':
            return ok(id, { tools: TOOLS });

        case 'tools/call': {
            const params = (message.params ?? {}) as { name?: unknown; arguments?: unknown };
            if (typeof params.name !== 'string') {
                return fail(id, INVALID_PARAMS, 'tools/call requires a string "name"');
            }
            const args = (params.arguments ?? {}) as Record<string, unknown>;
            try {
                const text = callTool(params.name, args, ctx, now);
                return ok(id, { content: [{ type: 'text', text }], isError: false });
            } catch (error) {
                // Tool failures are results, not protocol errors: the client
                // should show the model what went wrong rather than treating
                // the whole call as malformed.
                return ok(id, {
                    content: [{
                        type: 'text',
                        text: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
                    }],
                    isError: true,
                });
            }
        }

        // Declared capabilities are tools-only, but clients probe these anyway.
        case 'resources/list':
            return ok(id, { resources: [] });
        case 'prompts/list':
            return ok(id, { prompts: [] });

        default:
            return isNotification
                ? null
                : fail(id, METHOD_NOT_FOUND, `Method not found: ${message.method}`);
    }
}

export const JSON_RPC_CODES = {
    PARSE_ERROR, INVALID_REQUEST, METHOD_NOT_FOUND, INVALID_PARAMS, INTERNAL_ERROR,
};

export { fail as jsonRpcError };
