import { getCachedPrice, updatePriceCache } from './priceCache';
import { getCachedFxRate, updateFxRateCache } from './fxRateCache';

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Portfolio configuration – kept as default fallback only; callers should pass baseCurrency explicitly
const BASE_CURRENCY = 'JPY';

const MIN_REQUEST_DELAY = 100;

// Serializes all outgoing Yahoo Finance requests to avoid rate-limit races
// in long-lived Node.js processes (local dev / vercel dev).
let rateLimitQueue = Promise.resolve();
function withRateLimit<T>(fn: () => Promise<T>): Promise<T> {
    const result = rateLimitQueue.then(async () => {
        await delay(MIN_REQUEST_DELAY + Math.random() * 100);
        return fn();
    });
    rateLimitQueue = result.then(() => {}, () => {});
    return result;
}

// Interface for position data
interface Position {
    transactionDate: string;
    ticker: string;
    transactionCcy?: string;
}

// Interface for raw position data (from file)
interface RawPosition {
    transactionDate: string;
    ticker: string | number;
    transactionCcy: string;
    fullName?: string;
    account?: string;
    quantity?: number;
    costPerUnit?: number;
}

// Calculate how long ago a position was purchased
function getMonthsSincePurchase(transactionDate: string): number {
    const purchaseDate = new Date(transactionDate);
    const now = new Date();
    const diffInMonths = (now.getFullYear() - purchaseDate.getFullYear()) * 12 +
                        (now.getMonth() - purchaseDate.getMonth());
    return Math.max(1, diffInMonths); // At least 1 month
}

// Get appropriate range for Yahoo Finance API based on months since purchase
function getYahooRange(monthsSincePurchase: number): string {
    if (monthsSincePurchase <= 12) return '1y';
    if (monthsSincePurchase <= 24) return '2y';
    if (monthsSincePurchase <= 60) return '5y';
    if (monthsSincePurchase <= 120) return '10y';
    return 'max'; // For positions older than 10 years, get all available data
}

// Fetch historical prices for a symbol. interval='1mo' for chart history, '1d' for daily P&L.
export async function fetchHistoricalPrices(symbol: string, positions: Position[], interval: '1mo' | '1d' = '1mo'): Promise<{[date: string]: number} | null> {
    try {
        // Find the earliest purchase date for this symbol
        const symbolPositions = positions.filter(pos => pos.ticker === symbol);
        if (symbolPositions.length === 0) {
            return null;
        }

        const earliestDate = symbolPositions.reduce((earliest, pos) => {
            const posDate = new Date(pos.transactionDate);
            return posDate < earliest ? posDate : earliest;
        }, new Date(symbolPositions[0].transactionDate));

        const monthsSincePurchase = getMonthsSincePurchase(earliestDate.toISOString().split('T')[0]);
        // Always cover the position's full history. Daily resolution at multi-year
        // ranges is fine for Yahoo and lets one cache serve both chart and daily P&L.
        const range = getYahooRange(monthsSincePurchase);

        const isServerSide = typeof window === 'undefined';

        // Client-side: hit our cached API endpoint instead of Yahoo directly. The
        // route returns { prices: {date: price} } already parsed.
        if (!isServerSide) {
            const apiUrl = `/api/historical-prices?symbol=${encodeURIComponent(symbol)}&interval=${interval}&range=${range}`;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const json = await fetchJson(apiUrl) as any;
            const prices: {[date: string]: number} = json?.prices ?? {};
            // Filter to the earliest-date window to match prior behavior.
            const filtered: {[date: string]: number} = {};
            for (const [dateStr, price] of Object.entries(prices)) {
                if (new Date(dateStr) >= earliestDate) {
                    filtered[dateStr] = Math.round(price * 100) / 100;
                }
            }
            const sortedDates = Object.keys(filtered).sort((a, b) => b.localeCompare(a));
            const sortedPrices: {[date: string]: number} = {};
            sortedDates.forEach(d => { sortedPrices[d] = filtered[d]; });
            return Object.keys(sortedPrices).length > 0 ? sortedPrices : null;
        }

        // Server-side: hit Yahoo directly (this code path is what the new API
        // route uses internally).
        const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=${interval}&range=${range}`;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const data = await fetchJson(url) as any;

        const result = data.chart?.result?.[0];
        if (!result || !result.timestamp || !result.indicators?.quote?.[0]?.close) {
            return null;
        }

        const timestamps = result.timestamp;
        const prices = result.indicators.quote[0].close;
        const historicalPrices: {[date: string]: number} = {};

        for (let i = 0; i < timestamps.length; i++) {
            const date = new Date(timestamps[i] * 1000);
            const price = prices[i];

            if (date >= earliestDate && price !== null && price !== undefined) {
                const dateStr = date.toISOString().split('T')[0];
                historicalPrices[dateStr] = Math.round(price * 100) / 100;
            }
        }

        // Sort dates descending (newest first)
        const sortedDates = Object.keys(historicalPrices).sort((a, b) => b.localeCompare(a));
        const sortedPrices: {[date: string]: number} = {};
        sortedDates.forEach(date => {
            sortedPrices[date] = historicalPrices[date];
        });

        return sortedPrices;

    } catch (error) {
        console.error(`Error fetching historical prices for ${symbol}:`, error);
        return null;
    }
}

export async function fetchStockPrice(symbol: string, forceRefresh: boolean = false): Promise<number | null> {
    try {
        const isServerSide = typeof window === 'undefined';

        // Client-side: always go through /api/prices. The server route handles
        // both today's-cache hit and the stale-price fallback on Yahoo 429.
        // forceRefresh becomes ?fresh=1 to bypass today's cache server-side.
        if (!isServerSide) {
            try {
                const url = `/api/prices?symbol=${encodeURIComponent(symbol)}${forceRefresh ? '&fresh=1' : ''}`;
                const response = await fetch(url);
                if (response.ok) {
                    const data = await response.json();
                    if (data.price !== null && data.price !== undefined) {
                        console.log(`${symbol}: ${data.price}${data.stale ? ' (stale fallback)' : ''}`);
                        return data.price;
                    }
                }
            } catch (err) {
                console.error(`Error calling /api/prices for ${symbol}:`, err);
            }
            return null;
        }

        // Server-side: skip the API route (would be a self-fetch), use the
        // server's memory cache directly unless forceRefresh.
        if (!forceRefresh) {
            const cachedPrice = await getCachedPrice(symbol);
            if (cachedPrice !== null) {
                return cachedPrice;
            }
        }

        const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=1d`;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const data = await fetchJson(url) as any;

        const price = data.chart?.result?.[0]?.meta?.regularMarketPrice;
        if (price) {
            try {
                await updatePriceCache(symbol, price);
            } catch {
                // In server-side context cache updates are handled by the calling endpoint
            }
            return price;
        }

        return null;
    } catch (error) {
        console.error(`Error fetching stock price for ${symbol}:`, error);
        return null;
    }
}

