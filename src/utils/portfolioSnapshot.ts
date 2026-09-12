/**
 * Portfolio → plain-text brief, for handing to an AI assistant.
 *
 * The portal's data lives in the browser (localStorage), so anything that
 * wants to reason about it — Claude, ChatGPT, a local MCP server — needs the
 * numbers carried out first. `buildSnapshot` is that carrier: it reduces a
 * computed `PortfolioSummary` (lot-level, FX-resolved) into a compact,
 * aggregated shape, and `formatSnapshotMarkdown` renders it as markdown.
 *
 * Two properties matter and are worth preserving if this is edited:
 *
 *  - **Aggregated, not lot-level.** Lots are a tax/FIFO concern; an assistant
 *    reasoning about concentration or allocation wants one row per holding.
 *    We group by (ticker, account) — the same matching key the rest of the app
 *    treats as a tax-distinct holding.
 *  - **Token-frugal.** This is pasted into a chat window, so it pays a token
 *    cost on every use. Percentages and pre-computed allocations are cheaper
 *    for a model to use than raw rows it has to sum itself.
 *
 * Money is emitted in the base currency, unformatted (no separators, no
 * symbols) — the currency is stated once in the header. Per-unit prices stay
 * in the security's own listing currency, which is named per row.
 */

import { PortfolioSummary, Position, Currency } from '@portfolio/types';

// ── Shape ────────────────────────────────────────────────────

export interface SnapshotHolding {
    ticker: string;
    name: string;
    account: string;
    assetClass: string;
    /** Currency the security trades in — not the base currency. */
    stockCcy: Currency;
    quantity: number;
    /** Weighted-average cost per unit, in `stockCcy`. */
    avgCost: number;
    /** Latest price per unit in `stockCcy`; null when prices failed to load. */
    price: number | null;
    /** Market value and cost basis, both in base currency. */
    value: number;
    cost: number;
    /** Share of total portfolio value, percent. */
    weightPct: number;
    /** Price-only return, percent. */
    pnlPct: number;
    /** Return including dividends, percent. */
    totalReturnPct: number;
    /** Dividend income to date, base currency. */
    dividends: number;
    /** Earliest buy date across the lots making up this holding. */
    heldSince: string;
}

export interface SnapshotAllocation {
    label: string;
    value: number;
    pct: number;
}

export interface SnapshotTotals {
    value: number;
    cost: number;
    unrealizedPnl: number;
    unrealizedPnlPct: number;
    /**
     * Sales only. `PortfolioSummary.realizedPnlJPY` folds closed-lot dividends
     * into the realized figure; we strip them back out so `dividends` is the
     * single owner of all dividend income and the three components can be
     * added without double-counting. Mirrors the Total P&L card.
     */
    realizedPnl: number;
    realizedPnlPct: number;
    /** All dividend income, open and closed lots alike. */
    dividends: number;
    /** Unrealized + sales + dividends, over total cost deployed. */
    totalReturnPct: number;
}

export interface SnapshotClosed {
    ticker: string;
    name: string;
    account: string;
    soldOn: string;
    /** Sales-only — this lot's dividends are counted under `totals.dividends`. */
    realizedPnl: number;
    realizedPnlPct: number;
}

export interface PortfolioSnapshot {
    /** ISO date the brief was produced — an assistant needs to know staleness. */
    generatedAt: string;
    baseCurrency: string;
    portfolioName: string;
    holdingCount: number;
    totals: SnapshotTotals;
    holdings: SnapshotHolding[];
    byAssetClass: SnapshotAllocation[];
    byCurrency: SnapshotAllocation[];
    byAccount: SnapshotAllocation[];
    /** Combined weight of the five largest holdings, percent. */
    top5Pct: number;
    closedCount: number;
    /** Most recent closes only — the full history is rarely worth the tokens. */
    recentClosed: SnapshotClosed[];
}

// ── Helpers ──────────────────────────────────────────────────

/** Currencies conventionally written without minor units. */
const ZERO_DECIMAL: ReadonlySet<string> = new Set(['JPY', 'KRW']);

const roundMoney = (n: number, ccy: string): number =>
    ZERO_DECIMAL.has(ccy) ? Math.round(n) : Math.round(n * 100) / 100;

const round2 = (n: number): number => Math.round(n * 100) / 100;

const pctOf = (part: number, whole: number): number =>
    whole === 0 ? 0 : round2((part / whole) * 100);

/** Sum a numeric field, treating a missing value as zero. */
const sumBy = <T,>(items: T[], pick: (item: T) => number | undefined): number =>
    items.reduce((total, item) => total + (pick(item) ?? 0), 0);

/**
 * Group by a caller-supplied label and convert to descending-by-value
 * allocations. Used for the asset-class / currency / account breakdowns.
 */
