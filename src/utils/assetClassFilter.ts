import { PortfolioSummary, Position } from '@portfolio/types';
import { ASSET_CLASS_ORDER } from '../components/overview/assetClassColors';

// Asset class for a holding, keyed by ticker. Mirrors the fallback used by the
// allocation card so unresolved/loading tickers land in "Other".
export const classOf = (
    ticker: string | number,
    assetClasses: Record<string, string>,
): string => assetClasses[String(ticker)] ?? 'Other';

// Distinct asset classes present across open + closed lots, in the canonical
// display order. Classes outside the canonical list (shouldn't normally happen)
// are appended alphabetically so the filter never silently drops a holding.
export const presentAssetClasses = (
    summary: PortfolioSummary,
    assetClasses: Record<string, string>,
): string[] => {
    const present = new Set<string>();
    for (const p of summary.positions) present.add(classOf(p.ticker, assetClasses));
    for (const p of summary.closedPositions) present.add(classOf(p.ticker, assetClasses));
    const ordered = ASSET_CLASS_ORDER.filter(c => present.has(c));
    const extra = [...present].filter(c => !ASSET_CLASS_ORDER.includes(c)).sort();
    return [...ordered, ...extra];
};

// Rebuild the aggregate totals from a filtered set of lots. Kept byte-for-byte
// in sync with calculatePortfolioSummary in lib/core/calculations.ts so the
// filtered overview reads identically to the full one.
const recompute = (positions: Position[], closedPositions: Position[]): PortfolioSummary => {
    const totalCostJPY = positions.reduce((s, p) => s + p.costInJPY, 0);
    const totalValueJPY = positions.reduce((s, p) => s + p.currentValueJPY, 0);
    const totalPnlJPY = totalValueJPY - totalCostJPY;
    const totalPnlPercentage = totalCostJPY === 0 ? 0 : (totalPnlJPY / totalCostJPY) * 100;

    const realizedCostJPY = closedPositions.reduce((s, p) => s + p.costInJPY, 0);
    const realizedPnlJPY = closedPositions.reduce((s, p) => s + (p.realizedPnlJPY ?? 0), 0);
    const realizedPnlPercentage = realizedCostJPY === 0 ? 0 : (realizedPnlJPY / realizedCostJPY) * 100;

    const totalDividendsJPY = [...positions, ...closedPositions]
        .reduce((s, p) => s + p.dividendIncomeJPY, 0);

    return {
        totalValueJPY, totalCostJPY, totalPnlJPY, totalPnlPercentage,
        positions, closedPositions,
        realizedPnlJPY, realizedCostJPY, realizedPnlPercentage, totalDividendsJPY,
    };
};

// Returns a summary restricted to the selected asset classes. `selected === null`
// (or a selection that covers everything) returns the original summary unchanged
// so the unfiltered overview is a true no-op.
export const deriveSummaryForClasses = (
    summary: PortfolioSummary,
    assetClasses: Record<string, string>,
    selected: ReadonlySet<string> | null,
): PortfolioSummary => {
    if (!selected) return summary;
    const keep = (p: Position) => selected.has(classOf(p.ticker, assetClasses));
    const positions = summary.positions.filter(keep);
    const closedPositions = summary.closedPositions.filter(keep);
    if (positions.length === summary.positions.length &&
        closedPositions.length === summary.closedPositions.length) {
        return summary;
    }
    return recompute(positions, closedPositions);
};