// Function to update all positions with current prices only (quick refresh)
export async function updateAllPositions(symbols: string[]): Promise<{[key: string]: number | null}> {
    const results: {[key: string]: number | null} = {};

    for (let i = 0; i < symbols.length; i++) {
        const symbol = symbols[i];
        results[symbol] = await fetchStockPrice(symbol, true);

        if (i < symbols.length - 1) {
            await delay(100 + Math.random() * 100);
        }
    }

    return results;
}

// Function to refresh historical data for all positions
export async function refreshAllHistoricalData(positions: Position[]): Promise<{[symbol: string]: {[date: string]: number} | null}> {
    const results: {[symbol: string]: {[date: string]: number} | null} = {};

    const uniqueSymbols = [...new Set(positions.map(pos => pos.ticker))];

    for (let i = 0; i < uniqueSymbols.length; i++) {
        const symbol = uniqueSymbols[i];
        results[symbol] = await fetchHistoricalPrices(symbol, positions);

        if (i < uniqueSymbols.length - 1) {
            await delay(200 + Math.random() * 200);
        }
    }

    return results;
}

// Fetch historical FX rates for a currency pair
export async function fetchHistoricalFxRates(fxPair: string, availableDates: string[]): Promise<{[date: string]: number} | null> {
    try {
        if (availableDates.length === 0) {
            return null;
        }

        const sortedAvailableDates = [...availableDates].sort();
        const earliestDate = new Date(sortedAvailableDates[0]);
        const latestDate = new Date(sortedAvailableDates[sortedAvailableDates.length - 1]);

        const monthsDiff = ((latestDate.getFullYear() - earliestDate.getFullYear()) * 12) +
                          (latestDate.getMonth() - earliestDate.getMonth());
        const range = getYahooRange(Math.max(1, monthsDiff));

        const yahooSymbol = getYahooFxSymbol(fxPair);

        const isServerSide = typeof window === 'undefined';

        // Client-side: hit cached API. The route returns { rates: {date: rate} }.
        if (!isServerSide) {
            const apiUrl = `/api/historical-fx-rates?pair=${encodeURIComponent(fxPair)}&dates=${encodeURIComponent(availableDates.join(','))}`;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const json = await fetchJson(apiUrl) as any;
            const allRates: {[date: string]: number} = json?.rates ?? {};

            // Mirror the server-side forward-fill behavior for missing dates.
            const result: {[date: string]: number} = {};
            for (const target of availableDates) {
                if (allRates[target] !== undefined) {
                    result[target] = allRates[target];
                    continue;
                }
                let bestDate: string | null = null;
                for (const d of Object.keys(allRates)) {
                    if (d <= target && (bestDate === null || d > bestDate)) bestDate = d;
                }
                if (bestDate) result[target] = allRates[bestDate];
            }
            return Object.keys(result).length > 0 ? result : null;
        }

        // Server-side: hit Yahoo directly.
        const url = `https://query1.finance.yahoo.com/v8/finance/chart/${yahooSymbol}?interval=1d&range=${range}`;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const data = await fetchJson(url) as any;

        const result = data.chart?.result?.[0];
        if (!result || !result.timestamp || !result.indicators?.quote?.[0]?.close) {
            return null;
        }

        const timestamps = result.timestamp;
        const rates = result.indicators.quote[0].close;
        const historicalRates: {[date: string]: number} = {};

        const availableDateSet = new Set(availableDates);

        for (let i = 0; i < timestamps.length; i++) {
            const date = new Date(timestamps[i] * 1000);
            const rate = rates[i];
            const dateStr = date.toISOString().split('T')[0];

            if (availableDateSet.has(dateStr) && rate !== null && rate !== undefined) {
                historicalRates[dateStr] = Math.round(rate * 10000) / 10000;
            }
        }

        // For missing dates, use forward fill from the closest previous date
        const allYahooRates: {[date: string]: number} = {};
        for (let i = 0; i < timestamps.length; i++) {
            const date = new Date(timestamps[i] * 1000);
            const rate = rates[i];
            const dateStr = date.toISOString().split('T')[0];
            if (rate !== null && rate !== undefined) {
                allYahooRates[dateStr] = Math.round(rate * 10000) / 10000;
            }
        }

        for (const targetDate of availableDates) {
            if (!historicalRates[targetDate]) {
                const targetDateObj = new Date(targetDate);
                let closestRate = null;
                let closestDate = null;

                for (const [dateStr, rate] of Object.entries(allYahooRates)) {
                    const dateObj = new Date(dateStr);
                    if (dateObj <= targetDateObj) {
                        if (!closestDate || dateObj > new Date(closestDate)) {
                            closestDate = dateStr;
                            closestRate = rate;
                        }
                    }
                }

                if (closestRate !== null) {
                    historicalRates[targetDate] = closestRate;
                }
            }
        }

        // Sort dates descending (newest first)
        const sortedDates = Object.keys(historicalRates).sort((a, b) => b.localeCompare(a));
        const sortedRates: {[date: string]: number} = {};
        sortedDates.forEach(date => {
            sortedRates[date] = historicalRates[date];
        });

        return sortedRates;

    } catch (error) {
        console.error(`Error fetching historical FX rates for ${fxPair}:`, error);
        return null;
    }
}

