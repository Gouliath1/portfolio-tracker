'use client';

import { useState, useCallback, useEffect } from 'react';

const STORAGE_KEY = 'taxFeatureEnabled';

function readStored(): boolean {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem(STORAGE_KEY) === 'true';
}

/**
 * The tax estimate feature (board, nav entry, positions-table column) is
 * still under active development — hidden by default, opt-in via a toggle
 * in Settings, so it doesn't show half-finished numbers to anyone who
 * hasn't deliberately turned it on.
 */
export function useTaxFeatureEnabled() {
    const [enabled, setEnabledState] = useState(false);
    const [hydrated, setHydrated] = useState(false);

    useEffect(() => {
        setEnabledState(readStored());
        setHydrated(true);
    }, []);

    const setEnabled = useCallback((next: boolean) => {
        localStorage.setItem(STORAGE_KEY, String(next));
        setEnabledState(next);
    }, []);

    return { enabled, setEnabled, hydrated };
}
