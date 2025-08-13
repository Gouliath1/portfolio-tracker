// Simple currency mapping
const CURRENCY_SYMBOLS: Record<string, string> = {
    'JPY': '¥',
    'USD': '$',
    'EUR': '€',
    'GBP': '£'
};

export function getCurrencySymbol(currencyCode: string): string {
    return CURRENCY_SYMBOLS[currencyCode] || currencyCode;
}
