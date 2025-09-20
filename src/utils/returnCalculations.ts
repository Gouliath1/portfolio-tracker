import { PortfolioSummary } from '../types/portfolio';

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

// Money-weighted return (XIRR). Kept for reference/alternative metric.
export const calculatePortfolioAnnualizedReturn = (summary: PortfolioSummary): { return: number; earliestDate: string } | null => {
    if (summary.positions.length === 0) return null;

    // Build cash flows: negative outflows on each transaction date, positive inflow for current total value today
    type CF = { date: Date; amount: number };
    const cashflows: CF[] = [];
    let earliest: Date | null = null;

    for (const p of summary.positions) {
        if (!p.transactionDate || !isFinite(p.costInJPY)) continue;
        const dt = new Date(p.transactionDate.replace(/\//g, '-'));
        if (!isFinite(dt.getTime())) continue;
        cashflows.push({ date: dt, amount: -p.costInJPY });
        if (!earliest || dt < earliest) earliest = dt;
    }

    if (!earliest) return null;

    // Add terminal value as a positive cash flow today
    const today = new Date();
    cashflows.push({ date: today, amount: summary.totalValueJPY });

    // Convert dates to year fractions from earliest
    const toYears = (d: Date) => (d.getTime() - earliest!.getTime()) / (1000 * 60 * 60 * 24 * 365.25);

    const xs = cashflows.map(cf => ({ t: toYears(cf.date), a: cf.amount }));

    // Guard: if all costs are zero or total value is zero
    const totalOut = xs.filter(x => x.a < 0).reduce((s, x) => s + Math.abs(x.a), 0);
    if (totalOut === 0 || summary.totalValueJPY <= 0) return null;

    // XIRR via Newton-Raphson with fallback bisection
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
        // Fallback: search in [-99%, 1000%]
        let lo = -0.99, hi = 10.0; // -99% to 1000%
        let fLo = npv(lo), fHi = npv(hi);
        if (Math.sign(fLo) === Math.sign(fHi)) {
            // Give up if not bracketed
            return {
                return: calculateWeightedAverageFallback(summary),
                earliestDate: earliest.toISOString().split('T')[0]
            };
        }
        for (let i = 0; i < 80; i++) {
            const mid = (lo + hi) / 2;
            const fMid = npv(mid);
            if (Math.abs(fMid) < 1e-9) { rate = mid; ok = true; break; }
            if (Math.sign(fMid) === Math.sign(fLo)) { lo = mid; fLo = fMid; } else { hi = mid; fHi = fMid; }
        }
        if (!ok) rate = (lo + hi) / 2;
    }

    const annualPct = rate * 100;
    return {
        return: annualPct,
        earliestDate: earliest.toISOString().split('T')[0]
    };
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
