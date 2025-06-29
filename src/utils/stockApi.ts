import { getCachedPrice, updatePriceCache } from './priceCache';

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Queue for rate limiting
let lastRequestTime = 0;
const MIN_REQUEST_DELAY = 100; // Base delay of 0.1s between requests

// API call counter for debugging
let apiCallCounter = 0;

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

// Function to update all positions with rate limiting
export async function updateAllPositions(symbols: string[]): Promise<{[key: string]: number | null}> {
    const results: {[key: string]: number | null} = {};
    const startTime = Date.now();
    const startCallCount = apiCallCounter;
    
    console.log(`🔄 BATCH REFRESH STARTED: ${symbols.length} symbols`);
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
    
    console.log(`🏁 BATCH REFRESH COMPLETED:`);
    console.log(`   Total symbols processed: ${symbols.length}`);
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
