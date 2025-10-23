/**
 * Database operations for historical prices
 * Replaces positionsPrices.json functionality
 */
export interface PriceData {
    symbol: string;
    date: string;
    price: number;
}
export interface HistoricalPricesData {
    [symbol: string]: {
        [date: string]: number;
    };
}
/**
 * Get all historical prices for a symbol
 * @param symbol Stock ticker symbol
 * @returns Historical prices object
 */
export declare const getHistoricalPricesForSymbol: (symbol: string) => Promise<{
    [date: string]: number;
}>;
/**
 * Get today's price for a symbol
 * @param symbol Stock ticker symbol
 * @returns Today's price or null if not found
 */
export declare const getTodaysPrice: (symbol: string) => Promise<number | null>;
/**
 * Store a single price in the database
 * @param symbol Stock ticker symbol
 * @param date Price date (YYYY-MM-DD)
 * @param price Price value
 */
export declare const storePriceData: (symbol: string, date: string, price: number) => Promise<void>;
/**
 * Store multiple prices for a symbol
 * @param symbol Stock ticker symbol
 * @param prices Object with date -> price mapping
 */
export declare const storeHistoricalPrices: (symbol: string, prices: {
    [date: string]: number;
}) => Promise<void>;
/**
 * Get all cached prices in the old JSON format for compatibility
 * @returns HistoricalPricesData object matching the old JSON structure
 */
export declare const getAllHistoricalPrices: () => Promise<HistoricalPricesData>;
