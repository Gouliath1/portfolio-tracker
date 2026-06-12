'use client';

import { useEffect, useState } from 'react';

/**
 * Reactively returns the display name of the currently active portfolio.
 * Pass a `refreshTrigger` that the host bumps when sets change (import,
 * activate, delete, add) so the name stays in sync.
 */
export function useActiveSetName(refreshTrigger?: number): string {
    const [name, setName] = useState('');

    useEffect(() => {
        let cancelled = false;
        import('../utils/localPositions')
            .then(({ getActiveSet }) => { if (!cancelled) setName(getActiveSet().display_name); })
            .catch(() => {});
        return () => { cancelled = true; };
    }, [refreshTrigger]);

    return name;
}