function allocate(
    positions: Position[],
    label: (p: Position) => string,
    totalValue: number,
    baseCurrency: string,
): SnapshotAllocation[] {
    const buckets = new Map<string, number>();
    for (const p of positions) {
        const key = label(p);
        buckets.set(key, (buckets.get(key) ?? 0) + p.currentValueJPY);
    }
    return [...buckets.entries()]
        .map(([key, value]) => ({
            label: key,
            value: roundMoney(value, baseCurrency),
            pct: pctOf(value, totalValue),
        }))
        .sort((a, b) => b.value - a.value);
}

// ── Build ────────────────────────────────────────────────────

export interface BuildSnapshotOptions {
    /** { ticker: assetClass }, as resolved by `useAssetClasses`. */
    assetClasses?: Record<string, string>;
    portfolioName?: string;
    /** Overridable so tests don't depend on the wall clock. */
    now?: Date;
    /** How many closed lots to list. */
    recentClosedLimit?: number;
}

/**
 * Reduce a computed summary to the brief's shape.
 *
 * Note the base-currency fields carry a `JPY` suffix throughout `Position` for
 * historical reasons — they hold whatever base currency is active, not yen.
 */
export function buildSnapshot(
    summary: PortfolioSummary,
    baseCurrency: string,
    options: BuildSnapshotOptions = {},
): PortfolioSnapshot {
    const {
        assetClasses = {},
        portfolioName = 'Portfolio',
        now = new Date(),
        recentClosedLimit = 10,
    } = options;

    const classOf = (ticker: string | number): string =>
        assetClasses[String(ticker)] ?? 'Other';

    const totalValue = summary.totalValueJPY;

    // Collapse lots into holdings keyed by (ticker, account).
    const groups = new Map<string, Position[]>();
    for (const p of summary.positions) {
        const key = `${String(p.ticker)} ${p.account}`;
        const existing = groups.get(key);
        if (existing) existing.push(p);
        else groups.set(key, [p]);
    }

    const holdings: SnapshotHolding[] = [...groups.values()].map(lots => {
        const first = lots[0];
        const quantity = sumBy(lots, l => l.quantity);
        const cost = sumBy(lots, l => l.costInJPY);
        const value = sumBy(lots, l => l.currentValueJPY);
        const dividends = sumBy(lots, l => l.dividendIncomeJPY);

        // Average cost is expressed per unit in the security's own currency, so
        // it is comparable against `price` — a quantity-weighted mean of the
        // lots' own per-unit costs rather than anything FX-converted.
        const avgCost = quantity === 0
            ? 0
            : sumBy(lots, l => l.costPerUnit * l.quantity) / quantity;

        return {
            ticker: String(first.ticker),
            name: first.fullName,
            account: first.account,
            assetClass: classOf(first.ticker),
            stockCcy: first.stockCcy,
            quantity: round2(quantity),
            avgCost: round2(avgCost),
            price: first.currentPrice,
            value: roundMoney(value, baseCurrency),
            cost: roundMoney(cost, baseCurrency),
            weightPct: pctOf(value, totalValue),
            pnlPct: pctOf(value - cost, cost),
            totalReturnPct: pctOf(value + dividends - cost, cost),
            dividends: roundMoney(dividends, baseCurrency),
            heldSince: lots.reduce(
                (earliest, l) => (l.transactionDate < earliest ? l.transactionDate : earliest),
                first.transactionDate,
            ),
        };
    }).sort((a, b) => b.value - a.value);

    // Realized P&L arrives with closed-lot dividends already folded in, while
    // `totalDividendsJPY` counts those same dividends again. Strip them out of
    // the realized side so the brief's components sum to the headline figure
    // instead of over-stating it — the Total P&L card does exactly this.
    const closedLotDividends = sumBy(summary.closedPositions, p => p.dividendIncomeJPY);
    const realizedSales = summary.realizedPnlJPY - closedLotDividends;

    // Total return is measured against every unit of cost deployed — open cost
    // plus the cost basis of positions already closed — so realized gains
    // aren't credited against the open book alone.
    const deployedCost = summary.totalCostJPY + summary.realizedCostJPY;
    const combinedReturn =
        summary.totalPnlJPY + realizedSales + summary.totalDividendsJPY;

    const recentClosed: SnapshotClosed[] = [...summary.closedPositions]
        .sort((a, b) => (b.saleDate ?? '').localeCompare(a.saleDate ?? ''))
        .slice(0, recentClosedLimit)
        .map(p => {
            // Same dividend split as the totals, so the rows and the headline
            // realized figure describe the same quantity.
            const sales = (p.realizedPnlJPY ?? 0) - p.dividendIncomeJPY;
            return {
                ticker: String(p.ticker),
                name: p.fullName,
                account: p.account,
                soldOn: p.saleDate ?? '',
                realizedPnl: roundMoney(sales, baseCurrency),
                realizedPnlPct: pctOf(sales, p.costInJPY),
            };
        });

    return {
        generatedAt: now.toISOString().slice(0, 10),
        baseCurrency,
        portfolioName,
        holdingCount: holdings.length,
        totals: {
            value: roundMoney(totalValue, baseCurrency),
            cost: roundMoney(summary.totalCostJPY, baseCurrency),
            unrealizedPnl: roundMoney(summary.totalPnlJPY, baseCurrency),
            unrealizedPnlPct: round2(summary.totalPnlPercentage),
            realizedPnl: roundMoney(realizedSales, baseCurrency),
            realizedPnlPct: pctOf(realizedSales, summary.realizedCostJPY),
            dividends: roundMoney(summary.totalDividendsJPY, baseCurrency),
            totalReturnPct: pctOf(combinedReturn, deployedCost),
        },
        holdings,
        byAssetClass: allocate(summary.positions, p => classOf(p.ticker), totalValue, baseCurrency),
        byCurrency: allocate(summary.positions, p => p.stockCcy, totalValue, baseCurrency),
        byAccount: allocate(summary.positions, p => p.account, totalValue, baseCurrency),
        top5Pct: round2(holdings.slice(0, 5).reduce((s, h) => s + h.weightPct, 0)),
        closedCount: summary.closedPositions.length,
        recentClosed,
    };
}

