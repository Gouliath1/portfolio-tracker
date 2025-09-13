/**
 * Currency utilities for the positions table
 * Handles currency symbol mapping, formatting, and display logic
 */

// Simple currency mapping for supported currencies
const CURRENCY_SYMBOLS: Record<string, string> = {
    'JPY': '¥',
    'USD': '$',
    'EUR': '€',
    'GBP': '£'
};

/**
 * Gets the currency symbol for a given currency code
 * @param currencyCode - The 3-letter currency code (e.g., 'JPY', 'USD')
 * @returns The currency symbol or the original code if not found
 */
export function getCurrencySymbol(currencyCode: string): string {
    return CURRENCY_SYMBOLS[currencyCode] || currencyCode;
}

/**
 * Generates a hidden value placeholder with dots based on the magnitude of the number
 * Used for privacy mode when values should be obscured
 * @param value - The numeric value to create a placeholder for
 * @returns A string of dots representing the hidden value
 */
export function getHiddenValue(value: number): string {
    return '•'.repeat(Math.min(8, Math.ceil(Math.log10(Math.abs(value) + 1))));
}

/**
 * Formats a currency value with proper symbol and decimal places
 * Handles different currency conventions (e.g., JPY without decimals)
 * @param amount - The numeric amount to format
 * @param currencyCode - The currency code for symbol selection
 * @param showValues - Whether to show actual values or hidden placeholders
 * @returns Formatted currency string with symbol and proper decimal places
 */
export function formatCurrencyValue(amount: number, currencyCode: string, showValues: boolean): string {
    const symbol = getCurrencySymbol(currencyCode);
    
    if (!showValues) {
        return `${symbol}${getHiddenValue(amount)}`;
    }
    
    // JPY doesn't use decimal places
    if (currencyCode === 'JPY') {
        return `${symbol}${Math.round(amount).toLocaleString()}`;
    }
    
    // Other currencies use 2 decimal places
    return `${symbol}${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
