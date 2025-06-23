import { getCachedPrice, updatePriceCache } from './priceCache';

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Queue for rate limiting
let lastRequestTime = 0;
const MIN_REQUEST_DELAY = 500; // Minimum 500ms between requests

export async function fetchStockPrice(symbol: string, forceRefresh: boolean = false): Promise<number | null> {
    try {
        // Check cache first if not forcing refresh
        if (!forceRefresh) {
            const cachedPrice = await getCachedPrice(symbol);
            if (cachedPrice !== null) {
                return cachedPrice;
            }
        }

        // Rate limiting
        const now = Date.now();
        const timeSinceLastRequest = now - lastRequestTime;
        if (timeSinceLastRequest < MIN_REQUEST_DELAY) {
            await delay(MIN_REQUEST_DELAY - timeSinceLastRequest);
        }
        lastRequestTime = Date.now();

        // Using Next.js rewrite rule for Yahoo Finance API
        const url = `/yahoo-finance/v8/finance/chart/${symbol}?interval=1d&range=1d`;
        
        const response = await fetchWithRetry(url);
        const data = await response.json();
        
        const price = data.chart?.result?.[0]?.meta?.regularMarketPrice;
        if (price) {
            console.log(`${symbol}: ${price} (refreshed)`);
            await updatePriceCache(symbol, price);
            return price;
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
    
    for (const symbol of symbols) {
        results[symbol] = await fetchStockPrice(symbol);
    }
    
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
