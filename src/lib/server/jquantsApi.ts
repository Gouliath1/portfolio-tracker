/**
 * J-Quants API v2 — official JPX (Japan Exchange Group) financial data.
 *
 * Uses /v2/fins/summary to get trailing EPS, BPS, and dividend per share for any
 * TSE-listed stock, then computes PE/PB/yield from the current price (tier-1 price
 * from Yahoo chart, passed in as `currentPrice`). This avoids any crumb dependency
 * and works entirely within the J-Quants free plan coverage window.
 *
 * Auth: API key from J-Quants dashboard, sent as x-api-key header. No token
 * exchange needed — the key is used directly.
 *
 * Symbol mapping: Yahoo "7203.T" → J-Quants code "72030" (4-char TSE code + "0"
 * for the common share class). Alphanumeric new-format codes work the same way
 * ("285A.T" → "285A0").
 *
 * Free plan coverage (as of 2026-06): data through approx. 2026-04-01.
 * Most Japanese companies have a March 31 fiscal year end; their FY annual results
 * are disclosed in May, so the free plan includes FY2025 annual EPS/BPS for the
 * majority of TOPIX constituents — recent enough for screening purposes.
 */

import type { RatioInfo } from './marketDataDb';

const BASE = 'https://api.jquants.com/v2';

function num(v: unknown): number | null {
    if (v == null || v === '' || v === '-') return null;
    const n = Number(v);
    return isFinite(n) ? n : null;
}

function div(a: number | null, b: number | null): number | null {
    if (a == null || b == null || b === 0) return null;
    return a / b;
}

// Yahoo ".T" → J-Quants 5-character code (TSE code + share-class suffix "0").
function toCode(yahooSymbol: string): string {
    const base = yahooSymbol.toUpperCase().endsWith('.T')
        ? yahooSymbol.slice(0, -2)
        : yahooSymbol;
    return base + '0';
}

function apiKey(): string {
    const k = process.env.JQUANTS_API_KEY;
    if (k) return k;
    throw new Error('JQUANTS_API_KEY not set');
}

interface FinsSummaryRow {
    DiscDate?: string;
    CurPerType?: string;
    CurPerEn?: string;
    EPS?: string | number;
    BPS?: string | number;
    DivAnn?: string | number;
    Div2Q?: string | number;
    DivFY?: string | number;
    NxFEPS?: string | number;
    NxFDivAnn?: string | number;
    NxFDiv2Q?: string | number;
    NxFDivFY?: string | number;
    ShOutFY?: string | number; // shares outstanding at fiscal year end
    AvgSh?: string | number;   // weighted average shares (fallback)
}

/** Annual dividend per share: prefer explicit DivAnn, fall back to H1 + year-end parts. */
function annualDiv(row: FinsSummaryRow): number | null {
    const explicit = num(row.DivAnn);
    if (explicit != null) return explicit;
    const h1 = num(row.Div2Q);
    const fy = num(row.DivFY);
    if (h1 != null && fy != null) return h1 + fy;
    if (h1 != null) return h1;
    return null;
}

export async function fetchJQuantsRatios(
    yahooSymbol: string,
    /** Current price from tier-1 (Yahoo chart). Used to compute PE/PB/yield. */
    currentPrice: number | null,
): Promise<RatioInfo> {
    const code = toCode(yahooSymbol);
    const key = apiKey();

    const res = await fetch(`${BASE}/fins/summary?code=${encodeURIComponent(code)}`, {
        headers: { 'x-api-key': key },
        signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) throw new Error(`J-Quants fins/summary HTTP ${res.status}`);
    const data = await res.json();

    const rows: FinsSummaryRow[] = data?.data ?? [];
    if (!rows.length) throw new Error(`J-Quants: no fins/summary data for ${yahooSymbol}`);

    // Find the most recent annual (full-year) disclosure — this has both EPS and BPS.
    // Sort descending by disclosure date, then take the first FY entry.
    const annualRows = rows
        .filter(r => r.CurPerType === 'FY' && r.EPS && r.BPS)
        .sort((a, b) => (b.DiscDate ?? '').localeCompare(a.DiscDate ?? ''));
    const annual = annualRows[0];

    if (!annual) throw new Error(`J-Quants: no annual disclosure found for ${yahooSymbol}`);

    const eps = num(annual.EPS);
    const bps = num(annual.BPS);
    const fwdEps = num(annual.NxFEPS);

    // Dividend: prefer the actual paid dividend from the latest annual disclosure.
    const divPerShare = annualDiv(annual);

    // Trailing-twelve-months EPS: FY_annual + (9M_current − 9M_prior).
    // This is the same method Yahoo uses for TTM PE (sum of last 4 standalone
    // quarters), avoiding the distortion of simple annualisation.
    //
    // Example for a March-FY company as of December 2025:
    //   TTM = FY2025 + (3Q_FY2026 − 3Q_FY2025)
    //       = Q4_FY2025 + Q1_FY2026 + Q2_FY2026 + Q3_FY2026  ← exactly the last 4Q
    //
    // Limit: data only through ~2026-04-01 on the free plan, so the most recent Q4
    // (announced April 2026) is missing; PE will differ from Yahoo by one quarter.
    const annualDiscDate = annual.DiscDate ?? '';
    const q3Rows = rows
        .filter(r => r.CurPerType === '3Q' && r.EPS != null && r.EPS !== '')
        .sort((a, b) => (a.DiscDate ?? '').localeCompare(b.DiscDate ?? ''));
    // Current 3Q = most recent row disclosed AFTER the annual report.
    const q3Current = [...q3Rows].reverse().find(r => (r.DiscDate ?? '') > annualDiscDate);
    // Prior 3Q   = most recent row disclosed BEFORE the annual report.
    const q3Prior   = [...q3Rows].reverse().find(r => (r.DiscDate ?? '') < annualDiscDate);

    let trailingEps = eps;
    if (eps != null && q3Current && q3Prior) {
        const curr = num(q3Current.EPS);
        const prior = num(q3Prior.EPS);
        if (curr != null && prior != null) trailingEps = eps + (curr - prior);
    } else if (eps == null && q3Current) {
        // No annual EPS yet (empty preliminary filing) — annualise the latest 3Q.
        const qtly = num(q3Current.EPS);
        if (qtly != null) trailingEps = qtly * (4 / 3);
    }

    const price = currentPrice;

    // Negative EPS → PE is not meaningful for screening; return null.
    const tpe = div(price, trailingEps);
    const fpe = div(price, fwdEps);

    return {
        trailingPE:   tpe != null && tpe > 0 ? tpe : null,
        forwardPE:    fpe != null && fpe > 0 ? fpe : null,
        priceToBook:  div(price, bps),
        dividendYield: divPerShare != null && price != null && price > 0
            ? divPerShare / price
            : null,
        marketCap: (() => {
            // ShOutFY is present in both annual and quarterly rows; use whichever
            // has a value (quarterly rows often have the most recent share count).
            const latestWithShares = [...rows]
                .reverse()
                .find(r => num(r.ShOutFY) != null || num(r.AvgSh) != null);
            const shares = latestWithShares
                ? (num(latestWithShares.ShOutFY) ?? num(latestWithShares.AvgSh))
                : null;
            return shares != null && price != null ? shares * price : null;
        })(),
    };
}
