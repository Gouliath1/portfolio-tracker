/**
 * Tools the portfolio chat can call.
 *
 *  - **Portfolio tools** work on the structured snapshot the browser sends with
 *    each request, because positions only exist client-side and no API can
 *    serve them.
 *  - **`market_data`** is one generic, read-only window onto the app's existing
 *    market-data routes (prices, history, dividends, FX, fundamentals). It
 *    calls the route handlers in-process, so their validation, caching and
 *    rate guards apply exactly as they do for the UI. The model composes
 *    queries; nothing here is specific to one kind of question.
 *
 * Every result is compact JSON, capped in size, because tool output is input
 * tokens on the next round.
 */

import { NextRequest } from 'next/server';
import type { PortfolioSnapshot, SnapshotHolding } from '../../utils/portfolioSnapshot';
import { GET as historicalPrices } from '../../app/api/historical-prices/route';
import { GET as dividends } from '../../app/api/dividends/route';
import { GET as fxRates } from '../../app/api/fx-rates/route';
import { GET as prices } from '../../app/api/prices/route';
import { GET as tickerInfo } from '../../app/api/ticker-info/route';
import { GET as screenerQuotes } from '../../app/api/screener/quotes/route';

/** Upper bound on one tool result, in characters. */
export const MAX_TOOL_RESULT_CHARS = 6_000;
/** The market_data tool batches many lookups, so it gets a larger budget. */
export const MAX_MARKET_RESULT_CHARS = 20_000;
/** Lookups per market_data call. */
export const MAX_MARKET_REQUESTS = 30;
/** Model↔tool round trips allowed per question. */
export const MAX_TOOL_ROUNDS = 4;

/**
 * Read-only routes the model may call. `fresh=1` is never forwarded, so chat
 * can't force upstream refreshes beyond what a normal page view would do.
 */
const MARKET_ROUTES: Record<string, { handler: (r: NextRequest) => Promise<Response>; params: string }> = {
    '/api/historical-prices': { handler: historicalPrices, params: 'symbol, range (e.g. 30d, 90d, 1y, 5y, max) → daily closes, trimmed to that window' },
    '/api/dividends': { handler: dividends, params: 'symbol, range (e.g. 1y, 5y) → ex-date dividends per share' },
    '/api/prices': { handler: prices, params: 'symbols (comma list) → latest price per symbol' },
    '/api/fx-rates': { handler: fxRates, params: 'pair (e.g. USDJPY), date (YYYY-MM-DD, optional)' },
    '/api/ticker-info': { handler: tickerInfo, params: 'symbol → company name' },
    '/api/screener/quotes': { handler: screenerQuotes, params: 'symbols (comma list) → cached P/E, P/B, yield, market cap, sector' },
};

export const CHAT_TOOLS = [
    {
        name: 'query_holdings',
        description:
            'List the user\'s open holdings, filtered and ranked. Use for "my biggest / best / worst positions", ' +
            'everything in one account, asset class or currency, or anything beyond the summary in the brief.',
        input_schema: {
            type: 'object' as const,
            properties: {
                sortBy: { type: 'string', enum: ['value', 'weight', 'pnlPct', 'totalReturnPct', 'dividends', 'heldSince', 'ticker'], description: 'Default: value' },
                order: { type: 'string', enum: ['desc', 'asc'], description: 'Default: desc (asc for ticker and heldSince)' },
                assetClass: { type: 'string', description: 'Exact asset class name from the brief' },
                account: { type: 'string', description: 'Exact account name from the brief' },
                currency: { type: 'string', description: 'Listing currency, e.g. USD' },
                limit: { type: 'integer', minimum: 1, maximum: 50, description: 'Default 15' },
            },
        },
    },
    {
        name: 'get_holding',
        description: 'Full detail for one or more holdings by ticker (every account holding it), plus sale history if sold.',
        input_schema: {
            type: 'object' as const,
            properties: { tickers: { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 10 } },
            required: ['tickers'],
        },
    },
    {
        name: 'get_closed_positions',
        description: 'Recent sales with realized P&L, newest first.',
        input_schema: {
            type: 'object' as const,
            properties: { ticker: { type: 'string', description: 'Only this ticker' } },
        },
    },
    {
        name: 'market_data',
        description:
            'Read-only market data from the app\'s own API, for any ticker (held or not). Pass up to ' +
            `${MAX_MARKET_REQUESTS} requests per call and batch independent lookups together, e.g. one historical-prices ` +
            'request per holding to compare recent moves. Daily series come back summarised (first, last, change %, ' +
            'min, max, ~12 sample points) rather than in full. Prices are in each security\'s own currency; data may be stale or missing.\n' +
            'Paths:\n' + Object.entries(MARKET_ROUTES).map(([k, v]) => `- ${k}: ${v.params}`).join('\n'),
        input_schema: {
            type: 'object' as const,
            properties: {
                requests: {
                    type: 'array',
                    minItems: 1,
                    maxItems: MAX_MARKET_REQUESTS,
                    items: {
                        type: 'object',
                        properties: {
                            path: { type: 'string', enum: Object.keys(MARKET_ROUTES) },
                            query: { type: 'object', additionalProperties: { type: 'string' }, description: 'Query parameters, e.g. {"symbol":"AAPL","range":"30d"}' },
                        },
                        required: ['path'],
                    },
                },
            },
            required: ['requests'],
        },
    },
];