export async function fetchCurrentFxRate(fxPair: string, forceRefresh: boolean = false): Promise<number | null> {
    try {
        const isServerSide = typeof window === 'undefined';

        // Client-side: route through /api/fx-rates so both the server in-memory
        // cache and the client TTL cache (in fetchJson) are bypassed when the
        // caller asks for fresh data. Otherwise the FX rate stays frozen at
        // whatever was cached on first load, even after Refresh.
        if (!isServerSide) {
            try {
                const url = `/api/fx-rates?pair=${encodeURIComponent(fxPair)}${forceRefresh ? '&fresh=1' : ''}`;
                const response = await fetch(url);
                if (response.ok) {
                    const data = await response.json();
                    if (data.rate !== null && data.rate !== undefined) {
                        return data.rate;
                    }
                }
            } catch (err) {
                console.error(`Error calling /api/fx-rates for ${fxPair}:`, err);
            }
            return null;
        }

        // Server-side: skip the API route (would be a self-fetch). Use the
        // client-side cache utility only when not forcing refresh; otherwise
        // go straight to Yahoo.
        if (!forceRefresh) {
            const cachedRate = await getCachedFxRate(fxPair);
            if (cachedRate !== null) {
                return cachedRate;
            }
        }

        const yahooSymbol = getYahooFxSymbol(fxPair);
        const url = `https://query1.finance.yahoo.com/v8/finance/chart/${yahooSymbol}?interval=1d&range=1d`;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const data = await fetchJson(url) as any;

        const rate = data.chart?.result?.[0]?.meta?.regularMarketPrice;
        if (rate) {
            const roundedRate = Math.round(rate * 10000) / 10000;
            try {
                await updateFxRateCache(fxPair, roundedRate);
            } catch {
                // In server-side context cache updates are handled by the calling endpoint
            }
            return roundedRate;
        }

        return null;
    } catch (error) {
        console.error(`Error fetching FX rate for ${fxPair}:`, error);
        return null;
    }
}

