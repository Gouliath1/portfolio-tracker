// Client-side historical price cache
interface HistoricalData {
    [symbol: string]: {
        [date: string]: number;
    };
}

class HistoricalPriceCache {
    private cache: HistoricalData | null = null;
    private loading: Promise<HistoricalData> | null = null;
    private lastLoaded: number = 0;
    private readonly CACHE_DURATION = 5 * 60 * 1000; // 5 minutes in milliseconds

    private async fetchAllHistoricalData(): Promise<HistoricalData> {
        const response = await fetch('/api/historical-data');
        if (!response.ok) {
            throw new Error('Failed to fetch historical data');
        }
        return response.json();
    }

    async getAllHistoricalData(forceRefresh: boolean = false): Promise<HistoricalData> {
        const now = Date.now();
        const isCacheExpired = now - this.lastLoaded > this.CACHE_DURATION;

        // Return cached data if available and not expired (unless forced refresh)
        if (this.cache && !isCacheExpired && !forceRefresh) {
            return this.cache;
        }

        // If already loading, wait for that request
        if (this.loading) {
            return this.loading;
        }

        // Start loading
        this.loading = this.fetchAllHistoricalData();

        try {
            this.cache = await this.loading;
            this.lastLoaded = now;
            return this.cache;
        } catch (error) {
            console.error('Failed to load historical data:', error);
            throw error;
        } finally {
            this.loading = null;
        }
    }

    async getPrice(symbol: string, date: string): Promise<number | null> {
        try {
            const data = await this.getAllHistoricalData();
            return data[symbol]?.[date] || null;
        } catch (error) {
            console.error(`Error getting price for ${symbol} on ${date}:`, error);
            return null;
        }
    }

    async getPriceAtDate(symbol: string, targetDate: Date): Promise<number | null> {
        try {
            const dateStr = targetDate.toISOString().split('T')[0];
            const data = await this.getAllHistoricalData();
            const symbolData = data[symbol];

            if (!symbolData) {
                return null;
            }

            // Try exact date match first
            if (symbolData[dateStr]) {
                return symbolData[dateStr];
            }

            // If exact date not found, find the closest earlier date
            const availableDates = Object.keys(symbolData)
                .filter(date => date <= dateStr)
                .sort()
                .reverse();

            if (availableDates.length > 0) {
                return symbolData[availableDates[0]];
            }

            return null;
        } catch (error) {
            console.error(`Error getting price for ${symbol} at ${targetDate}:`, error);
            return null;
        }
    }

    async getCurrentPrice(symbol: string): Promise<number | null> {
        try {
            const data = await this.getAllHistoricalData();
            const symbolData = data[symbol];

            if (!symbolData) {
                return null;
            }

            // Get the most recent price
            const dates = Object.keys(symbolData).sort().reverse();
            if (dates.length > 0) {
                return symbolData[dates[0]];
            }

            return null;
        } catch (error) {
            console.error(`Error getting current price for ${symbol}:`, error);
            return null;
        }
    }

    // Clear cache (useful for force refresh)
    clearCache(): void {
        this.cache = null;
        this.lastLoaded = 0;
    }

    // Check if data is cached
    isCached(): boolean {
        const now = Date.now();
        const isCacheExpired = now - this.lastLoaded > this.CACHE_DURATION;
        return this.cache !== null && !isCacheExpired;
    }
}

// Create a singleton instance
export const historicalPriceCache = new HistoricalPriceCache();

// Export convenience functions
export const getHistoricalPrice = (symbol: string, date: string) => 
    historicalPriceCache.getPrice(symbol, date);

export const getHistoricalPriceAtDate = (symbol: string, targetDate: Date) => 
    historicalPriceCache.getPriceAtDate(symbol, targetDate);

export const getCurrentHistoricalPrice = (symbol: string) => 
    historicalPriceCache.getCurrentPrice(symbol);

export const getAllHistoricalData = (forceRefresh?: boolean) => 
    historicalPriceCache.getAllHistoricalData(forceRefresh);

export const clearHistoricalCache = () => 
    historicalPriceCache.clearCache();

export const isHistoricalDataCached = () => 
    historicalPriceCache.isCached();
