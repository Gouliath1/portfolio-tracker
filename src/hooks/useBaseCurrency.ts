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
const DEFAULT: BaseCurrency = 'JPY';

function readStored(): BaseCurrency {
    if (typeof window === 'undefined') return DEFAULT;
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && SUPPORTED_BASE_CURRENCIES.some(c => c.code === stored)) {
        return stored as BaseCurrency;
    }
    return DEFAULT;
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