// ── Render ───────────────────────────────────────────────────

const signed = (n: number): string => (n >= 0 ? `+${n}` : `${n}`);

/**
 * Render the brief as markdown, ready to paste into a chat window.
 *
 * The trailing instruction block is deliberate: pasted alone, a wall of
 * numbers tends to get a summary back rather than advice. Stating the ask —
 * and that the model should say when the data can't support a claim — is what
 * turns it into something worth reading.
 */
export function formatSnapshotMarkdown(snapshot: PortfolioSnapshot): string {
    const { baseCurrency: ccy, totals } = snapshot;
    const lines: string[] = [];

    lines.push(`# Portfolio brief — ${snapshot.portfolioName}`);
    lines.push('');
    lines.push(`Generated ${snapshot.generatedAt}. All amounts in ${ccy} unless stated otherwise.`);
    lines.push('');

    lines.push('## Totals');
    lines.push('');
    lines.push(`- Market value: ${totals.value}`);
    lines.push(`- Cost basis: ${totals.cost}`);
    lines.push(`- Unrealized P&L: ${signed(totals.unrealizedPnl)} (${signed(totals.unrealizedPnlPct)}%)`);
    lines.push(`- Realized P&L from sales: ${signed(totals.realizedPnl)} (${signed(totals.realizedPnlPct)}%)`);
    lines.push(`- Dividends received (all lots): ${totals.dividends}`);
    lines.push(`- Total return on cost deployed: ${signed(totals.totalReturnPct)}%`);
    lines.push(`- Holdings: ${snapshot.holdingCount} open, ${snapshot.closedCount} closed`);
    lines.push(`- Top 5 concentration: ${snapshot.top5Pct}% of value`);
    lines.push('');

    lines.push('## Holdings');
    lines.push('');
    lines.push(`| Ticker | Name | Account | Class | Qty | Avg cost | Price | Ccy | Value (${ccy}) | Weight | P&L | Total ret. | Held since |`);
    lines.push('|---|---|---|---|---|---|---|---|---|---|---|---|---|');
    for (const h of snapshot.holdings) {
        lines.push(
            `| ${h.ticker} | ${h.name} | ${h.account} | ${h.assetClass} | ${h.quantity} | ${h.avgCost} | ` +
            `${h.price ?? 'n/a'} | ${h.stockCcy} | ${h.value} | ${h.weightPct}% | ` +
            `${signed(h.pnlPct)}% | ${signed(h.totalReturnPct)}% | ${h.heldSince} |`,
        );
    }
    lines.push('');

    const allocationBlock = (title: string, rows: SnapshotAllocation[]): void => {
        if (rows.length === 0) return;
        lines.push(`## Allocation by ${title}`);
        lines.push('');
        for (const row of rows) lines.push(`- ${row.label}: ${row.pct}% (${row.value})`);
        lines.push('');
    };
    allocationBlock('asset class', snapshot.byAssetClass);
    allocationBlock('listing currency', snapshot.byCurrency);
    allocationBlock('account', snapshot.byAccount);

    if (snapshot.recentClosed.length > 0) {
        lines.push('## Recently closed');
        lines.push('');
        lines.push(`| Ticker | Account | Sold | Realized P&L (${ccy}) | % |`);
        lines.push('|---|---|---|---|---|');
        for (const c of snapshot.recentClosed) {
            lines.push(`| ${c.ticker} | ${c.account} | ${c.soldOn} | ${signed(c.realizedPnl)} | ${signed(c.realizedPnlPct)}% |`);
        }
        lines.push('');
    }

    lines.push('## What I want');
    lines.push('');
    lines.push('Review this portfolio and tell me:');
    lines.push('1. Concentration and diversification risks worth acting on.');
    lines.push('2. Currency and asset-class exposure that looks unintended.');
    lines.push('3. Positions worth trimming, adding to, or reviewing — and why.');
    lines.push('4. Anything the data suggests I have overlooked.');
    lines.push('');
    lines.push('Be specific and quantitative. Where the data above is insufficient to judge, say so rather than guessing.');

    return lines.join('\n');
}
