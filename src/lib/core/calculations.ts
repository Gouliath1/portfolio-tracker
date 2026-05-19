import { Position, RawPosition, PortfolioSummary } from '@portfolio/types';
import { fetchStockPrice, updateAllPositions, fetchCurrentFxRate, fetchHistoricalFxRates } from './yahooFinanceApi';

// Preloaded FX rates for a whole portfolio. When present, calculatePosition uses
// these instead of making its own network calls — collapses N positions × ~2
// round-trips into M (unique pairs) parallel fetches batched up front.
export type FxLookup = {
    historical: Map<string, Map<string, number>>; // pair → date (YYYY-MM-DD) → rate
    current: Map<string, number>;                 // pair → rate
};

// Forward-fill: latest cached date <= target. Mirrors the server-side fallback
// in /api/historical-fx-rates so a transaction on a weekend/holiday still maps
// to the previous business day's rate.
function lookupHistorical(map: Map<string, number>, date: string): number | null {
    const exact = map.get(date);
    if (exact !== undefined) return exact;
    let bestDate: string | null = null;
    for (const d of map.keys()) {
        if (d <= date && (bestDate === null || d > bestDate)) bestDate = d;
    }
    return bestDate ? map.get(bestDate)! : null;
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
    return currentRate || 1;
}

async function getCurrentFxRate(fxPair: string, lookup?: FxLookup): Promise<number> {
    const pre = lookup?.current.get(fxPair);
    if (pre !== undefined) return pre;
    const rate = await fetchCurrentFxRate(fxPair);
    return rate || 1;
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

export const calculatePosition = async (rawPosition: RawPosition, currentPrice: number | null, baseCurrency: string = 'JPY', fxLookup?: FxLookup): Promise<Position> => {
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
    const costInJPY = costPerUnitInBase * rawPosition.quantity;

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
        const proceedsJPY = salePricePerUnitInBase * rawPosition.quantity;
        const realizedPnlJPY = proceedsJPY - costInJPY;
        const realizedPnlPercentage = costInJPY === 0 ? 0 : (realizedPnlJPY / costInJPY) * 100;

        return {
            ...rawPosition,
            status: 'closed',
            currentPrice: null,
            costInJPY,
            currentValueJPY: 0,
            pnlJPY: 0,
            pnlPercentage: 0,
            transactionFxRate: origFxRate,
            currentFxRate: 1,
            proceedsJPY,
            realizedPnlJPY,
            realizedPnlPercentage,
            saleFxRate,
        };
    }

    // 3b. Open lot: current value and FX rate
    let currentValueJPY = 0;
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
            currentValueJPY = valueConversion.convertedAmount;
            currentFxRate = valueConversion.fxRate;
        } else {
            currentValueJPY = rawPosition.quantity * currentPrice;
            currentFxRate = 1;
        }
    }

    const pnlJPY = currentPrice !== null ? currentValueJPY - costInJPY : 0;
    const pnlPercentage = currentPrice !== null ? (pnlJPY / costInJPY) * 100 : 0;

    return {
        ...rawPosition,
        status: 'open',
        currentPrice,
        costInJPY,
        currentValueJPY,
        pnlJPY,
        pnlPercentage,
        transactionFxRate: origFxRate,
        currentFxRate
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

    const [resolvedPrices, fxLookup] = await Promise.all([pricesPromise, fxPromise]);
    currentPrices = resolvedPrices;
    log('prices+fx (parallel)');

    const tpos = performance.now();
    const positionPromises = rawPositions.map(pos =>
        calculatePosition(pos, pos.saleDate ? null : currentPrices[pos.ticker.toString()] ?? null, baseCurrency, fxLookup)
    );
    const allPositions = await Promise.all(positionPromises);
    log('per-position calc', tpos);
    log('TOTAL');

    const positions = allPositions.filter(p => p.status === 'open');
    const closedPositions = allPositions.filter(p => p.status === 'closed');

    const totalCostJPY = positions.reduce((sum, pos) => sum + pos.costInJPY, 0);
    const totalValueJPY = positions.reduce((sum, pos) => sum + pos.currentValueJPY, 0);
    const totalPnlJPY = totalValueJPY - totalCostJPY;
    const totalPnlPercentage = totalCostJPY === 0
        ? 0
        : (totalPnlJPY / totalCostJPY) * 100;

    const realizedCostJPY = closedPositions.reduce((sum, pos) => sum + pos.costInJPY, 0);
    const realizedPnlJPY = closedPositions.reduce((sum, pos) => sum + (pos.realizedPnlJPY ?? 0), 0);
    const realizedPnlPercentage = realizedCostJPY === 0
        ? 0
        : (realizedPnlJPY / realizedCostJPY) * 100;

    return {
        totalValueJPY,
        totalCostJPY,
        totalPnlJPY,
        totalPnlPercentage,
        positions,
        closedPositions,
        realizedPnlJPY,
        realizedCostJPY,
        realizedPnlPercentage,
    };
};
