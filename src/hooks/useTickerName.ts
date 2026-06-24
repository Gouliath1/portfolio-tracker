'use client';

import { useEffect, useRef, useState } from 'react';

export type NameLookupState = 'idle' | 'loading' | 'found' | 'not-found';

/**
 * Debounced ticker → company-name lookup against /api/ticker-info.
 *
 * Extracted from AddPositionModal so both the "add position" form and the
 * screener's "add single ticker" input share one implementation. The hook
 * owns only the lookup lifecycle; callers decide what to do with the result
 * (auto-fill a field, add a row, …) via onResolved.
 *
 * Pass `enabled: false` to pause lookups (e.g. the user manually overrode the
 * name), matching the modal's prior `nameOverridden` behavior.
 */
export function useTickerName(
    ticker: string,
    onResolved: (name: string | null) => void,
    { enabled = true, delay = 600 }: { enabled?: boolean; delay?: number } = {},
) {
    const [state, setState] = useState<NameLookupState>('idle');
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    // Keep the latest callback without re-arming the timer on every render.
    const onResolvedRef = useRef(onResolved);
    onResolvedRef.current = onResolved;

    useEffect(() => {
        const symbol = ticker.trim();
        if (!enabled || !symbol) {
            setState('idle');
            return;
        }

        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(async () => {
            setState('loading');
            try {
                const res = await fetch(`/api/ticker-info?symbol=${encodeURIComponent(symbol.toUpperCase())}`);
                const data = await res.json();
                if (data.name) {
                    onResolvedRef.current(data.name);
                    setState('found');
                } else {
                    onResolvedRef.current(null);
                    setState('not-found');
                }
            } catch {
                onResolvedRef.current(null);
                setState('not-found');
            }
        }, delay);

        return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
    }, [ticker, enabled, delay]);

    return state;
}
