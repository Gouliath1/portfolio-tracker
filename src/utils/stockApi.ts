import { getCachedPrice, updatePriceCache } from './priceCache';

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Queue for rate limiting
let lastRequestTime = 0;
const MIN_REQUEST_DELAY = 100; // Base delay of 0.1s between requests

// API call counter for debugging
let apiCallCounter = 0;

// Interface for position data
interface Position {
    transactionDate: string;
    ticker: string;
    [key: string]: any;
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

// Fetch historical prices for a symbol with monthly granularity
export async function fetchHistoricalPrices(symbol: string, positions: Position[]): Promise<{[date: string]: number} | null> {
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
        
        const result = data.chart?.result?.[0];
        if (!result || !result.timestamp || !result.indicators?.quote?.[0]?.close) {
            console.log(`❌ No historical data found for ${symbol}`);
            return null;
        }
        
        const timestamps = result.timestamp;
        const prices = result.indicators.quote[0].close;
        const historicalPrices: {[date: string]: number} = {};
        
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
        const sortedPrices: {[date: string]: number} = {};
        sortedDates.forEach(date => {
            sortedPrices[date] = historicalPrices[date];
        });
        
        console.log(`✅ ${symbol}: Retrieved ${Object.keys(sortedPrices).length} historical price points`);
        return sortedPrices;
        
    } catch (error) {
        console.error(`Error fetching historical prices for ${symbol}:`, error);
        return null;
    }
}

export async function fetchStockPrice(symbol: string, forceRefresh: boolean = false): Promise<number | null> {
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
        
        const price = data.chart?.result?.[0]?.meta?.regularMarketPrice;
        if (price) {
            console.log(`✅ ${symbol}: ${price} (refreshed from Yahoo Finance)`);
            // Note: In server-side context, cache updates are handled by the endpoint that called this function
            try {
                await updatePriceCache(symbol, price);
            } catch (error) {
                // This is expected in server contexts where relative URLs don't work
                // The calling endpoint should handle cache updates directly
            }
            return price;
        } else {
            console.log(`❌ No price data found for ${symbol}`);
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
export async function refreshAllHistoricalData(positions: Position[]): Promise<{[symbol: string]: {[date: string]: number} | null}> {
    const results: {[symbol: string]: {[date: string]: number} | null} = {};
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

async function fetchWithRetry(url: string, retries = 3, baseDelay = 1000): Promise<Response> {
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
        } catch (error) {
            if (i === retries - 1) throw error;
            await delay(baseDelay * Math.pow(2, i));
        }
    }
    throw new Error('Max retries reached');
}
