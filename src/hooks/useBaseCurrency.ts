'use client';

import { useState, useCallback } from 'react';
import { getCurrencySymbol } from '@portfolio/core';

export type BaseCurrency = 'JPY' | 'USD' | 'EUR' | 'GBP';

export const SUPPORTED_BASE_CURRENCIES: { code: BaseCurrency; name: string; symbol: string }[] = [
    { code: 'JPY', name: 'Japanese Yen', symbol: '¥' },
    { code: 'USD', name: 'US Dollar',    symbol: '$' },
    { code: 'EUR', name: 'Euro',         symbol: '€' },
    { code: 'GBP', name: 'British Pound', symbol: '£' },
];

const STORAGE_KEY = 'baseCurrency';
const FALLBACK: BaseCurrency = 'USD';

const REGION_TO_CURRENCY: Record<string, BaseCurrency> = {
    JP: 'JPY',
    GB: 'GBP',
    AT: 'EUR', BE: 'EUR', CY: 'EUR', DE: 'EUR', EE: 'EUR', ES: 'EUR',
    FI: 'EUR', FR: 'EUR', GR: 'EUR', HR: 'EUR', IE: 'EUR', IT: 'EUR',
    LT: 'EUR', LU: 'EUR', LV: 'EUR', MT: 'EUR', NL: 'EUR', PT: 'EUR',
    SI: 'EUR', SK: 'EUR',
};

function detectRegionCurrency(): BaseCurrency {
    if (typeof navigator === 'undefined') return FALLBACK;
    const locales = [
        ...(navigator.languages ?? []),
        navigator.language,
    ].filter(Boolean) as string[];
    for (const loc of locales) {
        try {
            const region = new Intl.Locale(loc).maximize().region;
            if (region && REGION_TO_CURRENCY[region]) {
                return REGION_TO_CURRENCY[region];
            }
        } catch {
            // ignore malformed locale
        }
    }
    return FALLBACK;
}

function readStored(): BaseCurrency {
    if (typeof window === 'undefined') return FALLBACK;
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && SUPPORTED_BASE_CURRENCIES.some(c => c.code === stored)) {
        return stored as BaseCurrency;
    }
    return detectRegionCurrency();
}

export function useBaseCurrency() {
    const [currency, setCurrencyState] = useState<BaseCurrency>(readStored);

    const setCurrency = useCallback((next: BaseCurrency) => {
        localStorage.setItem(STORAGE_KEY, next);
        setCurrencyState(next);
    }, []);

    const symbol = getCurrencySymbol(currency);

    const formatValue = useCallback((amount: number, showValues: boolean): string => {
        if (!showValues) {
            return `${symbol}${'•'.repeat(Math.min(8, Math.ceil(Math.log10(Math.abs(amount) + 1))))}`;
        }
        if (currency === 'JPY') {
            return `${symbol}${Math.round(amount).toLocaleString()}`;
        }
        return `${symbol}${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }, [currency, symbol]);

    return { currency, setCurrency, symbol, formatValue };
}
