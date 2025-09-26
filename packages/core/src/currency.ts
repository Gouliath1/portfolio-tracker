// Currency utilities for the portfolio tracker

export const SUPPORTED_CURRENCIES = [
    { code: 'JPY', name: 'Japanese Yen', symbol: '¥' },
    { code: 'USD', name: 'US Dollar', symbol: '$' },
    { code: 'EUR', name: 'Euro', symbol: '€' },
    { code: 'GBP', name: 'British Pound', symbol: '£' },
    { code: 'CHF', name: 'Swiss Franc', symbol: 'CHF' },
    { code: 'CAD', name: 'Canadian Dollar', symbol: 'C$' },
    { code: 'AUD', name: 'Australian Dollar', symbol: 'A$' },
    { code: 'HKD', name: 'Hong Kong Dollar', symbol: 'HK$' },
    { code: 'SGD', name: 'Singapore Dollar', symbol: 'S$' },
    { code: 'KRW', name: 'Korean Won', symbol: '₩' },
    { code: 'CNY', name: 'Chinese Yuan', symbol: '¥' }
] as const;

export type SupportedCurrency = typeof SUPPORTED_CURRENCIES[number]['code'];

// Default FX rates to JPY (approximate values as of 2025)
export const DEFAULT_FX_RATES: Record<string, number> = {
    'JPY': 1.0,
    'USD': 150.0,
    'EUR': 170.0,
    'GBP': 190.0,
    'CHF': 165.0,
    'CAD': 110.0,
    'AUD': 100.0,
    'HKD': 19.0,
    'SGD': 110.0,
    'KRW': 0.11,
    'CNY': 20.5
};

// Get default FX rate for a currency to JPY
export function getDefaultFxRate(currency: string): number {
    return DEFAULT_FX_RATES[currency] || 1.0;
}

// Get currency symbol for a currency code
export function getCurrencySymbol(currencyCode: string): string {
    const currencyInfo = SUPPORTED_CURRENCIES.find(c => c.code === currencyCode);
    return currencyInfo?.symbol || currencyCode;
}

// Format currency value with appropriate symbol
export function formatCurrencyValue(amount: number, currency: string): string {
    const currencyInfo = SUPPORTED_CURRENCIES.find(c => c.code === currency);
    const symbol = currencyInfo?.symbol || currency;
    
    if (currency === 'JPY' || currency === 'KRW') {
        // No decimal places for JPY and KRW
        return `${symbol}${amount.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
    } else {
        // 2 decimal places for other currencies
        return `${symbol}${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
}

// Get currency pair string for FX conversion
export function getCurrencyPair(fromCurrency: string, toCurrency: string = 'JPY'): string {
    if (fromCurrency === toCurrency) {
        return '';
    }
    return `${fromCurrency}${toCurrency}`;
}
