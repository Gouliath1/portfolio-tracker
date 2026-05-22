import { Position, RawPosition, PortfolioSummary, Currency } from '@portfolio/types';
import { fetchStockPrice, updateAllPositions, fetchCurrentFxRate, fetchHistoricalFxRates, fetchHistoricalDividends, type DividendEventRow } from './yahooFinanceApi';

// Preloaded FX rates for a whole portfolio. When present, calculatePosition uses
// these instead of making its own network calls — collapses N positions × ~2
// round-trips into M (unique pairs) parallel fetches batched up front.
export type FxLookup = {
    historical: Map<string, Map<string, number>>; // pair → date (YYYY-MM-DD) → rate
    current: Map<string, number>;                 // pair → rate
};

// Preloaded dividend events for a whole portfolio. ticker → ex-date → row.
// Same batching motivation as FxLookup: one fetch per ticker, not per lot.
export type DividendLookup = Map<string, Map<string, DividendEventRow>>;

// Forward-fill: latest cached date <= target. Mirrors the server-side fallback
// in /api/historical-fx-rates so a transaction on a weekend/holiday still maps
// to the previous business day's rate.
export function forwardFillLookup(map: Map<string, number>, target: string): number | null {
    const exact = map.get(target);
    if (exact !== undefined) return exact;
    let bestKey: string | null = null;
    for (const k of map.keys()) {
        if (k <= target && (bestKey === null || k > bestKey)) bestKey = k;
    }
    return bestKey !== null ? map.get(bestKey)! : null;
}

function lookupHistorical(map: Map<string, number>, date: string): number | null {
    return forwardFillLookup(map, date);
}

async function getHistoricalFxRate(fxPair: string, date: string, lookup?: FxLookup): Promise<number> {
    const pre = lookup?.historical.get(fxPair);
    if (pre) {
        const r = lookupHistorical(pre, date);
        if (r !== null) return r;
    }

    const rates = await fetchHistoricalFxRates(fxPair, [date]);
    if (rates && rates[date]) {
        return rates[date];
    }

    console.warn(`Historical FX rate not available for ${fxPair} on ${date}, using current rate`);
    const currentRate = lookup?.current.get(fxPair) ?? await fetchCurrentFxRate(fxPair);
    if (currentRate === null || currentRate === undefined) {
        console.error(`No FX rate available for ${fxPair} on ${date} — falling back to 1`);
    }
    return currentRate ?? 1;
}

async function getCurrentFxRate(fxPair: string, lookup?: FxLookup): Promise<number> {
    const pre = lookup?.current.get(fxPair);
    if (pre !== undefined) return pre;
    const rate = await fetchCurrentFxRate(fxPair);
    return rate ?? 1;
}

