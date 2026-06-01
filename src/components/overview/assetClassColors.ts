// Fixed, saturated hues for allocation segments — chosen to read clearly in
// both light and dark themes (donut segments don't track the theme tokens).
// Keys match the AssetClass values produced by the backend.
export const ASSET_CLASS_COLORS: Record<string, string> = {
    Equity: '#2563EB',
    ETF:    '#7C3AED',
    Fund:   '#0EA5E9',
    Crypto: '#F59E0B',
    Cash:   '#EC4899',
    Index:  '#6366F1',
    Other:  '#94A3B8',
};

// Stable display order so the legend and donut are deterministic regardless of
// which classes are present.
export const ASSET_CLASS_ORDER = ['Equity', 'ETF', 'Fund', 'Crypto', 'Cash', 'Index', 'Other'];

export const colorForAssetClass = (assetClass: string): string =>
    ASSET_CLASS_COLORS[assetClass] ?? ASSET_CLASS_COLORS.Other;
