'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useBaseCurrency } from '../../hooks/useBaseCurrency';
import { usePortfolioSummaryData } from '../../hooks/usePortfolioSummaryData';
import { useAssetClasses } from '../../hooks/useAssetClasses';
import { useActiveSetName } from '../../hooks/useActiveSetName';
import { getActiveSetId } from '../../utils/localPositions';
import { buildBrief, type PortfolioSnapshot } from '../../utils/portfolioSnapshot';

export interface PortfolioBrief {
    snapshot: PortfolioSnapshot;
    markdown: string;
}

/**
 * The portfolio as the AI features see it, available on any page.
 *
 * The assistant lives in the root layout, so it can't borrow a page's state;
 * it reads the same cached summary the pages do (same-day cache short-circuits,
 * so this is normally free). `enabled` keeps all of that idle until the panel
 * is first opened, and `refreshKey` reloads it on each later open so a
 * position added in between is picked up.
 *
 * Built from the unfiltered summary on purpose: the overview's asset-class
 * filter is a viewing aid, not a statement about what is held.
 */
export function usePortfolioBrief(enabled: boolean, refreshKey: number) {
    const { currency, hydrated } = useBaseCurrency();
    const { summary } = usePortfolioSummaryData(currency, hydrated && enabled, refreshKey);
    const setName = useActiveSetName(refreshKey);

    const tickers = useMemo(
        () => (summary ? [...summary.positions, ...summary.closedPositions].map(p => p.ticker) : []),
        [summary],
    );
    const { assetClasses } = useAssetClasses(tickers);

    // localStorage doesn't exist while Next prerenders, so resolve in an effect.
    const [setId, setSetId] = useState<string | null>(null);
    useEffect(() => {
        if (enabled) setSetId(getActiveSetId());
    }, [enabled, refreshKey]);

    const getBrief = useCallback((): PortfolioBrief | null => {
        if (!summary) return null;
        return buildBrief(summary, currency, { assetClasses, portfolioName: setName || 'Portfolio' });
    }, [summary, currency, assetClasses, setName]);

    return { getBrief, setId, loaded: summary !== null, hasPositions: (summary?.positions.length ?? 0) > 0 };
}
