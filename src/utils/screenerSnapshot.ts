/**
 * Screener → compact snapshot, for the AI assistant.
 *
 * The screener is where the user researches stocks they may buy, so it is a
 * different subject from the portfolio: rows are candidates, not holdings. The
 * snapshot covers what the screener actually knows — fundamentals that have
 * been loaded, plus the user's pins and price alerts.
 *
 * Two choices worth preserving:
 *  - **Notes are the user's own writing**, so they only go along because the
 *    user asked the assistant to read them, and the chat says so in its privacy
 *    line. Each is clipped, and the total is budgeted so a few long notes can't
 *    crowd out the numbers.
 *  - **Bounded.** A universe can be well over a thousand names. Pinned stocks
 *    always make the cut, the rest are the largest by market cap, and the
 *    snapshot says when it was cut so the assistant can say so too.
 */

import type { StockFundamentals } from '../types/screener';
import type { ScreenerState } from './screenerState';

export interface ScreenerRow {
    symbol: string;
    name: string;
    sector: string | null;
    price: number | null;
    currency: string | null;
    trailingPE: number | null;
    forwardPE: number | null;
    /** Percent, e.g. 3.4 (the store keeps a fraction). */
    dividendYieldPct: number | null;
    priceToBook: number | null;
    marketCap: number | null;
    pinned: boolean;
    alert?: { above?: number; below?: number };
    hasNote: boolean;
    /** The user's note on this stock, clipped to `MAX_NOTE_CHARS`; absent when none or over the budget. */
    note?: string;
    /** Whether fundamentals are loaded; pinned stocks without them appear as bare rows. */
    loaded: boolean;
}

export interface ScreenerSnapshot {
    generatedAt: string;
    index: string;
    loadedCount: number;
    pinnedCount: number;
    alertCount: number;
    /** Rows beyond `MAX_SCREENER_ROWS` that were left out. */
    omitted: number;
    /** Notes that exist but were left out to stay within the notes budget. */
    notesOmitted: number;
    rows: ScreenerRow[];
}

export const MAX_SCREENER_ROWS = 400;
/** One note is clipped to this many characters. */
export const MAX_NOTE_CHARS = 500;
/** All notes together; pinned stocks come first, so they are the last to lose theirs. */
export const MAX_NOTES_TOTAL_CHARS = 40_000;

/** The part of the fundamentals store this needs: loaded entries only. */
export type LoadedFundamentals = ReadonlyMap<string, { status: string; data?: StockFundamentals }>;

const round = (n: number | null, digits = 2): number | null =>
    n == null || !Number.isFinite(n) ? null : Math.round(n * 10 ** digits) / 10 ** digits;

