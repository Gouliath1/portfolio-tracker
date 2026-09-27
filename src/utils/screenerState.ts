import type { IndexConstituent, PriceAlert } from '../types/screener';

/**
 * Screener state (universe, added tickers, pins, alerts, notes) lives in one
 * localStorage key. Shared by the screener page, the pinned-list page and the
 * portfolio export/import so all three read and write the same shape.
 */
export const SCREENER_STATE_KEY = 'screener:state';

export interface ScreenerState {
    index: string;
    indexLoaded: boolean;
    added: IndexConstituent[];
    pinned: string[];
    alerts: Record<string, PriceAlert>;
    notes: Record<string, string>;
}

export const DEFAULT_SCREENER_STATE: ScreenerState = {
    index: 'topix',
    indexLoaded: true,
    added: [],
    pinned: [],
    alerts: {},
    notes: {},
};

export function migrateAlert(raw: unknown): PriceAlert | null {
    if (!raw || typeof raw !== 'object') return null;
    const a = raw as Record<string, unknown>;
    // New format
    if ('targetAbove' in a || 'targetBelow' in a) {
        const result: PriceAlert = {};
        if (typeof a.targetAbove === 'number') result.targetAbove = a.targetAbove;
        if (typeof a.targetBelow === 'number') result.targetBelow = a.targetBelow;
        return Object.keys(result).length > 0 ? result : null;
    }
    // Old format: { target: number, direction: 'above' | 'below' }
    if (typeof a.target === 'number') {
        return a.direction === 'below' ? { targetBelow: a.target } : { targetAbove: a.target };
    }
    return null;
}

function isConstituent(v: unknown): v is IndexConstituent {
    if (!v || typeof v !== 'object') return false;
    const c = v as Record<string, unknown>;
    return typeof c.symbol === 'string' && typeof c.code === 'string' && typeof c.name === 'string';
}

/** Sanitises an untrusted state-shaped object; missing/corrupt fields fall back to defaults. */
export function sanitizeScreenerState(raw: unknown): ScreenerState {
    const state: ScreenerState = { ...DEFAULT_SCREENER_STATE };
    if (!raw || typeof raw !== 'object') return state;
    const parsed = raw as Partial<ScreenerState>;
    if (typeof parsed.index === 'string') state.index = parsed.index;
    if (typeof parsed.indexLoaded === 'boolean') state.indexLoaded = parsed.indexLoaded;
    if (Array.isArray(parsed.added)) state.added = parsed.added.filter(isConstituent);
    if (Array.isArray(parsed.pinned)) state.pinned = parsed.pinned.filter((s): s is string => typeof s === 'string');
    if (parsed.alerts && typeof parsed.alerts === 'object') {
        const migrated: Record<string, PriceAlert> = {};
        for (const [sym, a] of Object.entries(parsed.alerts)) {
            const alert = migrateAlert(a);
            if (alert) migrated[sym] = alert;
        }
        state.alerts = migrated;
    }
    if (parsed.notes && typeof parsed.notes === 'object') {
        const cleaned: Record<string, string> = {};
        for (const [sym, note] of Object.entries(parsed.notes)) {
            if (typeof note === 'string' && note.trim()) cleaned[sym] = note;
        }
        state.notes = cleaned;
    }
    return state;
}

/** Reads and sanitises the persisted state. */
export function readScreenerState(): ScreenerState {
    if (typeof window === 'undefined') return { ...DEFAULT_SCREENER_STATE };
    try {
        const raw = localStorage.getItem(SCREENER_STATE_KEY);
        return sanitizeScreenerState(raw ? JSON.parse(raw) : null);
    } catch {
        return { ...DEFAULT_SCREENER_STATE };
    }
}

export function writeScreenerState(state: ScreenerState): void {
    if (typeof window === 'undefined') return;
    try {
        localStorage.setItem(SCREENER_STATE_KEY, JSON.stringify(state));
    } catch { /* ignore quota errors */ }
}

/**
 * Resolves a symbol to a row: added tickers first, then the index list, then
 * a bare fallback (the Yahoo name replaces it once fundamentals load).
 */
export function resolveConstituent(
    symbol: string,
    added: IndexConstituent[],
    index: IndexConstituent[],
): IndexConstituent {
    return added.find(c => c.symbol === symbol)
        ?? index.find(c => c.symbol === symbol)
        ?? { symbol, code: symbol.replace(/\.T$/, ''), name: symbol, sector: null };
}

// ── Watchlist backup ──────────────────────────────────────────────────────

/** One pinned stock, self-contained so it can be restored without the index list. */
export interface WatchlistItem extends IndexConstituent {
    note?: string;
    alert?: PriceAlert;
}

export interface WatchlistBackup {
    version: 1;
    exportedAt: string;
    items: WatchlistItem[];
}

