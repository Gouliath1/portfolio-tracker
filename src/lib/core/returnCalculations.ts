import { PortfolioSummary, Position } from '@portfolio/types';

/**
 * Calculate annualized return for a position
 * @param totalReturn - Total return percentage
 * @param startDate - Transaction date string (YYYY/MM/DD format)
 * @returns Annualized return percentage or null if held less than 1 year
 */
export const calculateAnnualizedReturn = (totalReturn: number, startDate: string): number | null => {
    const start = new Date(startDate);
    const now = new Date();
    const years = (now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24 * 365.25);
    
    if (years < 1) {
        return null; // Return null for positions held less than a year
    }
    
    return (Math.pow(1 + (totalReturn / 100), 1/years) - 1) * 100;
};

/**
 * Calculate portfolio-level weighted annualized return with date information
 * @param summary - Portfolio summary containing positions
 * @returns Object with return percentage and earliest qualifying date, or null if no valid positions
 */
// Simple CAGR since inception using portfolio totals (rough baseline)
export const calculatePortfolioCagrSinceInception = (summary: PortfolioSummary): { return: number; earliestDate: string } | null => {
    if (summary.positions.length === 0) return null;
    const earliestStr = summary.positions.reduce((min, p) => (p.transactionDate < min ? p.transactionDate : min), summary.positions[0].transactionDate);
    const earliest = new Date(earliestStr.replace(/\//g, '-'));
    const now = new Date();
    const years = (now.getTime() - earliest.getTime()) / (1000 * 60 * 60 * 24 * 365.25);
    if (years <= 0) return null;
    if (summary.totalCostJPY <= 0 || summary.totalValueJPY <= 0) return null;
    const ratio = summary.totalValueJPY / summary.totalCostJPY;
    const cagr = (Math.pow(ratio, 1 / years) - 1) * 100;
    return { return: cagr, earliestDate: earliest.toISOString().split('T')[0] };
};

type CF = { date: Date; amount: number };
const parseDate = (s: string) => new Date(s.replace(/\//g, '-'));
const isoDate = (d: Date) => d.toISOString().split('T')[0];

// Solve XIRR for a cash-flow series expressed as { t: years-from-start, a: amount }.
// Newton-Raphson with a bisection fallback over [-99%, +1000%]. Returns the rate
// as a fraction (0.05 = 5%/yr), or null if it can't be bracketed / converged.
function solveXirr(xs: { t: number; a: number }[]): number | null {
    const npv = (r: number) => xs.reduce((s, x) => s + x.a / Math.pow(1 + r, x.t), 0);
    const dnpv = (r: number) => xs.reduce((s, x) => s - (x.t * x.a) / Math.pow(1 + r, x.t + 1), 0);

    let rate = 0.1; // 10% initial guess
    let ok = false;
    for (let i = 0; i < 50; i++) {
        const f = npv(rate);
        const fp = dnpv(rate);
        if (!isFinite(fp) || Math.abs(fp) < 1e-12) break;
        const next = rate - f / fp;
        if (!isFinite(next)) break;
        if (Math.abs(next - rate) < 1e-8) { rate = next; ok = true; break; }
        rate = next;
    }

    if (!ok || rate <= -0.9999 || !isFinite(rate)) {
        let lo = -0.99, hi = 10.0;
        let fLo = npv(lo); const fHi = npv(hi);
        if (Math.sign(fLo) === Math.sign(fHi)) return null; // not bracketed
        for (let i = 0; i < 80; i++) {
            const mid = (lo + hi) / 2;
            const fMid = npv(mid);
            if (Math.abs(fMid) < 1e-9) { rate = mid; ok = true; break; }
            if (Math.sign(fMid) === Math.sign(fLo)) { lo = mid; fLo = fMid; } else { hi = mid; }
        }
        if (!ok) rate = (lo + hi) / 2;
    }

    return isFinite(rate) && rate > -0.9999 ? rate : null;
}

// Build the portfolio's external investment cash flows (everything except
// today's terminal value): buys as outflows on their transaction dates, sells
// as inflows on their sale dates, dividends as inflows on their ex-dates.
// Placing each flow on its own date matters — lumping dividends at one date
// understates how soon income arrived. Shared by the portfolio XIRR and the
// benchmark replay so both see an identical external cash-flow schedule.
function buildInvestmentCashflows(summary: PortfolioSummary): { cashflows: CF[]; earliest: Date } | null {
    const cashflows: CF[] = [];
    let earliest: Date | null = null;
    const noteEarliest = (d: Date) => { if (!earliest || d < earliest) earliest = d; };

    // Buys: every lot (open or closed) starts with a negative cash flow.
    for (const p of [...summary.positions, ...summary.closedPositions]) {
        if (!p.transactionDate || !isFinite(p.costInJPY)) continue;
        const dt = parseDate(p.transactionDate);
        if (!isFinite(dt.getTime())) continue;
        cashflows.push({ date: dt, amount: -p.costInJPY });
        noteEarliest(dt);
    }

    // Sells: each closed lot has proceeds returned on its sale date. Without
    // this, closed positions look like buys that vanished — XIRR would treat
    // them as a 100% loss.
    for (const p of summary.closedPositions) {
        if (!p.saleDate || p.proceedsJPY === undefined || !isFinite(p.proceedsJPY)) continue;
        const dt = parseDate(p.saleDate);
        if (!isFinite(dt.getTime())) continue;
        cashflows.push({ date: dt, amount: p.proceedsJPY });
    }

    // Dividends: each per-event amount lands as a positive cash flow on its ex-date.
    for (const p of [...summary.positions, ...summary.closedPositions]) {
        if (!p.dividendEvents) continue;
        for (const ev of p.dividendEvents) {
            if (!isFinite(ev.amountInBase) || ev.amountInBase === 0) continue;
            const dt = parseDate(ev.exDate);
            if (!isFinite(dt.getTime())) continue;
            cashflows.push({ date: dt, amount: ev.amountInBase });
        }
    }

    if (!earliest) return null;
    return { cashflows, earliest };
}

// Money-weighted return (XIRR). Buys are outflows, sells and dividends are
// inflows on their dates, and today's open-position value is the terminal
// inflow; solves for the rate that makes NPV = 0.
export const calculatePortfolioAnnualizedReturn = (summary: PortfolioSummary): { return: number; earliestDate: string } | null => {
    if (summary.positions.length === 0 && summary.closedPositions.length === 0) return null;

    const built = buildInvestmentCashflows(summary);
    if (!built) return null;
    const { cashflows, earliest } = built;

    // Terminal value (open positions only — closed lots already settled).
    const today = new Date();
    const all = [...cashflows, { date: today, amount: summary.totalValueJPY }];

    // Guard: if all costs are zero or total value is zero.
    const totalOut = all.filter(c => c.amount < 0).reduce((s, c) => s + Math.abs(c.amount), 0);
    if (totalOut === 0 || summary.totalValueJPY <= 0) return null;

    const toYears = (d: Date) => (d.getTime() - earliest.getTime()) / (1000 * 60 * 60 * 24 * 365.25);
    const rate = solveXirr(all.map(c => ({ t: toYears(c.date), a: c.amount })));

    // Fall back to the cost-weighted average if XIRR can't be bracketed.
    const annualPct = rate === null ? calculateWeightedAverageFallback(summary) : rate * 100;
    return { return: annualPct, earliestDate: isoDate(earliest) };
};

// Money-weighted benchmark: replay the portfolio's exact external cash flows
// into a single index instead of the actual holdings, then solve the index's
// XIRR. Each buy purchases index units with the same money on the same day;
// each sell/dividend redeems units worth the same amount. The only thing that
// differs from the portfolio is the terminal value — the remaining index units
// marked at today's price — so the gap between the two XIRRs isolates how the
// index would have done given *your* contribution timing.
//
// `indexPriceBaseOn(YYYY-MM-DD)` returns the index price converted to the
// portfolio's base currency on (or just before) that date, or null if unknown.
// Any missing price aborts the replay (returns null) rather than guessing.
export const calculateBenchmarkReplayXirr = (
    summary: PortfolioSummary,
    indexPriceBaseOn: (date: string) => number | null,
): { return: number } | null => {
    const built = buildInvestmentCashflows(summary);
    if (!built) return null;
    const { cashflows, earliest } = built;

    // Accumulate index units: buys (amount<0) add units, sells/dividends
    // (amount>0) redeem units, all at that day's index price.
    let units = 0;
    for (const cf of cashflows) {
        const price = indexPriceBaseOn(isoDate(cf.date));
        if (price === null || !isFinite(price) || price <= 0) return null;
        units += -cf.amount / price;
    }

    const today = new Date();
    const priceToday = indexPriceBaseOn(isoDate(today));
    if (priceToday === null || !isFinite(priceToday) || priceToday <= 0) return null;
    const terminal = units * priceToday;

    const all = [...cashflows, { date: today, amount: terminal }];
    const totalOut = all.filter(c => c.amount < 0).reduce((s, c) => s + Math.abs(c.amount), 0);
    if (totalOut === 0 || terminal <= 0) return null;

    const toYears = (d: Date) => (d.getTime() - earliest.getTime()) / (1000 * 60 * 60 * 24 * 365.25);
    const rate = solveXirr(all.map(c => ({ t: toYears(c.date), a: c.amount })));
    return rate === null ? null : { return: rate * 100 };
};

// Previous approximation: cost-weighted average of per-position annualized returns (>1y).
// Keep as a fallback if XIRR fails to converge.
function calculateWeightedAverageFallback(summary: PortfolioSummary): number {
    let totalWeightedReturn = 0;
    let totalValidCost = 0;
    for (const position of summary.positions) {
        const ann = calculateAnnualizedReturn(position.pnlPercentage, position.transactionDate);
        if (ann !== null && position.currentPrice !== null) {
            const weight = position.costInJPY;
            totalWeightedReturn += ann * weight;
            totalValidCost += weight;
        }
    }
    return totalValidCost > 0 ? totalWeightedReturn / totalValidCost : 0;
}

// Per-position XIRR: buy as outflow, dividends at their dates, then terminal value
// (current price for open lots, sale proceeds for closed lots).
export const calculatePositionXirr = (position: Position): number | null => {
    if (!position.transactionDate || !isFinite(position.costInJPY) || position.costInJPY <= 0) return null;

    const cashflows: CF[] = [];

    const buyDate = parseDate(position.transactionDate);
    if (!isFinite(buyDate.getTime())) return null;
    cashflows.push({ date: buyDate, amount: -position.costInJPY });

    if (position.dividendEvents) {
        for (const ev of position.dividendEvents) {
            if (!isFinite(ev.amountInBase) || ev.amountInBase === 0) continue;
            const dt = parseDate(ev.exDate);
            if (!isFinite(dt.getTime())) continue;
            cashflows.push({ date: dt, amount: ev.amountInBase });
        }
    }

    if (position.status === 'closed') {
        if (!position.saleDate || position.proceedsJPY === undefined || !isFinite(position.proceedsJPY)) return null;
        const saleDate = parseDate(position.saleDate);
        if (!isFinite(saleDate.getTime())) return null;
        cashflows.push({ date: saleDate, amount: position.proceedsJPY });
    } else {
        if (position.currentPrice === null || !isFinite(position.currentValueJPY) || position.currentValueJPY <= 0) return null;
        cashflows.push({ date: new Date(), amount: position.currentValueJPY });
    }

    if (cashflows.length < 2) return null;

    const earliest = cashflows.reduce((min, cf) => cf.date < min ? cf.date : min, cashflows[0].date);
    const toYears = (d: Date) => (d.getTime() - earliest.getTime()) / (1000 * 60 * 60 * 24 * 365.25);
    const rate = solveXirr(cashflows.map(cf => ({ t: toYears(cf.date), a: cf.amount })));
    return rate === null ? null : rate * 100;
};
