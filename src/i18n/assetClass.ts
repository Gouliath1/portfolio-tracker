import type { TranslationKey } from './types';

/**
 * Asset-class values are canonical data, not display text: they come from
 * Yahoo's `instrumentType` and are persisted in `securities.asset_class`, used
 * as colour-map keys and as filter identities. So they stay English everywhere
 * in the code and are only translated at the point of rendering.
 *
 * Anything unrecognised renders as "Other", matching `colorForAssetClass`.
 */
const ASSET_CLASS_KEYS: Record<string, TranslationKey> = {
    Equity: 'assetClass.equity',
    ETF: 'assetClass.etf',
    Fund: 'assetClass.fund',
    Crypto: 'assetClass.crypto',
    Cash: 'assetClass.cash',
    Index: 'assetClass.index',
    Other: 'assetClass.other',
};

export function assetClassKey(assetClass: string): TranslationKey {
    return ASSET_CLASS_KEYS[assetClass] ?? 'assetClass.other';
}