async function convertCurrency(
    amount: number,
    fromCcy: string,
    toCcy: string,
    isHistorical: boolean = false,
    transactionDate?: string,
    lookup?: FxLookup,
): Promise<{ convertedAmount: number, fxRate: number }> {
    if (fromCcy === toCcy) {
        return { convertedAmount: amount, fxRate: 1 };
    }

    const fxPair = `${fromCcy}${toCcy}`;
    let fxRate: number;

    if (isHistorical && transactionDate) {
        const dateFormatted = transactionDate.replace(/\//g, '-');
        fxRate = await getHistoricalFxRate(fxPair, dateFormatted, lookup);
    } else {
        fxRate = await getCurrentFxRate(fxPair, lookup);
    }

    return {
        convertedAmount: amount * fxRate,
        fxRate
    };
}

// Sum dividend income for a single lot, in base currency, and return the
// per-event breakdown sorted by ex-date.
//
// Window: ex-dates strictly after `transactionDate` (you only earn the
// dividend if you held on the ex-date) and on/before `saleDate ?? today`.
// Each event is FX-converted at its ex-date using the preloaded historical
// lookup; missing ex-dates fall through to forward-fill, matching the same
// behavior used for cost-basis FX.
//
// The per-event list lets XIRR place each dividend as a cash inflow on its
// actual ex-date rather than a single lumped amount.
function sumDividendsForLot(
    rawPosition: RawPosition,
    baseCurrency: string,
    dividendLookup: DividendLookup | undefined,
    fxLookup: FxLookup | undefined,
): { total: number; events: { exDate: string; amountInBase: number }[] } {
    if (!dividendLookup) return { total: 0, events: [] };
    const dividends = dividendLookup.get(String(rawPosition.ticker));
    if (!dividends || dividends.size === 0) return { total: 0, events: [] };

    const startExclusive = rawPosition.transactionDate.replace(/\//g, '-');
    const endInclusive = (rawPosition.saleDate ?? new Date().toISOString().split('T')[0]).replace(/\//g, '-');

    let total = 0;
    const events: { exDate: string; amountInBase: number }[] = [];
    for (const [exDate, ev] of dividends) {
        if (exDate <= startExclusive) continue;
        if (exDate > endInclusive) continue;

        const grossInDivCcy = ev.amount * rawPosition.quantity;
        let amountInBase: number | null = null;
        if (ev.currency === baseCurrency) {
            amountInBase = grossInDivCcy;
        } else {
            const fxPair = `${ev.currency}${baseCurrency}`;
            const histMap = fxLookup?.historical.get(fxPair);
            const fxRate = histMap ? lookupHistorical(histMap, exDate) : null;
            if (fxRate !== null && fxRate !== undefined) {
                amountInBase = grossInDivCcy * fxRate;
            } else {
                // Last-resort: try the current rate, otherwise drop the event with a
                // warning rather than poisoning the total with a 1:1 fallback.
                const cur = fxLookup?.current.get(fxPair);
                if (cur !== undefined) {
                    amountInBase = grossInDivCcy * cur;
                } else {
                    console.warn(`[dividend] no FX rate for ${fxPair} on ${exDate}; skipping ${rawPosition.ticker} dividend`);
                }
            }
        }
        if (amountInBase !== null) {
            total += amountInBase;
            events.push({ exDate, amountInBase });
        }
    }
    events.sort((a, b) => a.exDate.localeCompare(b.exDate));
    return { total, events };
}

// Build one dividend lookup for the whole portfolio: one fetch per unique
// ticker, run in parallel. Mirrors preloadFxRates so calculatePosition can
// stay synchronous on the dividend path.
export async function preloadDividendEvents(rawPositions: RawPosition[]): Promise<DividendLookup> {
    const lookup: DividendLookup = new Map();
    const tickers = [...new Set(rawPositions.map(p => String(p.ticker)))];
    if (tickers.length === 0) return lookup;

    // fetchHistoricalDividends takes the position list to derive the date
    // range, so pass the full set for each ticker.
    await Promise.all(tickers.map(async ticker => {
        const events = await fetchHistoricalDividends(ticker, rawPositions);
        if (events && Object.keys(events).length > 0) {
            const map = new Map<string, DividendEventRow>();
            for (const [date, ev] of Object.entries(events)) map.set(date, ev);
            lookup.set(ticker, map);
        } else {
            lookup.set(ticker, new Map());
        }
    }));

    return lookup;
}

// Add ex-dates that aren't on the existing FX preload. Dividends pay on
// arbitrary calendar days unrelated to transaction or sale dates, so the
// FX preload built from transactions alone won't cover them. Backfilling
// via the historical FX route fills any gap.
async function ensureFxForDividendDates(
    fxLookup: FxLookup,
    dividendLookup: DividendLookup,
    rawPositions: RawPosition[],
    baseCurrency: string,
): Promise<void> {
    const tickerCcy = new Map<string, Currency>();
    for (const p of rawPositions) {
        if (!tickerCcy.has(String(p.ticker))) tickerCcy.set(String(p.ticker), p.stockCcy);
    }

    const missingByPair = new Map<string, Set<string>>();
    for (const [ticker, events] of dividendLookup) {
        if (events.size === 0) continue;
        const ccy = tickerCcy.get(ticker);
        if (!ccy || ccy === baseCurrency) continue;
        const pair = `${ccy}${baseCurrency}`;
        const existing = fxLookup.historical.get(pair);
        const missing = missingByPair.get(pair) ?? new Set<string>();
        for (const exDate of events.keys()) {
            if (!existing || lookupHistorical(existing, exDate) === null) {
                missing.add(exDate);
            }
        }
        if (missing.size > 0) missingByPair.set(pair, missing);
    }

    if (missingByPair.size === 0) return;

    await Promise.all([...missingByPair.entries()].map(async ([pair, dates]) => {
        const rates = await fetchHistoricalFxRates(pair, [...dates]);
        if (!rates) return;
        const map = fxLookup.historical.get(pair) ?? new Map<string, number>();
        for (const [d, r] of Object.entries(rates)) map.set(d, r);
        fxLookup.historical.set(pair, map);
    }));
}

// Build one FX lookup for the whole portfolio: one historical fetch per pair
// (covers every transaction/sale date) and one current fetch per pair (covers
// every open lot). Parallelized across pairs.
export async function preloadFxRates(rawPositions: RawPosition[], baseCurrency: string): Promise<FxLookup> {
    const historicalDates = new Map<string, Set<string>>();
    const currentPairs = new Set<string>();

    for (const p of rawPositions) {
        if (p.transactionCcy && p.transactionCcy !== baseCurrency && p.transactionDate) {
            const pair = `${p.transactionCcy}${baseCurrency}`;
            const date = p.transactionDate.replace(/\//g, '-');
            if (!historicalDates.has(pair)) historicalDates.set(pair, new Set());
            historicalDates.get(pair)!.add(date);
        }
        if (p.saleDate) {
            const saleCcy = p.saleCcy ?? p.stockCcy;
            if (saleCcy && saleCcy !== baseCurrency) {
                const pair = `${saleCcy}${baseCurrency}`;
                const date = p.saleDate.replace(/\//g, '-');
                if (!historicalDates.has(pair)) historicalDates.set(pair, new Set());
                historicalDates.get(pair)!.add(date);
            }
        } else if (p.stockCcy && p.stockCcy !== baseCurrency) {
            currentPairs.add(`${p.stockCcy}${baseCurrency}`);
        }
    }

    const historical = new Map<string, Map<string, number>>();
    const current = new Map<string, number>();

    await Promise.all([
        ...[...historicalDates.entries()].map(async ([pair, dates]) => {
            const rates = await fetchHistoricalFxRates(pair, [...dates]);
            const map = new Map<string, number>();
            for (const [d, r] of Object.entries(rates ?? {})) map.set(d, r);
            historical.set(pair, map);
        }),
        ...[...currentPairs].map(async pair => {
            const rate = await fetchCurrentFxRate(pair);
            if (rate !== null) current.set(pair, rate);
        }),
    ]);

    return { historical, current };
}

export const calculatePosition = async (rawPosition: RawPosition, currentPrice: number | null, baseCurrency: string = 'JPY', fxLookup?: FxLookup, dividendLookup?: DividendLookup): Promise<Position> => {
    const isClosed = !!rawPosition.saleDate;

    // 1. Calculate original FX rate (only if transaction was not in base currency)
    let origFxRate = 1;
    let costPerUnitInBase = rawPosition.costPerUnit;

    if (rawPosition.transactionCcy !== baseCurrency) {
        const conversion = await convertCurrency(
            rawPosition.costPerUnit,
            rawPosition.transactionCcy,
            baseCurrency,
            true, // historical
            rawPosition.transactionDate,
            fxLookup,
        );
        costPerUnitInBase = conversion.convertedAmount;
        origFxRate = conversion.fxRate;
    }

    // 2. Calculate cost in base currency
    const costInBase = costPerUnitInBase * rawPosition.quantity;

    // 3a. Closed lot: compute realized P&L using historical FX at sale date.
    if (isClosed) {
        const saleCcy = rawPosition.saleCcy ?? rawPosition.stockCcy;
        const salePricePerUnit = rawPosition.salePricePerUnit ?? 0;
        let salePricePerUnitInBase = salePricePerUnit;
        let saleFxRate = 1;
        if (saleCcy !== baseCurrency) {
            const conversion = await convertCurrency(
                salePricePerUnit,
                saleCcy,
                baseCurrency,
                true, // historical
                rawPosition.saleDate,
                fxLookup,
            );
            salePricePerUnitInBase = conversion.convertedAmount;
            saleFxRate = conversion.fxRate;
        }
        const proceedsInBase = salePricePerUnitInBase * rawPosition.quantity;
        const { total: dividendIncomeBase, events: dividendEvents } = sumDividendsForLot(rawPosition, baseCurrency, dividendLookup, fxLookup);

        // Realized P&L includes dividends earned while the lot was held —
        // for a closed position the cash you actually pocketed is proceeds
        // plus dividends, minus original cost.
        const realizedPnl = proceedsInBase + dividendIncomeBase - costInBase;
        const realizedPnlPercentage = costInBase === 0 ? 0 : (realizedPnl / costInBase) * 100;
        // Total return % is the same number for closed lots — kept here so
        // the field is populated consistently across open + closed.
        const totalReturnPercentage = realizedPnlPercentage;

        return {
            ...rawPosition,
            status: 'closed',
            currentPrice: null,
            costInJPY: costInBase,
            currentValueJPY: 0,
            pnlJPY: 0,
            pnlPercentage: 0,
            transactionFxRate: origFxRate,
            currentFxRate: 1,
            dividendIncomeJPY: dividendIncomeBase,
            dividendEvents,
            totalReturnPercentage,
            proceedsJPY: proceedsInBase,
            realizedPnlJPY: realizedPnl,
            realizedPnlPercentage,
            saleFxRate,
        };
    }

    // 3b. Open lot: current value and FX rate
    let currentValueInBase = 0;
    let currentFxRate = 1;

    if (currentPrice !== null) {
        if (rawPosition.stockCcy !== baseCurrency) {
            const valueConversion = await convertCurrency(
                rawPosition.quantity * currentPrice,
                rawPosition.stockCcy,
                baseCurrency,
                false, // current rates
                undefined,
                fxLookup,
            );
            currentValueInBase = valueConversion.convertedAmount;
            currentFxRate = valueConversion.fxRate;
        } else {
            currentValueInBase = rawPosition.quantity * currentPrice;
            currentFxRate = 1;
        }
    }

    const pnlInBase = currentPrice !== null ? currentValueInBase - costInBase : 0;
    const pnlPercentage = currentPrice !== null && costInBase !== 0
        ? (pnlInBase / costInBase) * 100
        : 0;

    const { total: dividendIncomeBase, events: dividendEvents } = sumDividendsForLot(rawPosition, baseCurrency, dividendLookup, fxLookup);
    const totalReturnPercentage = currentPrice !== null && costInBase !== 0
        ? ((currentValueInBase + dividendIncomeBase - costInBase) / costInBase) * 100
        : pnlPercentage;

    return {
        ...rawPosition,
        status: 'open',
        currentPrice,
        costInJPY: costInBase,
        currentValueJPY: currentValueInBase,
        pnlJPY: pnlInBase,
        pnlPercentage,
        transactionFxRate: origFxRate,
        currentFxRate,
        dividendIncomeJPY: dividendIncomeBase,
        dividendEvents,
        totalReturnPercentage,
    };
};

export const calculatePortfolioSummary = async (rawPositions: RawPosition[], forceRefresh: boolean = false, baseCurrency: string = 'JPY'): Promise<PortfolioSummary> => {
    // Timing logs are dev-only — they help diagnose regressions during local
    // work but are noise in production.
    const isDev = typeof process !== 'undefined' && process.env.NODE_ENV !== 'production';
    const t0 = performance.now();
    const log = (label: string, since = t0) => { if (isDev) console.log(`[pnl] ${label}: ${Math.round(performance.now() - since)}ms`); };

    // Only fetch live prices for tickers that have at least one open lot.
    const openTickers = [...new Set(rawPositions.filter(p => !p.saleDate).map(pos => pos.ticker.toString()))];
    if (isDev) console.log(`[pnl] start: ${rawPositions.length} positions, ${openTickers.length} open tickers, forceRefresh=${forceRefresh}`);

    let currentPrices: { [key: string]: number | null } = {};

    // Run price loading and FX preloading in parallel — they're independent.
    // Preloading FX once per pair (instead of once per position) collapses
    // N positions × ~2 HTTP round-trips into M (unique pairs) parallel fetches.
    const pricesPromise: Promise<{ [key: string]: number | null }> = forceRefresh
        ? (async () => {
            const tp = performance.now();
            const prices = await updateAllPositions(openTickers);
            // Also refresh current FX rates so they don't stay stale on Refresh.
            const openPairs = [...new Set(
                rawPositions
                    .filter(p => !p.saleDate && p.stockCcy !== baseCurrency)
                    .map(p => `${p.stockCcy}${baseCurrency}`)
            )];
            await Promise.all(openPairs.map(pair => fetchCurrentFxRate(pair, true)));
            log('prices+currentFx (refresh)', tp);
            return prices;
        })()
        : (async () => {
            const tp = performance.now();
            const entries = await Promise.all(
                openTickers.map(async ticker => [ticker, await fetchStockPrice(ticker, false)] as const)
            );
            log('prices (cached)', tp);
            return Object.fromEntries(entries);
        })();

    const fxPromise = (async () => {
        const tf = performance.now();
        const lookup = await preloadFxRates(rawPositions, baseCurrency);
        log(`fx preload (hist pairs=${lookup.historical.size}, current pairs=${lookup.current.size})`, tf);
        return lookup;
    })();

    const dividendPromise = (async () => {
        const td = performance.now();
        const lookup = await preloadDividendEvents(rawPositions);
        const totalEvents = [...lookup.values()].reduce((s, m) => s + m.size, 0);
        log(`dividend preload (tickers=${lookup.size}, events=${totalEvents})`, td);
        return lookup;
    })();

    const [resolvedPrices, fxLookup, dividendLookup] = await Promise.all([pricesPromise, fxPromise, dividendPromise]);
    currentPrices = resolvedPrices;
    log('prices+fx+dividends (parallel)');

    // Dividend ex-dates rarely line up with transaction dates, so the FX
    // preload (built from positions) won't have rates for them. Backfill
    // before per-position calc so sumDividendsForLot can convert in-process.
    const tef = performance.now();
    await ensureFxForDividendDates(fxLookup, dividendLookup, rawPositions, baseCurrency);
    log('fx backfill for dividend dates', tef);

    const tpos = performance.now();
    const positionPromises = rawPositions.map(pos =>
        calculatePosition(pos, pos.saleDate ? null : currentPrices[pos.ticker.toString()] ?? null, baseCurrency, fxLookup, dividendLookup)
    );
    const allPositions = await Promise.all(positionPromises);
    log('per-position calc', tpos);
    log('TOTAL');

    const positions = allPositions.filter(p => p.status === 'open');
    const closedPositions = allPositions.filter(p => p.status === 'closed');

    const totalCostInBase = positions.reduce((sum, pos) => sum + pos.costInJPY, 0);
    const totalValueInBase = positions.reduce((sum, pos) => sum + pos.currentValueJPY, 0);
    const totalPnlInBase = totalValueInBase - totalCostInBase;
    const totalPnlPercentage = totalCostInBase === 0
        ? 0
        : (totalPnlInBase / totalCostInBase) * 100;

    const realizedCostInBase = closedPositions.reduce((sum, pos) => sum + pos.costInJPY, 0);
    const realizedPnlInBase = closedPositions.reduce((sum, pos) => sum + (pos.realizedPnlJPY ?? 0), 0);
    const realizedPnlPercentage = realizedCostInBase === 0
        ? 0
        : (realizedPnlInBase / realizedCostInBase) * 100;

    const totalDividendsInBase = allPositions.reduce((sum, pos) => sum + pos.dividendIncomeJPY, 0);

    return {
        totalValueJPY: totalValueInBase,
        totalCostJPY: totalCostInBase,
        totalPnlJPY: totalPnlInBase,
        totalPnlPercentage,
        positions,
        closedPositions,
        realizedPnlJPY: realizedPnlInBase,
        realizedCostJPY: realizedCostInBase,
        realizedPnlPercentage,
        totalDividendsJPY: totalDividendsInBase,
    };
};