export function buildScreenerSnapshot(
    state: ScreenerState,
    fundamentals: LoadedFundamentals,
    now: Date = new Date(),
): ScreenerSnapshot {
    const pinned = new Set(state.pinned);
    const nameOf = new Map(state.added.map(c => [c.symbol, c] as const));

    const rows: ScreenerRow[] = [];
    const seen = new Set<string>();

    const push = (symbol: string, data: StockFundamentals | null) => {
        seen.add(symbol);
        const alert = state.alerts[symbol];
        rows.push({
            symbol,
            name: data?.name ?? nameOf.get(symbol)?.name ?? symbol,
            sector: data?.sector ?? nameOf.get(symbol)?.sector ?? null,
            price: round(data?.price ?? null, 4),
            currency: data?.currency ?? null,
            trailingPE: round(data?.trailingPE ?? null),
            forwardPE: round(data?.forwardPE ?? null),
            dividendYieldPct: data?.dividendYield == null ? null : round(data.dividendYield * 100),
            priceToBook: round(data?.priceToBook ?? null),
            marketCap: data?.marketCap ?? null,
            pinned: pinned.has(symbol),
            ...(alert && (alert.targetAbove != null || alert.targetBelow != null)
                ? { alert: { above: alert.targetAbove, below: alert.targetBelow } } : {}),
            hasNote: Boolean(state.notes[symbol]?.trim()),
            loaded: data !== null,
        });
    };

    for (const [symbol, entry] of fundamentals) {
        if (entry.status === 'done' && entry.data) push(symbol, entry.data);
    }
    for (const symbol of state.pinned) if (!seen.has(symbol)) push(symbol, null);

    const loadedCount = rows.filter(r => r.loaded).length;
    rows.sort((a, b) =>
        Number(b.pinned) - Number(a.pinned) || (b.marketCap ?? -1) - (a.marketCap ?? -1) || a.symbol.localeCompare(b.symbol));

    // Attach notes in that order until the budget runs out.
    let budget = MAX_NOTES_TOTAL_CHARS;
    let notesOmitted = 0;
    for (const row of rows.slice(0, MAX_SCREENER_ROWS)) {
        const text = state.notes[row.symbol]?.trim();
        if (!text) continue;
        const clipped = text.length > MAX_NOTE_CHARS ? `${text.slice(0, MAX_NOTE_CHARS)}…` : text;
        if (clipped.length > budget) { notesOmitted++; continue; }
        budget -= clipped.length;
        row.note = clipped;
    }

    return {
        generatedAt: now.toISOString().slice(0, 10),
        index: state.index,
        loadedCount,
        pinnedCount: state.pinned.length,
        alertCount: Object.keys(state.alerts).length,
        omitted: Math.max(0, rows.length - MAX_SCREENER_ROWS),
        notesOmitted,
        rows: rows.slice(0, MAX_SCREENER_ROWS),
    };
}

/** Whether there is anything about the screener worth telling the assistant. */
export const screenerHasData = (s: ScreenerSnapshot): boolean => s.rows.length > 0;

const compact = (n: number | null): string =>
    n == null ? 'n/a' : new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(n);

/**
 * The short form that joins the brief: counts, then the pinned stocks. The
 * rest of the loaded universe is left to the `query_screener` tool, so a
 * thousand-row table never rides along on every question.
 */
export function formatScreenerMarkdown(s: ScreenerSnapshot): string {
    const lines: string[] = [];
    lines.push(`# Screener — ${s.index.toUpperCase()}`);
    lines.push('');
    lines.push(
        `Stocks the user is researching, not holdings (unless also in the portfolio). ` +
        `${s.loadedCount} have fundamentals loaded, ${s.pinnedCount} pinned, ${s.alertCount} with price alerts. ` +
        `Use the query_screener tool to filter, rank or look up any of them, including by what the user wrote in their notes.`,
    );
    const pinned = s.rows.filter(r => r.pinned);
    if (pinned.length > 0) {
        lines.push('');
        lines.push('## Pinned');
        lines.push('');
        lines.push('| Symbol | Name | Sector | Price | P/E | Fwd P/E | Yield | P/B | Mkt cap | Alert |');
        lines.push('|---|---|---|---|---|---|---|---|---|---|');
        for (const r of pinned.slice(0, 30)) {
            const alert = r.alert
                ? [r.alert.above != null ? `≥${r.alert.above}` : '', r.alert.below != null ? `≤${r.alert.below}` : ''].filter(Boolean).join(' ')
                : '';
            lines.push(
                `| ${r.symbol} | ${r.name} | ${r.sector ?? ''} | ${r.price ?? 'n/a'} ${r.currency ?? ''} | ${r.trailingPE ?? 'n/a'} | ` +
                `${r.forwardPE ?? 'n/a'} | ${r.dividendYieldPct == null ? 'n/a' : `${r.dividendYieldPct}%`} | ${r.priceToBook ?? 'n/a'} | ${compact(r.marketCap)} | ${alert} |`,
            );
        }
    }
    const noted = pinned.filter(r => r.note);
    if (noted.length > 0) {
        lines.push('');
        lines.push('## Notes on pinned stocks (the user\'s own words)');
        lines.push('');
        for (const r of noted.slice(0, 30)) lines.push(`- ${r.symbol}: ${r.note!.replace(/\s*\n\s*/g, ' ')}`);
    }
    return lines.join('\n');
}
