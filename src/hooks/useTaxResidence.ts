'use client';

import { useState, useCallback, useEffect } from 'react';
import type { TaxResidenceCountry } from '@portfolio/core';

export const TAX_RESIDENCE_STORAGE_KEY = 'taxResidenceCountry';
const STORAGE_KEY = TAX_RESIDENCE_STORAGE_KEY;

function readStored(): TaxResidenceCountry | null {
    if (typeof window === 'undefined') return null;
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === 'FR' || stored === 'JP' ? stored : null;
}

/**
 * Tax residence is a property of the taxpayer, not any one account — a
 * single global value, deliberately starting unset (no default) so a tax
 * estimate never appears without the user having explicitly told the app
 * who they are for tax purposes.
 */
export function useTaxResidence() {
    const [residenceCountry, setResidenceCountryState] = useState<TaxResidenceCountry | null>(null);
    const [hydrated, setHydrated] = useState(false);

    useEffect(() => {
        setResidenceCountryState(readStored());
        setHydrated(true);
    }, []);

    const setResidenceCountry = useCallback((next: TaxResidenceCountry | null) => {
        if (next === null) localStorage.removeItem(STORAGE_KEY);
        else localStorage.setItem(STORAGE_KEY, next);
        setResidenceCountryState(next);
    }, []);

    return { residenceCountry, setResidenceCountry, hydrated };
}
