export interface FxRateRecord {
    from_currency: string;
    to_currency: string;
    rate_date: string;
    rate: number;
    created_at: string;
}
/**
 * Get FX rate for a currency pair on a specific date (or closest available date)
 */
export declare function getFxRate(fxPair: string, requestedDate?: string): Promise<{
    rate: number | null;
    date: string | null;
    requestedDate?: string;
    pair: string;
} | null>;
/**
 * Store FX rate in the database
 */
export declare function storeFxRate(fxPair: string, rate: number, rateDate?: string): Promise<void>;
/**
 * Get all FX rates for a currency pair
 */
export declare function getAllFxRatesForPair(fxPair: string): Promise<{
    [date: string]: number;
}>;
/**
 * Migrate FX rates from JSON file to database (for migration purposes)
 */
export declare function migrateFxRatesFromJson(jsonData: Record<string, Record<string, number>>): Promise<void>;
