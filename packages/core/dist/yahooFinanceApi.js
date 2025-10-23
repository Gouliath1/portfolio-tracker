import { getCachedPrice, updatePriceCache } from './priceCache';
import { getCachedFxRate, updateFxRateCache } from './fxRateCache';
import { getDataPath } from '@portfolio/utils';
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
// Portfolio configuration
const BASE_CURRENCY = 'JPY'; // The base currency for portfolio valuation
// Queue for rate limiting
let lastRequestTime = 0;
const MIN_REQUEST_DELAY = 100; // Base delay of 0.1s between requests
// API call counter for debugging
let apiCallCounter = 0;
// Calculate how long ago a position was purchased
function getMonthsSincePurchase(transactionDate) {
    const purchaseDate = new Date(transactionDate);
    const now = new Date();
    const diffInMonths = (now.getFullYear() - purchaseDate.getFullYear()) * 12 +
        (now.getMonth() - purchaseDate.getMonth());
    return Math.max(1, diffInMonths); // At least 1 month
}
// Get appropriate range for Yahoo Finance API based on months since purchase
function getYahooRange(monthsSincePurchase) {
    if (monthsSincePurchase <= 12)
        return '1y';
    if (monthsSincePurchase <= 24)
        return '2y';
    if (monthsSincePurchase <= 60)
        return '5y';
    if (monthsSincePurchase <= 120)
        return '10y';
    return 'max'; // For positions older than 10 years, get all available data
}
// Fetch historical prices for a symbol with monthly granularity
export async function fetchHistoricalPrices(symbol, positions) {
    var _a, _b, _c, _d, _e;
    console.log(`📈 fetchHistoricalPrices called for ${symbol}`);
    try {
        // Find the earliest purchase date for this symbol
        const symbolPositions = positions.filter(pos => pos.ticker === symbol);
        if (symbolPositions.length === 0) {
            console.log(`❌ No positions found for ${symbol}`);
            return null;
        }
        const earliestDate = symbolPositions.reduce((earliest, pos) => {
            const posDate = new Date(pos.transactionDate);
            return posDate < earliest ? posDate : earliest;
        }, new Date(symbolPositions[0].transactionDate));
        const monthsSincePurchase = getMonthsSincePurchase(earliestDate.toISOString().split('T')[0]);
        const range = getYahooRange(monthsSincePurchase);
        console.log(`📅 ${symbol}: First purchase ${earliestDate.toISOString().split('T')[0]}, ${monthsSincePurchase} months ago, using range: ${range}`);
        // Rate limiting with randomization
        const now = Date.now();
        const timeSinceLastRequest = now - lastRequestTime;
        const randomDelay = Math.random() * 100; // 0-100ms extra randomization
        const totalDelay = MIN_REQUEST_DELAY + randomDelay;
        if (timeSinceLastRequest < totalDelay) {
            const waitTime = totalDelay - timeSinceLastRequest;
            console.log(`⏳ Rate limiting: waiting ${waitTime.toFixed(0)}ms for ${symbol}`);
            await delay(waitTime);
        }
        lastRequestTime = Date.now();
        // Use proxy URL for client-side requests (to avoid CORS), absolute URL for server-side
        const isServerSide = typeof window === 'undefined';
        const url = isServerSide
            ? `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1mo&range=${range}`
            : `/yahoo-finance/v8/finance/chart/${symbol}?interval=1mo&range=${range}`;
        const timestamp = new Date().toISOString();
        apiCallCounter++;
        console.log(`🌐 [${timestamp}] YAHOO FINANCE HISTORICAL API CALL #${apiCallCounter}:`);
        console.log(`   Symbol: ${symbol}`);
        console.log(`   URL: ${url}`);
        console.log(`   Range: ${range} (${monthsSincePurchase} months of data)`);
        const response = await fetchWithRetry(url);
        const data = await response.json();
        console.log(`✅ [${new Date().toISOString()}] Historical response received for ${symbol} (Call #${apiCallCounter})`);
        const result = (_b = (_a = data.chart) === null || _a === void 0 ? void 0 : _a.result) === null || _b === void 0 ? void 0 : _b[0];
        if (!result || !result.timestamp || !((_e = (_d = (_c = result.indicators) === null || _c === void 0 ? void 0 : _c.quote) === null || _d === void 0 ? void 0 : _d[0]) === null || _e === void 0 ? void 0 : _e.close)) {
            console.log(`❌ No historical data found for ${symbol}`);
            return null;
        }
        const timestamps = result.timestamp;
        const prices = result.indicators.quote[0].close;
        const historicalPrices = {};
        // Process historical data - only keep data from purchase date onwards
        for (let i = 0; i < timestamps.length; i++) {
            const date = new Date(timestamps[i] * 1000);
            const price = prices[i];
            // Only include data from purchase date onwards
            if (date >= earliestDate && price !== null && price !== undefined) {
                const dateStr = date.toISOString().split('T')[0];
                historicalPrices[dateStr] = Math.round(price * 100) / 100; // Round to 2 decimal places
            }
        }
        // Sort dates descending (newest first)
        const sortedDates = Object.keys(historicalPrices).sort((a, b) => b.localeCompare(a));
        const sortedPrices = {};
        sortedDates.forEach(date => {
            sortedPrices[date] = historicalPrices[date];
        });
        console.log(`✅ ${symbol}: Retrieved ${Object.keys(sortedPrices).length} historical price points`);
        return sortedPrices;
    }
    catch (error) {
        console.error(`Error fetching historical prices for ${symbol}:`, error);
        return null;
    }
}
export async function fetchStockPrice(symbol, forceRefresh = false) {
    var _a, _b, _c, _d;
    console.log(`🔄 fetchStockPrice called for ${symbol}, forceRefresh: ${forceRefresh}`);
    try {
        // Check cache first if not forcing refresh
        if (!forceRefresh) {
            const cachedPrice = await getCachedPrice(symbol);
            if (cachedPrice !== null) {
                console.log(`💾 Using cached price for ${symbol}: ${cachedPrice}`);
                return cachedPrice;
            }
        }
        // Rate limiting with randomization
        const now = Date.now();
        const timeSinceLastRequest = now - lastRequestTime;
        const randomDelay = Math.random() * 100; // 0-100ms extra randomization
        const totalDelay = MIN_REQUEST_DELAY + randomDelay;
        if (timeSinceLastRequest < totalDelay) {
            const waitTime = totalDelay - timeSinceLastRequest;
            console.log(`⏳ Rate limiting: waiting ${waitTime.toFixed(0)}ms for ${symbol}`);
            await delay(waitTime);
        }
        lastRequestTime = Date.now();
        // Use proxy URL for client-side requests (to avoid CORS), absolute URL for server-side
        const isServerSide = typeof window === 'undefined';
        const url = isServerSide
            ? `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=1d`
            : `/yahoo-finance/v8/finance/chart/${symbol}?interval=1d&range=1d`;
        const timestamp = new Date().toISOString();
        apiCallCounter++;
        console.log(`🌐 [${timestamp}] YAHOO FINANCE API CALL #${apiCallCounter}:`);
        console.log(`   Symbol: ${symbol}`);
        console.log(`   URL: ${url}`);
        const response = await fetchWithRetry(url);
        const data = await response.json();
        console.log(`✅ [${new Date().toISOString()}] Response received for ${symbol} (Call #${apiCallCounter})`);
        const price = (_d = (_c = (_b = (_a = data.chart) === null || _a === void 0 ? void 0 : _a.result) === null || _b === void 0 ? void 0 : _b[0]) === null || _c === void 0 ? void 0 : _c.meta) === null || _d === void 0 ? void 0 : _d.regularMarketPrice;
        if (price) {
            console.log(`✅ ${symbol}: ${price} (refreshed from Yahoo Finance)`);
            // Note: In server-side context, cache updates are handled by the endpoint that called this function
            try {
                await updatePriceCache(symbol, price);
            }
            catch (_e) {
                // This is expected in server contexts where relative URLs don't work
                // The calling endpoint should handle cache updates directly
            }
            return price;
        }
        else {
            console.log(`❌ No price data found for ${symbol}`);
        }
        return null;
    }
    catch (error) {
        console.error(`Error fetching stock price for ${symbol}:`, error);
        return null;
    }
}
// Function to update all positions with current prices only (quick refresh)
export async function updateAllPositions(symbols) {
    const results = {};
    const startTime = Date.now();
    const startCallCount = apiCallCounter;
    console.log(`🔄 CURRENT PRICES REFRESH STARTED: ${symbols.length} symbols`);
    console.log(`🔄 Starting API call count: ${apiCallCounter}`);
    console.log(`🔄 Symbols to refresh: ${symbols.join(', ')}`);
    for (let i = 0; i < symbols.length; i++) {
        const symbol = symbols[i];
        console.log(`📊 Processing ${i + 1}/${symbols.length}: ${symbol}`);
        results[symbol] = await fetchStockPrice(symbol, true); // Force refresh for batch updates
        // Add extra delay between batch requests to be more gentle on Yahoo Finance
        if (i < symbols.length - 1) {
            const randomDelay = 100 + Math.random() * 100; // 100-200ms between batch requests
            console.log(`⏳ Waiting ${randomDelay.toFixed(0)}ms before next request...`);
            await delay(randomDelay);
        }
    }
    const endTime = Date.now();
    const totalTime = (endTime - startTime) / 1000;
    const totalCalls = apiCallCounter - startCallCount;
    console.log(`🏁 CURRENT PRICES REFRESH COMPLETED:`);
    console.log(`   Total symbols processed: ${symbols.length}`);
    console.log(`   Total API calls made: ${totalCalls}`);
    console.log(`   Total time taken: ${totalTime.toFixed(1)}s`);
    console.log(`   Average time per call: ${(totalTime / totalCalls).toFixed(1)}s`);
    return results;
}
// Function to refresh historical data for all positions
export async function refreshAllHistoricalData(positions) {
    const results = {};
    const startTime = Date.now();
    const startCallCount = apiCallCounter;
    // Get unique symbols from positions
    const uniqueSymbols = [...new Set(positions.map(pos => pos.ticker))];
    console.log(`📈 HISTORICAL DATA REFRESH STARTED: ${uniqueSymbols.length} symbols`);
    console.log(`📈 Starting API call count: ${apiCallCounter}`);
    console.log(`📈 Symbols to refresh: ${uniqueSymbols.join(', ')}`);
    for (let i = 0; i < uniqueSymbols.length; i++) {
        const symbol = uniqueSymbols[i];
        console.log(`📈 Processing ${i + 1}/${uniqueSymbols.length}: ${symbol}`);
        results[symbol] = await fetchHistoricalPrices(symbol, positions);
        // Add extra delay between batch requests to be more gentle on Yahoo Finance
        if (i < uniqueSymbols.length - 1) {
            const randomDelay = 200 + Math.random() * 200; // 200-400ms between historical requests (more conservative)
            console.log(`⏳ Waiting ${randomDelay.toFixed(0)}ms before next historical request...`);
            await delay(randomDelay);
        }
    }
    const endTime = Date.now();
    const totalTime = (endTime - startTime) / 1000;
    const totalCalls = apiCallCounter - startCallCount;
    console.log(`🏁 HISTORICAL DATA REFRESH COMPLETED:`);
    console.log(`   Total symbols processed: ${uniqueSymbols.length}`);
    console.log(`   Total API calls made: ${totalCalls}`);
    console.log(`   Total time taken: ${totalTime.toFixed(1)}s`);
    console.log(`   Average time per call: ${(totalTime / totalCalls).toFixed(1)}s`);
    return results;
}
// Fetch historical FX rates for a currency pair
export async function fetchHistoricalFxRates(fxPair, availableDates) {
    var _a, _b, _c, _d, _e;
    console.log(`💱 fetchHistoricalFxRates called for ${fxPair}`);
    try {
        if (availableDates.length === 0) {
            console.log(`❌ No available dates provided for ${fxPair}`);
            return null;
        }
        // Find the earliest and latest dates to determine range
        const sortedAvailableDates = availableDates.sort();
        const earliestDate = new Date(sortedAvailableDates[0]);
        const latestDate = new Date(sortedAvailableDates[sortedAvailableDates.length - 1]);
        // Calculate range based on time span
        const monthsDiff = ((latestDate.getFullYear() - earliestDate.getFullYear()) * 12) +
            (latestDate.getMonth() - earliestDate.getMonth());
        const range = getYahooRange(Math.max(1, monthsDiff));
        console.log(`📅 ${fxPair}: Date range ${earliestDate.toISOString().split('T')[0]} to ${latestDate.toISOString().split('T')[0]}, using range: ${range}`);
        // Rate limiting with randomization
        const now = Date.now();
        const timeSinceLastRequest = now - lastRequestTime;
        const randomDelay = Math.random() * 100; // 0-100ms extra randomization
        const totalDelay = MIN_REQUEST_DELAY + randomDelay;
        if (timeSinceLastRequest < totalDelay) {
            const waitTime = totalDelay - timeSinceLastRequest;
            console.log(`⏳ Rate limiting: waiting ${waitTime.toFixed(0)}ms for ${fxPair}`);
            await delay(waitTime);
        }
        lastRequestTime = Date.now();
        // Convert FX pair to Yahoo Finance format
        const yahooSymbol = getYahooFxSymbol(fxPair);
        // Use proxy URL for client-side requests (to avoid CORS), absolute URL for server-side
        const isServerSide = typeof window === 'undefined';
        const url = isServerSide
            ? `https://query1.finance.yahoo.com/v8/finance/chart/${yahooSymbol}?interval=1d&range=${range}`
            : `/yahoo-finance/v8/finance/chart/${yahooSymbol}?interval=1d&range=${range}`;
        const timestamp = new Date().toISOString();
        apiCallCounter++;
        console.log(`🌐 [${timestamp}] YAHOO FINANCE FX HISTORICAL API CALL #${apiCallCounter}:`);
        console.log(`   FX Pair: ${fxPair} (Yahoo: ${yahooSymbol})`);
        console.log(`   URL: ${url}`);
        console.log(`   Range: ${range} (${monthsDiff} months of data)`);
        const response = await fetchWithRetry(url);
        const data = await response.json();
        console.log(`✅ [${new Date().toISOString()}] FX Historical response received for ${fxPair} (Call #${apiCallCounter})`);
        const result = (_b = (_a = data.chart) === null || _a === void 0 ? void 0 : _a.result) === null || _b === void 0 ? void 0 : _b[0];
        if (!result || !result.timestamp || !((_e = (_d = (_c = result.indicators) === null || _c === void 0 ? void 0 : _c.quote) === null || _d === void 0 ? void 0 : _d[0]) === null || _e === void 0 ? void 0 : _e.close)) {
            console.log(`❌ No historical FX data found for ${fxPair}`);
            return null;
        }
        const timestamps = result.timestamp;
        const rates = result.indicators.quote[0].close;
        const historicalRates = {};
        // Process historical data - only keep data for available dates
        const availableDateSet = new Set(availableDates);
        for (let i = 0; i < timestamps.length; i++) {
            const date = new Date(timestamps[i] * 1000);
            const rate = rates[i];
            const dateStr = date.toISOString().split('T')[0];
            // Only include data for dates that exist in the price data
            if (availableDateSet.has(dateStr) && rate !== null && rate !== undefined) {
                historicalRates[dateStr] = Math.round(rate * 10000) / 10000; // Round to 4 decimal places for FX
            }
        }
        // For missing dates, use forward fill from the closest previous date
        const allYahooRates = {};
        for (let i = 0; i < timestamps.length; i++) {
            const date = new Date(timestamps[i] * 1000);
            const rate = rates[i];
            const dateStr = date.toISOString().split('T')[0];
            if (rate !== null && rate !== undefined) {
                allYahooRates[dateStr] = Math.round(rate * 10000) / 10000;
            }
        }
        // Fill missing dates with forward fill
        for (const targetDate of availableDates) {
            if (!historicalRates[targetDate]) {
                // Find the closest previous date
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
                    console.log(`📈 Forward filled ${fxPair} for ${targetDate} with rate from ${closestDate}: ${closestRate}`);
                }
            }
        }
        // Sort dates descending (newest first)
        const sortedDates = Object.keys(historicalRates).sort((a, b) => b.localeCompare(a));
        const sortedRates = {};
        sortedDates.forEach(date => {
            sortedRates[date] = historicalRates[date];
        });
        console.log(`✅ ${fxPair}: Retrieved ${Object.keys(sortedRates).length} historical FX rate points`);
        return sortedRates;
    }
    catch (error) {
        console.error(`Error fetching historical FX rates for ${fxPair}:`, error);
        return null;
    }
}
export async function fetchCurrentFxRate(fxPair, forceRefresh = false) {
    var _a, _b, _c, _d;
    console.log(`💱 fetchCurrentFxRate called for ${fxPair}, forceRefresh: ${forceRefresh}`);
    try {
        // Check cache first if not forcing refresh
        if (!forceRefresh) {
            const cachedRate = await getCachedFxRate(fxPair);
            if (cachedRate !== null) {
                console.log(`💾 Using cached FX rate for ${fxPair}: ${cachedRate}`);
                return cachedRate;
            }
        }
        // Rate limiting with randomization
        const now = Date.now();
        const timeSinceLastRequest = now - lastRequestTime;
        const randomDelay = Math.random() * 100; // 0-100ms extra randomization
        const totalDelay = MIN_REQUEST_DELAY + randomDelay;
        if (timeSinceLastRequest < totalDelay) {
            const waitTime = totalDelay - timeSinceLastRequest;
            console.log(`⏳ Rate limiting: waiting ${waitTime.toFixed(0)}ms for ${fxPair}`);
            await delay(waitTime);
        }
        lastRequestTime = Date.now();
        // Convert FX pair to Yahoo Finance format
        const yahooSymbol = getYahooFxSymbol(fxPair);
        // Use proxy URL for client-side requests (to avoid CORS), absolute URL for server-side
        const isServerSide = typeof window === 'undefined';
        const url = isServerSide
            ? `https://query1.finance.yahoo.com/v8/finance/chart/${yahooSymbol}?interval=1d&range=1d`
            : `/yahoo-finance/v8/finance/chart/${yahooSymbol}?interval=1d&range=1d`;
        const timestamp = new Date().toISOString();
        apiCallCounter++;
        console.log(`🌐 [${timestamp}] YAHOO FINANCE FX API CALL #${apiCallCounter}:`);
        console.log(`   FX Pair: ${fxPair} (Yahoo: ${yahooSymbol})`);
        console.log(`   URL: ${url}`);
        const response = await fetchWithRetry(url);
        const data = await response.json();
        console.log(`✅ [${new Date().toISOString()}] FX Response received for ${fxPair} (Call #${apiCallCounter})`);
        const rate = (_d = (_c = (_b = (_a = data.chart) === null || _a === void 0 ? void 0 : _a.result) === null || _b === void 0 ? void 0 : _b[0]) === null || _c === void 0 ? void 0 : _c.meta) === null || _d === void 0 ? void 0 : _d.regularMarketPrice;
        if (rate) {
            const roundedRate = Math.round(rate * 10000) / 10000; // Round to 4 decimal places for FX
            console.log(`✅ ${fxPair}: ${roundedRate} (refreshed from Yahoo Finance)`);
            // Note: In server-side context, cache updates are handled by the endpoint that called this function
            try {
                await updateFxRateCache(fxPair, roundedRate);
            }
            catch (_e) {
                // This is expected in server contexts where relative URLs don't work
                // The calling endpoint should handle cache updates directly
            }
            return roundedRate;
        }
        else {
            console.log(`❌ No FX rate data found for ${fxPair}`);
        }
        return null;
    }
    catch (error) {
        console.error(`Error fetching FX rate for ${fxPair}:`, error);
        return null;
    }
}
// Utility function to extract unique transaction dates from positions
function getTransactionDates(positions) {
    const transactionDates = new Set();
    for (const position of positions) {
        if (position.transactionDate) {
            // Convert date format from YYYY/MM/DD to YYYY-MM-DD
            const formattedDate = position.transactionDate.replace(/\//g, '-');
            transactionDates.add(formattedDate);
        }
    }
    return Array.from(transactionDates).sort();
}
// Function to refresh FX rates for all available dates
export async function refreshFxRatesForDates(priceData, positions) {
    const results = {};
    const startTime = Date.now();
    const startCallCount = apiCallCounter;
    // Extract all unique dates from price data
    const priceDates = new Set();
    for (const symbolData of Object.values(priceData)) {
        for (const date of Object.keys(symbolData)) {
            priceDates.add(date);
        }
    }
    // Extract all unique transaction dates from positions
    const transactionDates = getTransactionDates(positions);
    console.log(`📅 Found ${transactionDates.length} unique transaction dates: ${transactionDates.join(', ')}`);
    // Combine both price dates and transaction dates
    const allDates = new Set([...priceDates, ...transactionDates]);
    const availableDates = Array.from(allDates).sort();
    if (availableDates.length === 0) {
        console.log('❌ No dates available for FX rate refresh');
        return results;
    }
    console.log(`💱 FX RATES REFRESH STARTED for ${availableDates.length} dates (${priceDates.size} price dates + ${transactionDates.length} transaction dates)`);
    console.log(`💱 Starting API call count: ${apiCallCounter}`);
    console.log(`💱 Date range: ${availableDates[0]} to ${availableDates[availableDates.length - 1]}`);
    // Get required FX pairs based on positions
    const fxPairs = getRequiredFxPairs(positions);
    if (fxPairs.length === 0) {
        console.log('💱 No FX pairs required - all positions are in base currency');
        return results;
    }
    for (let i = 0; i < fxPairs.length; i++) {
        const fxPair = fxPairs[i];
        console.log(`💱 Processing ${i + 1}/${fxPairs.length}: ${fxPair}`);
        results[fxPair] = await fetchHistoricalFxRates(fxPair, availableDates);
        // Add extra delay between FX pairs if we add more in the future
        if (i < fxPairs.length - 1) {
            const randomDelay = 200 + Math.random() * 200; // 200-400ms between FX pairs
            console.log(`⏳ Waiting ${randomDelay.toFixed(0)}ms before next FX pair...`);
            await delay(randomDelay);
        }
    }
    const endTime = Date.now();
    const totalTime = (endTime - startTime) / 1000;
    const totalCalls = apiCallCounter - startCallCount;
    console.log(`🏁 FX RATES REFRESH COMPLETED:`);
    console.log(`   Total FX pairs processed: ${fxPairs.length}`);
    console.log(`   Total API calls made: ${totalCalls}`);
    console.log(`   Total time taken: ${totalTime.toFixed(1)}s`);
    console.log(`   Average time per call: ${totalCalls > 0 ? (totalTime / totalCalls).toFixed(1) : 0}s`);
    return results;
}
// Function to refresh current FX rates for required pairs
export async function refreshCurrentFxRates(positions) {
    const results = {};
    const startTime = Date.now();
    const startCallCount = apiCallCounter;
    // Get required FX pairs based on positions
    const fxPairs = getRequiredFxPairs(positions);
    if (fxPairs.length === 0) {
        console.log('💱 No FX pairs required - all positions are in base currency');
        return results;
    }
    console.log(`💱 CURRENT FX RATES REFRESH STARTED: ${fxPairs.length} pairs`);
    console.log(`💱 Starting API call count: ${apiCallCounter}`);
    console.log(`💱 FX pairs to refresh: ${fxPairs.join(', ')}`);
    for (let i = 0; i < fxPairs.length; i++) {
        const fxPair = fxPairs[i];
        console.log(`💱 Processing ${i + 1}/${fxPairs.length}: ${fxPair}`);
        results[fxPair] = await fetchCurrentFxRate(fxPair, true); // Force refresh for batch updates
        // Add extra delay between FX pairs
        if (i < fxPairs.length - 1) {
            const randomDelay = 100 + Math.random() * 100; // 100-200ms between FX pairs
            console.log(`⏳ Waiting ${randomDelay.toFixed(0)}ms before next FX pair...`);
            await delay(randomDelay);
        }
    }
    const endTime = Date.now();
    const totalTime = (endTime - startTime) / 1000;
    const totalCalls = apiCallCounter - startCallCount;
    console.log(`🏁 CURRENT FX RATES REFRESH COMPLETED:`);
    console.log(`   Total FX pairs processed: ${fxPairs.length}`);
    console.log(`   Total API calls made: ${totalCalls}`);
    console.log(`   Total time taken: ${totalTime.toFixed(1)}s`);
    console.log(`   Average time per call: ${totalCalls > 0 ? (totalTime / totalCalls).toFixed(1) : 0}s`);
    return results;
}
// Utility function to get required FX pairs from positions
function getRequiredFxPairs(positions) {
    const uniqueCurrencies = new Set();
    // Extract all unique base currencies from positions
    for (const position of positions) {
        if (position.transactionCcy && position.transactionCcy !== BASE_CURRENCY) {
            uniqueCurrencies.add(position.transactionCcy);
        }
    }
    // Generate FX pairs: always in format [FOREIGN_CURRENCY][BASE_CURRENCY]
    // For JPY base, USD positions would need USDJPY rate
    const fxPairs = [];
    for (const currency of uniqueCurrencies) {
        fxPairs.push(`${currency}${BASE_CURRENCY}`);
    }
    console.log(`📊 Required FX pairs for ${BASE_CURRENCY} base: ${fxPairs.join(', ')}`);
    return fxPairs;
}
// Convert FX pair to Yahoo Finance symbol format
function getYahooFxSymbol(fxPair) {
    // Yahoo Finance FX symbols are in format: [FROM_CURRENCY][TO_CURRENCY]=X
    // Special case: USDJPY maps to JPY=X in Yahoo Finance
    if (fxPair === 'USDJPY')
        return 'JPY=X';
    return `${fxPair}=X`;
}
// Utility function to get FX pair for a position
export function getFxPairForPosition(position) {
    if (!position.transactionCcy || position.transactionCcy === BASE_CURRENCY) {
        return null; // No FX conversion needed for base currency
    }
    // Generate direct FX pair: transactionCcy -> BASE_CURRENCY
    return `${position.transactionCcy}${BASE_CURRENCY}`;
}
// Helper function to get current FX rate for a pair
async function getCurrentFxRate(fxPair) {
    const rate = await fetchCurrentFxRate(fxPair);
    return rate || 1; // Fallback to 1 if rate is null
}
// Helper function to get historical FX rate for a pair and date
async function getHistoricalFxRate(fxPair, transactionDate) {
    var _a;
    console.log(`🔍 getHistoricalFxRate called for ${fxPair} on ${transactionDate}`);
    try {
        // Try to read from file system first (server-side)
        const isNodeRuntime = typeof process !== 'undefined' &&
            typeof process.versions === 'object' &&
            !!((_a = process.versions) === null || _a === void 0 ? void 0 : _a.node) &&
            typeof navigator === 'undefined';
        if (isNodeRuntime) {
            console.log(`📂 Running in server-side context, reading fxRates.json`);
            // Use dynamic require to avoid Metro bundler issues in React Native
            const req = Function('return require')();
            const fs = req('fs/promises');
            const fxRatesPath = getDataPath('fxRates.json');
            const data = await fs.readFile(fxRatesPath, 'utf-8');
            const fxRates = JSON.parse(data);
            if (fxRates[fxPair]) {
                console.log(`✅ ${fxPair} data exists in fxRates.json`);
                // First try exact date match
                if (fxRates[fxPair][transactionDate]) {
                    const rate = fxRates[fxPair][transactionDate];
                    console.log(`✅ Exact historical FX rate for ${fxPair} on ${transactionDate}: ${rate}`);
                    return rate;
                }
                console.log(`⚠️ No exact date match for ${fxPair} on ${transactionDate}, trying forward-fill`);
                // If no exact match, find the closest earlier date (forward fill)
                const availableDates = Object.keys(fxRates[fxPair]).sort((a, b) => b.localeCompare(a)); // Descending order
                const targetDate = new Date(transactionDate);
                for (const availableDate of availableDates) {
                    const availableDateTime = new Date(availableDate);
                    if (availableDateTime <= targetDate) {
                        const rate = fxRates[fxPair][availableDate];
                        console.log(`📅 Using forward-fill historical FX rate for ${fxPair}: ${availableDate} -> ${transactionDate}, rate: ${rate}`);
                        return rate;
                    }
                }
            }
            else {
                console.warn(`❌ No ${fxPair} data found in fxRates.json`);
            }
            console.warn(`⚠️ No historical FX rate found for ${fxPair} on or before ${transactionDate}`);
        }
        else {
            console.log(`🌐 Running in client-side context, calling FX rates API`);
            // Client-side: call the API endpoint
            const response = await fetch(`/api/fx-rates?pair=${fxPair}&date=${transactionDate}`);
            const data = await response.json();
            if (data.rate) {
                console.log(`✅ Got historical FX rate from API for ${fxPair} on ${transactionDate}: ${data.rate}`);
                return data.rate;
            }
            else {
                console.warn(`⚠️ API returned no historical FX rate for ${fxPair} on ${transactionDate}`);
            }
        }
    }
    catch (error) {
        console.warn(`Failed to get historical FX rate for ${fxPair} on ${transactionDate}:`, error);
    }
    // Fallback to current rate
    const fallbackRate = await getCurrentFxRate(fxPair);
    console.warn(`⚠️ Using current rate as fallback for historical ${fxPair}: ${fallbackRate}`);
    return fallbackRate;
}
// Utility function to convert amount to JPY using direct FX rates
export async function convertToJPY(amount, position, isHistorical = false) {
    var _a;
    if (position.transactionCcy === BASE_CURRENCY) {
        return { convertedAmount: amount, effectiveRate: 1, rates: {} };
    }
    const rates = {};
    const transactionDate = (_a = position.transactionDate) === null || _a === void 0 ? void 0 : _a.replace(/\//g, '-');
    // Get direct FX rate for transactionCcy -> JPY
    const directPair = `${position.transactionCcy}${BASE_CURRENCY}`; // e.g., "EURJPY", "USDJPY"
    let directRate;
    if (isHistorical && transactionDate) {
        directRate = await getHistoricalFxRate(directPair, transactionDate);
    }
    else {
        directRate = await getCurrentFxRate(directPair);
    }
    const directPairName = `${position.transactionCcy}/${BASE_CURRENCY}`; // e.g., "EUR/JPY", "USD/JPY"
    rates[directPairName] = directRate;
    return {
        convertedAmount: amount * directRate,
        effectiveRate: directRate,
        rates
    };
}
// Export BASE_CURRENCY for use in other modules
export const BASE_CURRENCY_CONSTANT = BASE_CURRENCY;
async function fetchWithRetry(url, retries = 3, baseDelay = 1000) {
    for (let i = 0; i < retries; i++) {
        try {
            const response = await fetch(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko)'
                }
            });
            if (response.ok) {
                return response;
            }
            if (response.status === 429) {
                const delayTime = baseDelay * Math.pow(2, i); // Exponential backoff
                await delay(delayTime);
                continue;
            }
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        catch (error) {
            if (i === retries - 1)
                throw error;
            await delay(baseDelay * Math.pow(2, i));
        }
    }
    throw new Error('Max retries reached');
}