export interface ToolContext {
    snapshot: PortfolioSnapshot | null;
}

const num = (n: number | null | undefined, digits = 2): number | null =>
    n == null || !Number.isFinite(n) ? null : Math.round(n * 10 ** digits) / 10 ** digits;

const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);

function tickerList(v: unknown): string[] {
    const list = Array.isArray(v) ? v : [];
    return [...new Set(list.map(x => String(x).trim()).filter(Boolean))].slice(0, 10);
}

const holdingView = (h: SnapshotHolding) => ({
    ticker: h.ticker, name: h.name, account: h.account, assetClass: h.assetClass, ccy: h.stockCcy,
    qty: h.quantity, avgCost: h.avgCost, price: h.price, value: h.value, cost: h.cost,
    weightPct: h.weightPct, pnlPct: h.pnlPct, totalReturnPct: h.totalReturnPct,
    dividends: h.dividends, heldSince: h.heldSince,
});

// ── Portfolio tools ─────────────────────────────────────────────────────────

function queryHoldings(input: Record<string, unknown>, snap: PortfolioSnapshot) {
    const sortBy = str(input.sortBy) ?? 'value';
    const key = (['value', 'weight', 'pnlPct', 'totalReturnPct', 'dividends', 'heldSince', 'ticker'].includes(sortBy)
        ? sortBy : 'value');
    const ascDefault = key === 'ticker' || key === 'heldSince';
    const asc = input.order === 'asc' || (input.order !== 'desc' && ascDefault);
    const limit = Math.min(50, Math.max(1, Number(input.limit) || 15));

    const eq = (a: string, b: string | null) => b === null || a.toLowerCase() === b.toLowerCase();
    const cls = str(input.assetClass), acct = str(input.account), ccy = str(input.currency);
    const matched = snap.holdings.filter(h => eq(h.assetClass, cls) && eq(h.account, acct) && eq(h.stockCcy, ccy));

    const value = (h: SnapshotHolding): number | string => key === 'weight' ? h.weightPct
        : key === 'ticker' ? h.ticker : key === 'heldSince' ? h.heldSince
        : (h as unknown as Record<string, number>)[key];
    matched.sort((a, b) => {
        const x = value(a), y = value(b);
        const c = typeof x === 'string' ? x.localeCompare(String(y)) : x - (y as number);
        return asc ? c : -c;
    });

    const subtotal = matched.reduce((s, h) => s + h.value, 0);
    return {
        baseCurrency: snap.baseCurrency,
        matched: matched.length,
        matchedValue: num(subtotal),
        matchedWeightPct: num(matched.reduce((s, h) => s + h.weightPct, 0)),
        holdings: matched.slice(0, limit).map(holdingView),
    };
}

function getHolding(input: Record<string, unknown>, snap: PortfolioSnapshot) {
    const wanted = tickerList(input.tickers).map(t => t.toLowerCase());
    if (wanted.length === 0) throw new Error('"tickers" must be a non-empty array');
    return {
        baseCurrency: snap.baseCurrency,
        holdings: snap.holdings.filter(h => wanted.includes(h.ticker.toLowerCase())).map(holdingView),
        sold: snap.recentClosed.filter(c => wanted.includes(c.ticker.toLowerCase())),
        notHeld: wanted.filter(t => !snap.holdings.some(h => h.ticker.toLowerCase() === t)),
    };
}

function closedPositions(input: Record<string, unknown>, snap: PortfolioSnapshot) {
    const ticker = str(input.ticker)?.toLowerCase();
    return {
        baseCurrency: snap.baseCurrency,
        totalClosed: snap.closedCount,
        note: snap.closedCount > snap.recentClosed.length
            ? `Only the ${snap.recentClosed.length} most recent sales are available.` : undefined,
        sales: snap.recentClosed.filter(c => !ticker || c.ticker.toLowerCase() === ticker),
    };
}

// ── Market data ─────────────────────────────────────────────────────────────

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

const isDateMap = (v: unknown): v is Record<string, unknown> => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) return false;
    const keys = Object.keys(v);
    return keys.length > 0 && keys.every(k => DATE_KEY.test(k));
};

/**
 * Shrink what a route returns without knowing which route it was. A map keyed
 * by date is a time series: numeric ones become a summary with a few sample
 * points, object-valued ones (dividends) keep only the latest entries.
 */