// Utility function to extract unique transaction dates from positions
function getTransactionDates(positions: (Position | RawPosition)[]): string[] {
    const transactionDates = new Set<string>();

    for (const position of positions) {
        if (position.transactionDate) {
            const formattedDate = position.transactionDate.replace(/\//g, '-');
            transactionDates.add(formattedDate);
        }
    }

    return Array.from(transactionDates).sort();
}

// Function to refresh FX rates for all available dates
export async function refreshFxRatesForDates(priceData: {[symbol: string]: {[date: string]: number}}, positions: (Position | RawPosition)[], baseCurrency: string = BASE_CURRENCY): Promise<{[fxPair: string]: {[date: string]: number} | null}> {
    const results: {[fxPair: string]: {[date: string]: number} | null} = {};

    const priceDates = new Set<string>();
    for (const symbolData of Object.values(priceData)) {
        for (const date of Object.keys(symbolData)) {
            priceDates.add(date);
        }
    }

    const transactionDates = getTransactionDates(positions);
    const allDates = new Set([...priceDates, ...transactionDates]);
    const availableDates = Array.from(allDates).sort();

    if (availableDates.length === 0) {
        return results;
    }

    const fxPairs = getRequiredFxPairs(positions, baseCurrency);

    if (fxPairs.length === 0) {
        return results;
    }

    for (let i = 0; i < fxPairs.length; i++) {
        const fxPair = fxPairs[i];
        results[fxPair] = await fetchHistoricalFxRates(fxPair, availableDates);

        if (i < fxPairs.length - 1) {
            await delay(200 + Math.random() * 200);
        }
    }

    return results;
}

// Function to refresh current FX rates for required pairs
export async function refreshCurrentFxRates(positions: (Position | RawPosition)[], baseCurrency: string = BASE_CURRENCY): Promise<{[fxPair: string]: number | null}> {
    const results: {[fxPair: string]: number | null} = {};

    const fxPairs = getRequiredFxPairs(positions, baseCurrency);

    if (fxPairs.length === 0) {
        return results;
    }

    for (let i = 0; i < fxPairs.length; i++) {
        const fxPair = fxPairs[i];
        results[fxPair] = await fetchCurrentFxRate(fxPair, true);

        if (i < fxPairs.length - 1) {
            await delay(100 + Math.random() * 100);
        }
    }

    return results;
}

// Utility function to get required FX pairs from positions
function getRequiredFxPairs(positions: (Position | RawPosition)[], baseCurrency: string = BASE_CURRENCY): string[] {
    const uniqueCurrencies = new Set<string>();

    for (const position of positions) {
        if (position.transactionCcy && position.transactionCcy !== baseCurrency) {
            uniqueCurrencies.add(position.transactionCcy);
        }
    }

    const fxPairs: string[] = [];
    for (const currency of uniqueCurrencies) {
        fxPairs.push(`${currency}${baseCurrency}`);
    }

    return fxPairs;
}

// Convert FX pair to Yahoo Finance symbol format
function getYahooFxSymbol(fxPair: string): string {
    if (fxPair === 'USDJPY') return 'JPY=X';
    return `${fxPair}=X`;
}

// Utility function to get FX pair for a position
export function getFxPairForPosition(position: Position | RawPosition, baseCurrency: string = BASE_CURRENCY): string | null {
    if (!position.transactionCcy || position.transactionCcy === baseCurrency) {
        return null;
    }
    return `${position.transactionCcy}${baseCurrency}`;
}

// Helper function to get current FX rate for a pair
async function getCurrentFxRate(fxPair: string): Promise<number> {
    const rate = await fetchCurrentFxRate(fxPair);
    return rate || 1;
}

// Helper function to get historical FX rate for a pair and date
async function getHistoricalFxRate(fxPair: string, transactionDate: string): Promise<number> {
    try {
        if (typeof window === 'undefined') {
            const fs = await import('fs/promises');
            const path = await import('path');
            const fxRatesPath = path.join(process.cwd(), 'data/fxRates.json');
            const data = await fs.readFile(fxRatesPath, 'utf-8');
            const fxRates = JSON.parse(data);

            if (fxRates[fxPair]) {
                if (fxRates[fxPair][transactionDate]) {
                    return fxRates[fxPair][transactionDate];
                }

                // If no exact match, find the closest earlier date (forward fill)
                const availableDates = Object.keys(fxRates[fxPair]).sort((a, b) => b.localeCompare(a));
                const targetDate = new Date(transactionDate);

                for (const availableDate of availableDates) {
                    if (new Date(availableDate) <= targetDate) {
                        return fxRates[fxPair][availableDate];
                    }
                }
            }

            console.warn(`No historical FX rate found for ${fxPair} on or before ${transactionDate}`);
        } else {
            const response = await fetch(`/api/fx-rates?pair=${fxPair}&date=${transactionDate}`);
            const data = await response.json();

            if (data.rate) {
                return data.rate;
            }
        }
    } catch (error) {
        console.warn(`Failed to get historical FX rate for ${fxPair} on ${transactionDate}:`, error);
    }

    const fallbackRate = await getCurrentFxRate(fxPair);
    console.warn(`Using current rate as fallback for historical ${fxPair}: ${fallbackRate}`);
    return fallbackRate;
}

// Utility function to convert amount to base currency using direct FX rates
export async function convertToBaseCurrency(amount: number, position: Position | RawPosition, isHistorical: boolean = false, baseCurrency: string = BASE_CURRENCY): Promise<{ convertedAmount: number, effectiveRate: number, rates: { [pair: string]: number } }> {
    if (position.transactionCcy === baseCurrency) {
        return { convertedAmount: amount, effectiveRate: 1, rates: {} };
    }

    const rates: { [pair: string]: number } = {};
    const transactionDate = position.transactionDate?.replace(/\//g, '-');

    const directPair = `${position.transactionCcy}${baseCurrency}`;
    let directRate: number;

    if (isHistorical && transactionDate) {
        directRate = await getHistoricalFxRate(directPair, transactionDate);
    } else {
        directRate = await getCurrentFxRate(directPair);
    }

    const directPairName = `${position.transactionCcy}/${baseCurrency}`;
    rates[directPairName] = directRate;

    return {
        convertedAmount: amount * directRate,
        effectiveRate: directRate,
        rates
    };
}

/** @deprecated use convertToBaseCurrency */
export const convertToJPY = convertToBaseCurrency;

// Export BASE_CURRENCY_CONSTANT kept for backward-compat; prefer passing baseCurrency explicitly
export const BASE_CURRENCY_CONSTANT = BASE_CURRENCY;

async function fetchWithRetry(url: string, retries = 2, baseDelay = 1000): Promise<Response> {
    for (let i = 0; i < retries; i++) {
        let response: Response;
        try {
            response = await fetch(url);
        } catch {
            // Network error (Load failed / connection refused) — never retry.
            throw new TypeError(`Network error fetching ${url}`);
        }

        if (response.ok) return response;

        const retryable = response.status === 429 || response.status >= 500;
        if (retryable && i < retries - 1) {
            await delay(baseDelay * Math.pow(2, i));
            continue;
        }
        throw new Error(`HTTP ${response.status}`);
    }
    throw new Error('Max retries reached');
}

// Deduplicates concurrent fetches AND caches results for a short TTL — concurrent
// React effects, Strict-Mode double-mounts, and view changes otherwise hammer
// Yahoo's per-IP rate limit (429). Failures are negative-cached for a shorter
// window so we back off when Yahoo is throttling.
const _inFlightJson = new Map<string, Promise<unknown>>();
type CacheEntry = { data?: unknown; error?: Error; expiresAt: number };
const _cachedJson = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 min for successful responses.
const NEG_TTL_MS = 30 * 1000; // 30s for failures — gives Yahoo's rate-limit window time to reset.

async function fetchJson(url: string): Promise<unknown> {
    const now = Date.now();
    const cached = _cachedJson.get(url);
    if (cached && cached.expiresAt > now) {
        if (cached.error) throw cached.error;
        return cached.data;
    }

    const existing = _inFlightJson.get(url);
    if (existing) return existing;

    const promise = (async () => {
        try {
            const response = await withRateLimit(() => fetchWithRetry(url));
            const data = await response.json();
            _cachedJson.set(url, { data, expiresAt: Date.now() + CACHE_TTL_MS });
            return data;
        } catch (error) {
            _cachedJson.set(url, { error: error as Error, expiresAt: Date.now() + NEG_TTL_MS });
            throw error;
        }
    })();
    _inFlightJson.set(url, promise);
    promise.finally(() => _inFlightJson.delete(url));
    return promise;
}
