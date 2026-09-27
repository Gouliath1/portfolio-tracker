import topix from './topix.json';
import type { IndexConstituentsFile } from '../../types/screener';

/** Index universes the screener can load, keyed by the id persisted in screener state. */
export const INDICES: Record<string, IndexConstituentsFile> = {
    topix: topix as IndexConstituentsFile,
};

/** Every constituent across all known indices — used to resolve a symbol to a name. */
export const ALL_INDEX_CONSTITUENTS = Object.values(INDICES).flatMap(f => f.constituents);