export function compactSeries(value: unknown, since?: string): unknown {
    if (Array.isArray(value)) return value.slice(0, 50).map(v => compactSeries(v, since));
    if (typeof value !== 'object' || value === null) return value;

    if (isDateMap(value)) {
        // The routes hand back everything they have cached whatever `range` was
        // asked for (it only decides whether to refetch), so the window is applied here.
        const rows = Object.entries(value)
            .filter(([d]) => !since || d >= since)
            .sort(([a], [b]) => a.localeCompare(b));
        if (rows.length === 0) return { n: 0, note: since ? `no data since ${since}` : 'no data' };
        if (rows.every(([, v]) => typeof v === 'number' && Number.isFinite(v))) {
            const nums = rows as [string, number][];
            if (nums.length < 2) return { n: nums.length, points: nums };
            const first = nums[0], last = nums[nums.length - 1];
            const hi = nums.reduce((m, r) => (r[1] > m[1] ? r : m));
            const lo = nums.reduce((m, r) => (r[1] < m[1] ? r : m));
            const step = (nums.length - 1) / Math.min(11, nums.length - 1);
            const sample = Array.from({ length: Math.min(12, nums.length) }, (_, k) => nums[Math.round(k * step)])
                .map(([d, p]) => [d, num(p, 4)]);
            return {
                n: nums.length, from: first[0], to: last[0], first: num(first[1], 4), last: num(last[1], 4),
                changePct: first[1] === 0 ? null : num(((last[1] - first[1]) / first[1]) * 100),
                min: { date: lo[0], value: num(lo[1], 4) }, max: { date: hi[0], value: num(hi[1], 4) }, sample,
            };
        }
        return { n: rows.length, latest: rows.slice(-12).reverse().map(([d, v]) => ({ date: d, ...(typeof v === 'object' ? v : { value: v }) })) };
    }
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, compactSeries(v, since)]));
}

/** First date inside a `range` like 30d, 90d, 1y; null for max or anything else. */
export function rangeStart(range: unknown, now = new Date()): string | null {
    const m = typeof range === 'string' ? /^(\d{1,3})([dy])$/.exec(range) : null;
    if (!m) return null;
    const d = new Date(now);
    if (m[2] === 'y') d.setFullYear(d.getFullYear() - Number(m[1]));
    else d.setDate(d.getDate() - Number(m[1]));
    return d.toISOString().slice(0, 10);
}

async function marketRequest(raw: unknown): Promise<unknown> {
    const req = (typeof raw === 'object' && raw !== null ? raw : {}) as { path?: unknown; query?: unknown };
    const route = typeof req.path === 'string' ? MARKET_ROUTES[req.path] : undefined;
    if (!route) return { error: `path must be one of ${Object.keys(MARKET_ROUTES).join(', ')}` };

    const url = new URL(`http://internal${req.path}`);
    const query = (typeof req.query === 'object' && req.query !== null ? req.query : {}) as Record<string, unknown>;
    for (const [k, v] of Object.entries(query)) {
        if (k === 'fresh' || k === 'cachedOnly') continue;
        if (typeof v === 'string' || typeof v === 'number') url.searchParams.set(k, String(v));
    }
    try {
        const res = await route.handler(new NextRequest(url));
        const body = await res.json().catch(() => null);
        return res.ok
            ? { path: req.path, query: Object.fromEntries(url.searchParams), data: compactSeries(body, rangeStart(url.searchParams.get('range'))  ?? undefined) }
            : { path: req.path, query: Object.fromEntries(url.searchParams), error: (body as { error?: string } | null)?.error ?? `HTTP ${res.status}` };
    } catch (error) {
        return { path: req.path, error: error instanceof Error ? error.message : 'request failed' };
    }
}

async function marketData(input: Record<string, unknown>) {
    const list = Array.isArray(input.requests) ? input.requests : [];
    if (list.length === 0) throw new Error('"requests" must be a non-empty array');
    return Promise.all(list.slice(0, MAX_MARKET_REQUESTS).map(marketRequest));
}

// ── Dispatch ────────────────────────────────────────────────────────────────

/**
 * Run one tool call and return the text handed back to the model. Failures are
 * returned as `{ text, isError: true }` so the model can recover or say so,
 * instead of the whole answer failing.
 */
export async function runChatTool(
    name: string,
    input: unknown,
    ctx: ToolContext,
): Promise<{ text: string; isError: boolean }> {
    const args = (typeof input === 'object' && input !== null ? input : {}) as Record<string, unknown>;
    try {
        let result: unknown;
        switch (name) {
            case 'query_holdings':
            case 'get_holding':
            case 'get_closed_positions': {
                if (!ctx.snapshot) throw new Error('Structured portfolio data is not available; use the brief');
                result = name === 'query_holdings' ? queryHoldings(args, ctx.snapshot)
                    : name === 'get_holding' ? getHolding(args, ctx.snapshot)
                    : closedPositions(args, ctx.snapshot);
                break;
            }
            case 'market_data': result = await marketData(args); break;
            default: throw new Error(`Unknown tool: ${name}`);
        }
        let text = JSON.stringify(result);
        const cap = name === 'market_data' ? MAX_MARKET_RESULT_CHARS : MAX_TOOL_RESULT_CHARS;
        if (text.length > cap) {
            text = `${text.slice(0, cap)}… [truncated; narrow the query]`;
        }
        return { text, isError: false };
    } catch (error) {
        return { text: `Error: ${error instanceof Error ? error.message : 'tool failed'}`, isError: true };
    }
}
