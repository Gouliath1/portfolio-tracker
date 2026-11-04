/**
 * Tools the portfolio chat can call.
 *
 * Two kinds, both executed on the server:
 *
 *  - **Portfolio tools** work on the structured snapshot the browser sends with
 *    each request (positions only exist client-side), so they can filter, rank
 *    and look up holdings without the model scanning a table.
 *  - **Market-data tools** read the server's own caches (price history,
 *    fundamentals, dividends). They never trigger an upstream fetch, so a chat
 *    question can't fan out into Yahoo requests; what the app has not cached
 *    is reported as unavailable.
 *
 * Every result is compact JSON, capped in size, because tool output is input
 * tokens on the next round.
 */

import type { PortfolioSnapshot, SnapshotHolding } from '../../utils/portfolioSnapshot';
import {
    getCachedDividendEvents,
    getCachedFundamentalsBatch,
    getCachedHistoricalPrices,
} from './marketDataDb';
import { isValidSymbol } from './requestGuards';

/** Upper bound on one tool result, in characters. */
export const MAX_TOOL_RESULT_CHARS = 6_000;
/** Model↔tool round trips allowed per question. */
export const MAX_TOOL_ROUNDS = 4;

const RANGE_DAYS = { '1m': 31, '3m': 92, '6m': 183, '1y': 366, '3y': 1096, '5y': 1827 } as const;
type RangeKey = keyof typeof RANGE_DAYS;

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
        name: 'get_price_history',
        description:
            'Price history summary for one ticker over a range: start/end price, change, high and low with dates, ' +
            'worst drawdown, and about 12 evenly spaced points (good for a chart). Prices are in the security\'s own currency. Any ticker, held or not.',
        input_schema: {
            type: 'object' as const,
            properties: {
                ticker: { type: 'string' },
                range: { type: 'string', enum: ['1m', '3m', '6m', '1y', '3y', '5y'], description: 'Default 1y' },
            },
            required: ['ticker'],
        },
    },
    {
        name: 'get_fundamentals',
        description: 'Valuation snapshot per ticker: P/E (trailing, forward), dividend yield, price/book, market cap, sector. Any ticker, held or not.',
        input_schema: {
            type: 'object' as const,
            properties: { tickers: { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 10 } },
            required: ['tickers'],
        },
    },
    {
        name: 'get_dividends',
        description: 'Dividend payments per share for one ticker (ex-dates, amounts), with trailing-12-month total.',
        input_schema: {
            type: 'object' as const,
            properties: { ticker: { type: 'string' } },
            required: ['ticker'],
        },
    },
];

export interface ToolContext {
    snapshot: PortfolioSnapshot | null;
    now?: Date;
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

// ── Market-data tools ───────────────────────────────────────────────────────

function checkSymbol(s: string | null): string {
    if (!s || !isValidSymbol(s)) throw new Error('Invalid ticker symbol');
    return s;
}

async function priceHistory(input: Record<string, unknown>, now: Date) {
    const ticker = checkSymbol(str(input.ticker));
    const range = (str(input.range) ?? '1y') as RangeKey;
    if (!(range in RANGE_DAYS)) throw new Error(`range must be one of ${Object.keys(RANGE_DAYS).join(', ')}`);

    const all = await getCachedHistoricalPrices(ticker);
    const from = new Date(now.getTime() - RANGE_DAYS[range] * 86_400_000).toISOString().slice(0, 10);
    const series = Object.entries(all).filter(([d]) => d >= from).sort(([a], [b]) => a.localeCompare(b));
    if (series.length < 2) return { ticker, range, available: false, note: 'No cached price history for this ticker and range.' };

    let hi = series[0], lo = series[0], peak = series[0][1], worst = 0, worstFrom = '', worstTo = '';
    for (const p of series) {
        if (p[1] > hi[1]) hi = p;
        if (p[1] < lo[1]) lo = p;
        if (p[1] > peak) peak = p[1];
        const dd = (p[1] - peak) / peak;
        if (dd < worst) { worst = dd; worstTo = p[0]; worstFrom = series.find(s => s[1] === peak)?.[0] ?? ''; }
    }
    const first = series[0], last = series[series.length - 1];
    const step = (series.length - 1) / 11;
    const points = Array.from({ length: 12 }, (_, i) => series[Math.round(i * step)]).map(([date, price]) => ({ date, price: num(price, 4) }));

    return {
        ticker, range, available: true,
        start: { date: first[0], price: num(first[1], 4) },
        end: { date: last[0], price: num(last[1], 4) },
        changePct: num(((last[1] - first[1]) / first[1]) * 100),
        high: { date: hi[0], price: num(hi[1], 4) },
        low: { date: lo[0], price: num(lo[1], 4) },
        maxDrawdownPct: num(worst * 100),
        drawdownPeakDate: worstFrom || undefined,
        drawdownTroughDate: worstTo || undefined,
        points,
    };
}

async function fundamentals(input: Record<string, unknown>) {
    const tickers = tickerList(input.tickers).map(t => checkSymbol(t));
    if (tickers.length === 0) throw new Error('"tickers" must be a non-empty array');
    const found = await getCachedFundamentalsBatch(tickers);
    return tickers.map(t => {
        const f = found.get(t);
        if (!f) return { ticker: t, available: false };
        const d = f.data;
        return {
            ticker: t, name: d.name, price: num(d.price, 4), currency: d.currency, sector: d.sector,
            trailingPE: num(d.trailingPE), forwardPE: num(d.forwardPE), priceToBook: num(d.priceToBook),
            dividendYieldPct: num(d.dividendYield),
            marketCap: d.marketCap, ratiosAsOf: f.ratiosFetchedAt?.slice(0, 10) ?? null,
        };
    });
}

async function dividends(input: Record<string, unknown>, now: Date) {
    const ticker = checkSymbol(str(input.ticker));
    const events = Object.entries(await getCachedDividendEvents(ticker)).sort(([a], [b]) => b.localeCompare(a));
    if (events.length === 0) return { ticker, available: false, note: 'No cached dividend history.' };
    const yearAgo = new Date(now.getTime() - 366 * 86_400_000).toISOString().slice(0, 10);
    const ttm = events.filter(([d]) => d >= yearAgo).reduce((s, [, e]) => s + e.amount, 0);
    return {
        ticker, available: true, currency: events[0][1].currency,
        trailing12mPerShare: num(ttm, 4),
        recent: events.slice(0, 12).map(([exDate, e]) => ({ exDate, amount: num(e.amount, 4) })),
    };
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
    const now = ctx.now ?? new Date();
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
            case 'get_price_history': result = await priceHistory(args, now); break;
            case 'get_fundamentals': result = await fundamentals(args); break;
            case 'get_dividends': result = await dividends(args, now); break;
            default: throw new Error(`Unknown tool: ${name}`);
        }
        let text = JSON.stringify(result);
        if (text.length > MAX_TOOL_RESULT_CHARS) {
            text = `${text.slice(0, MAX_TOOL_RESULT_CHARS)}… [truncated; narrow the query]`;
        }
        return { text, isError: false };
    } catch (error) {
        return { text: `Error: ${error instanceof Error ? error.message : 'tool failed'}`, isError: true };
    }
}
