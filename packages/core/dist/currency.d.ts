export declare const SUPPORTED_CURRENCIES: readonly [{
    readonly code: "JPY";
    readonly name: "Japanese Yen";
    readonly symbol: "¥";
}, {
    readonly code: "USD";
    readonly name: "US Dollar";
    readonly symbol: "$";
}, {
    readonly code: "EUR";
    readonly name: "Euro";
    readonly symbol: "€";
}, {
    readonly code: "GBP";
    readonly name: "British Pound";
    readonly symbol: "£";
}, {
    readonly code: "CHF";
    readonly name: "Swiss Franc";
    readonly symbol: "CHF";
}, {
    readonly code: "CAD";
    readonly name: "Canadian Dollar";
    readonly symbol: "C$";
}, {
    readonly code: "AUD";
    readonly name: "Australian Dollar";
    readonly symbol: "A$";
}, {
    readonly code: "HKD";
    readonly name: "Hong Kong Dollar";
    readonly symbol: "HK$";
}, {
    readonly code: "SGD";
    readonly name: "Singapore Dollar";
    readonly symbol: "S$";
}, {
    readonly code: "KRW";
    readonly name: "Korean Won";
    readonly symbol: "₩";
}, {
    readonly code: "CNY";
    readonly name: "Chinese Yuan";
    readonly symbol: "¥";
}];
export type SupportedCurrency = typeof SUPPORTED_CURRENCIES[number]['code'];
export declare const DEFAULT_FX_RATES: Record<string, number>;
export declare function getDefaultFxRate(currency: string): number;
export declare function getCurrencySymbol(currencyCode: string): string;
export declare function formatCurrencyValue(amount: number, currency: string): string;
export declare function getCurrencyPair(fromCurrency: string, toCurrency?: string): string;
