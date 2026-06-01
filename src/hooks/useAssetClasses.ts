'use client';

import { useEffect, useState } from 'react';

/**
 * Fetches the { ticker: assetClass } map for a set of tickers from
 * /api/asset-classes. The result is keyed by the sorted, de-duplicated ticker
 * list so it only refetches when the actual set of holdings changes.
 */
export function useAssetClasses(tickers: (string | number)[]): {
    assetClasses: Record<string, string>;
    isLoading: boolean;
} {
    const key = [...new Set(tickers.map(String))].sort().join(',');
    const [assetClasses, setAssetClasses] = useState<Record<string, string>>({});
    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => {
        if (!key) {
            setAssetClasses({});
            return;
        }
        let cancelled = false;
        setIsLoading(true);
        fetch(`/api/asset-classes?tickers=${encodeURIComponent(key)}`)
            .then(res => (res.ok ? res.json() : { assetClasses: {} }))
            .then(data => {
                if (!cancelled) setAssetClasses(data.assetClasses ?? {});
            })
            .catch(() => {
                if (!cancelled) setAssetClasses({});
            })
            .finally(() => {
                if (!cancelled) setIsLoading(false);
            });
        return () => { cancelled = true; };
    }, [key]);

    return { assetClasses, isLoading };
}