/** Builds a backup of the pinned list (with each pin's note and alert). Undefined when nothing is pinned. */
export function buildWatchlistBackup(
    state: ScreenerState,
    index: IndexConstituent[],
): WatchlistBackup | undefined {
    if (state.pinned.length === 0) return undefined;
    const items = state.pinned.map(symbol => {
        const item: WatchlistItem = { ...resolveConstituent(symbol, state.added, index) };
        if (state.notes[symbol]) item.note = state.notes[symbol];
        if (state.alerts[symbol]) item.alert = state.alerts[symbol];
        return item;
    });
    return { version: 1, exportedAt: new Date().toISOString(), items };
}

/**
 * Accepts either a full backup object or a bare array of items / symbols.
 * Returns null when nothing usable is found.
 */
export function parseWatchlistBackup(json: unknown): WatchlistItem[] | null {
    const list = Array.isArray(json)
        ? json
        : json && typeof json === 'object' && Array.isArray((json as { items?: unknown }).items)
            ? (json as { items: unknown[] }).items
            : null;
    if (!list) return null;
    const items: WatchlistItem[] = [];
    for (const raw of list) {
        if (typeof raw === 'string' && raw.trim()) {
            const symbol = raw.trim();
            items.push({ symbol, code: symbol.replace(/\.T$/, ''), name: symbol, sector: null });
            continue;
        }
        if (!raw || typeof raw !== 'object') continue;
        const r = raw as Record<string, unknown>;
        if (typeof r.symbol !== 'string' || !r.symbol.trim()) continue;
        const symbol = r.symbol.trim();
        const item: WatchlistItem = {
            symbol,
            code: typeof r.code === 'string' && r.code ? r.code : symbol.replace(/\.T$/, ''),
            name: typeof r.name === 'string' && r.name ? r.name : symbol,
            sector: typeof r.sector === 'string' ? r.sector : null,
        };
        if (typeof r.note === 'string' && r.note.trim()) item.note = r.note;
        const alert = migrateAlert(r.alert);
        if (alert) item.alert = alert;
        items.push(item);
    }
    return items.length > 0 ? items : null;
}

/**
 * Merges imported items into the state: pins are unioned (existing order kept,
 * new ones appended), imported notes/alerts win per symbol, and symbols outside
 * the index are added to the custom list so they keep their name and show up
 * in the screener.
 */
export function mergeWatchlist(
    state: ScreenerState,
    items: WatchlistItem[],
    index: IndexConstituent[],
): ScreenerState {
    const indexSymbols = new Set(index.map(c => c.symbol));
    const pinned = [...state.pinned];
    const pinnedSet = new Set(pinned);
    const added = [...state.added];
    const addedSet = new Set(added.map(c => c.symbol));
    const notes = { ...state.notes };
    const alerts = { ...state.alerts };

    for (const { note, alert, ...c } of items) {
        if (!pinnedSet.has(c.symbol)) { pinned.push(c.symbol); pinnedSet.add(c.symbol); }
        if (!indexSymbols.has(c.symbol) && !addedSet.has(c.symbol)) { added.push(c); addedSet.add(c.symbol); }
        if (note) notes[c.symbol] = note;
        if (alert) alerts[c.symbol] = alert;
    }
    return { ...state, pinned, added, notes, alerts };
}

// ── Full screener backup (bundled into portfolio exports) ─────────────────

/** Everything the screener persists, minus nothing — pins, custom tickers, notes, alerts, universe. */
export type ScreenerBackup = ScreenerState & { version: 1 };

/** Undefined when the screener holds nothing worth saving (no pins, tickers, notes or alerts). */
export function buildScreenerBackup(state: ScreenerState): ScreenerBackup | undefined {
    const empty = state.pinned.length === 0 && state.added.length === 0
        && Object.keys(state.notes).length === 0 && Object.keys(state.alerts).length === 0;
    return empty ? undefined : { version: 1, ...state };
}

/**
 * Merges a restored backup into the current state: custom tickers and pins are
 * unioned (current order first), imported notes/alerts win per symbol. The
 * universe choice is left alone — it's a view setting, not data.
 */
export function mergeScreenerBackup(state: ScreenerState, raw: unknown): ScreenerState {
    const b = sanitizeScreenerState(raw);
    const addedSet = new Set(state.added.map(c => c.symbol));
    const pinnedSet = new Set(state.pinned);
    return {
        ...state,
        added: [...state.added, ...b.added.filter(c => !addedSet.has(c.symbol))],
        pinned: [...state.pinned, ...b.pinned.filter(s => !pinnedSet.has(s))],
        notes: { ...state.notes, ...b.notes },
        alerts: { ...state.alerts, ...b.alerts },
    };
}
