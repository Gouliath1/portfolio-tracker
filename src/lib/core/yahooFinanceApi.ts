// Minimal shape required by fetchHistoricalPrices / refreshAllHistoricalData —
// allows both full Position objects and lightweight synthetic entries (e.g.
// { transactionDate, ticker }) from API route callers.
interface PositionLike {
    transactionDate: string;
    ticker: string | number;
    transactionCcy?: string;
}

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

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
export async function fetchHistoricalPrices(symbol: string, positions: PositionLike[], interval: '1mo' | '1d' = '1mo'): Promise<{[date: string]: number} | null> {
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

// Dividend event from Yahoo, keyed by ISO ex-date.
// Currency comes from chart.result[0].meta.currency — Yahoo returns the
// dividend in the security's listing currency. Conversion to base currency
// is done by callers at read time via fx_rates.
export interface DividendEventRow {
    amount: number;
    currency: string;
}

// Fetch historical dividend events for a symbol. Mirrors fetchHistoricalPrices
// but hits the Yahoo chart endpoint with &events=div, returning per-share
// dividend amounts on each ex-date.
export async function fetchHistoricalDividends(symbol: string, positions: PositionLike[]): Promise<{[date: string]: DividendEventRow} | null> {
    try {
        const symbolPositions = positions.filter(pos => pos.ticker === symbol);
        if (symbolPositions.length === 0) {
            return null;
        }

        const earliestDate = symbolPositions.reduce((earliest, pos) => {
            const posDate = new Date(pos.transactionDate);
            return posDate < earliest ? posDate : earliest;
        }, new Date(symbolPositions[0].transactionDate));

        const monthsSincePurchase = getMonthsSincePurchase(earliestDate.toISOString().split('T')[0]);
        const range = getYahooRange(monthsSincePurchase);

        const isServerSide = typeof window === 'undefined';

        // Client-side: hit our cached API endpoint.
        if (!isServerSide) {
            const apiUrl = `/api/dividends?symbol=${encodeURIComponent(symbol)}&range=${range}`;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const json = await fetchJson(apiUrl) as any;
            const events: {[date: string]: DividendEventRow} = json?.dividends ?? {};
            const filtered: {[date: string]: DividendEventRow} = {};
            for (const [dateStr, ev] of Object.entries(events)) {
                if (new Date(dateStr) >= earliestDate) {
                    filtered[dateStr] = ev;
                }
            }
            return Object.keys(filtered).length > 0 ? filtered : null;
        }

        // Server-side: hit Yahoo directly. &events=div instructs Yahoo to
        // return chart.result[0].events.dividends alongside the price series.
        const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=${range}&events=div`;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const data = await fetchJson(url) as any;

        const result = data.chart?.result?.[0];
        if (!result) return null;

        const currency: string = result.meta?.currency ?? '';
        const dividends = result.events?.dividends ?? {};
        const out: {[date: string]: DividendEventRow} = {};

        for (const ev of Object.values(dividends) as Array<{amount?: number; date?: number}>) {
            if (typeof ev.amount !== 'number' || typeof ev.date !== 'number') continue;
            const exDate = new Date(ev.date * 1000);
            if (exDate < earliestDate) continue;
            const dateStr = exDate.toISOString().split('T')[0];
            out[dateStr] = { amount: ev.amount, currency };
        }

        return Object.keys(out).length > 0 ? out : null;

    } catch (error) {
        console.error(`Error fetching historical dividends for ${symbol}:`, error);
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

        // Server-side: skip the API route (would be a self-fetch) and hit
        // Yahoo directly. The /api/prices route handles the memory-cache layer.
        const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=1d`;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const data = await fetchJson(url) as any;

        const price = data.chart?.result?.[0]?.meta?.regularMarketPrice;
        if (price) {
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

    for (const symbol of symbols) {
        results[symbol] = await fetchStockPrice(symbol, true);
    }

    return results;
}

// Function to refresh historical data for all positions
export async function refreshAllHistoricalData(positions: PositionLike[]): Promise<{[symbol: string]: {[date: string]: number} | null}> {
    const results: {[symbol: string]: {[date: string]: number} | null} = {};

    const uniqueSymbols = [...new Set(positions.map(pos => String(pos.ticker)))];

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

        // Server-side: skip the API route (would be a self-fetch) and hit
        // Yahoo directly. The /api/fx-rates route handles the memory-cache layer.
        const yahooSymbol = getYahooFxSymbol(fxPair);
        const url = `https://query1.finance.yahoo.com/v8/finance/chart/${yahooSymbol}?interval=1d&range=1d`;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const data = await fetchJson(url) as any;

        const rate = data.chart?.result?.[0]?.meta?.regularMarketPrice;
        if (rate) {
            const roundedRate = Math.round(rate * 10000) / 10000;
            return roundedRate;
        }

        return null;
    } catch (error) {
        console.error(`Error fetching FX rate for ${fxPair}:`, error);
        return null;
    }
}

// Convert FX pair to Yahoo Finance symbol format
function getYahooFxSymbol(fxPair: string): string {
    if (fxPair === 'USDJPY') return 'JPY=X';
    return `${fxPair}=X`;
}

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

function getTransactionDates(positions: PositionLike[]): string[] {
    const dates = new Set<string>();
    for (const p of positions) {
        if (p.transactionDate) dates.add(p.transactionDate.replace(/\//g, '-'));
    }
    return Array.from(dates).sort();
}

function getRequiredFxPairs(positions: PositionLike[], baseCurrency: string): string[] {
    const pairs: string[] = [];
    const seen = new Set<string>();
    for (const p of positions) {
        if (p.transactionCcy && p.transactionCcy !== baseCurrency) {
            const pair = `${p.transactionCcy}${baseCurrency}`;
            if (!seen.has(pair)) { seen.add(pair); pairs.push(pair); }
        }
    }
    return pairs;
}

export async function refreshFxRatesForDates(
    priceData: { [symbol: string]: { [date: string]: number } },
    positions: PositionLike[],
    baseCurrency = 'JPY',
): Promise<{ [fxPair: string]: { [date: string]: number } | null }> {
    const results: { [fxPair: string]: { [date: string]: number } | null } = {};

    const priceDates = new Set<string>();
    for (const symbolData of Object.values(priceData)) {
        for (const date of Object.keys(symbolData)) priceDates.add(date);
    }

    const allDates = Array.from(new Set([...priceDates, ...getTransactionDates(positions)])).sort();
    if (allDates.length === 0) return results;

    const fxPairs = getRequiredFxPairs(positions, baseCurrency);
    if (fxPairs.length === 0) return results;

    for (let i = 0; i < fxPairs.length; i++) {
        results[fxPairs[i]] = await fetchHistoricalFxRates(fxPairs[i], allDates);
        if (i < fxPairs.length - 1) await delay(200 + Math.random() * 200);
    }

    return results;
}
