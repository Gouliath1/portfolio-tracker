/**
 * What cross-device sync carries, and how it's read from / written to
 * localStorage.
 *
 * The blob is an allowlist of raw localStorage entries, not a re-modelled
 * schema: sync stays correct as the per-key formats evolve, and the server
 * (which only ever sees an opaque string) never needs to know them.
 *
 * Deliberately excluded:
 *  - caches that rebuild themselves (`pt_pnl_*`, `pt_chart_*`, `pt_period_*`,
 *    `pt_assetclass_v1`, `screener:fundMap:*`)
 *  - `pt_ai_token_*` — that token is a separate credential for one device's
 *    "Connect my AI" share and must not be copied around
 *  - per-device preferences (`language`, `pt_active_set`, `pt_onboarded`)
 */

const SYNCED_KEYS = [
    'pt_sets',
    'baseCurrency',
    'taxResidenceCountry',
    'accountTaxSettingsV2',
    'taxFeatureEnabled',
    'screener:state',
] as const;

const SYNCED_PREFIXES = ['pt_positions_'] as const;

export const SYNC_BLOB_VERSION = 1;

export interface SyncBlob {
    v: number;
    entries: Record<string, string>;
}

export function isSyncedKey(key: string): boolean {
    return (SYNCED_KEYS as readonly string[]).includes(key)
        || SYNCED_PREFIXES.some(p => key.startsWith(p));
}

function syncedKeysInStorage(): string[] {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && isSyncedKey(key)) keys.push(key);
    }
    return keys.sort();
}

/** Snapshot of the syncable state, with keys sorted so equal state serialises equally. */
export function collectSyncBlob(): string {
    const entries: Record<string, string> = {};
    for (const key of syncedKeysInStorage()) {
        const value = localStorage.getItem(key);
        if (value !== null) entries[key] = value;
    }
    const blob: SyncBlob = { v: SYNC_BLOB_VERSION, entries };
    return JSON.stringify(blob);
}

export function parseSyncBlob(raw: string): SyncBlob | null {
    try {
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object') return null;
        if (parsed.v !== SYNC_BLOB_VERSION) return null;
        const entries = parsed.entries;
        if (!entries || typeof entries !== 'object') return null;
        const clean: Record<string, string> = {};
        for (const [key, value] of Object.entries(entries)) {
            // Re-check the allowlist: a blob from the server must not be able
            // to write arbitrary keys (e.g. another feature's credential).
            if (typeof value === 'string' && isSyncedKey(key)) clean[key] = value;
        }
        return { v: parsed.v, entries: clean };
    } catch {
        return null;
    }
}

/**
 * Replace local syncable state with the blob's. Synced keys absent from the
 * blob are removed — otherwise a workspace deleted on one device would
 * resurrect from another's stale copy. Returns false (and writes nothing) if
 * the blob is unusable.
 */
export function applySyncBlob(raw: string): boolean {
    const blob = parseSyncBlob(raw);
    if (!blob) return false;

    for (const key of syncedKeysInStorage()) {
        if (!(key in blob.entries)) localStorage.removeItem(key);
    }
    for (const [key, value] of Object.entries(blob.entries)) {
        localStorage.setItem(key, value);
    }
    ensureActiveSet(blob.entries['pt_sets']);
    return true;
}

const ACTIVE_SET_KEY = 'pt_active_set'; // per-device choice, not synced

/**
 * The active workspace is a per-device preference, so it isn't carried. A
 * device that has never picked one falls back to the demo workspace — which
 * made a freshly joined device look empty even though the synced workspaces
 * were all there. Point it at a synced workspace instead.
 */
function ensureActiveSet(rawSets: string | undefined): void {
    if (localStorage.getItem(ACTIVE_SET_KEY) !== null || !rawSets) return;
    try {
        const sets = JSON.parse(rawSets) as Array<{ id?: string; is_active?: boolean }>;
        const pick = sets.find(x => x.is_active && x.id) ?? sets.find(x => x.id);
        if (pick?.id) localStorage.setItem(ACTIVE_SET_KEY, pick.id);
    } catch { /* leave the default */ }
}

// ── Summaries (so the user can tell the two copies apart) ───────────────────

export interface BlobSummary {
    workspaces: string[];
    transactions: number;
}

export function summarizeBlob(raw: string): BlobSummary | null {
    const blob = parseSyncBlob(raw);
    if (!blob) return null;
    let workspaces: string[] = [];
    try {
        const sets = JSON.parse(blob.entries['pt_sets'] ?? '[]') as Array<{ display_name?: string; name?: string }>;
        workspaces = sets.map(x => x.display_name || x.name || '?');
    } catch { /* leave empty */ }
    let transactions = 0;
    for (const [key, value] of Object.entries(blob.entries)) {
        if (!key.startsWith('pt_positions_')) continue;
        try {
            const arr = JSON.parse(value);
            if (Array.isArray(arr)) transactions += arr.length;
        } catch { /* skip */ }
    }
    return { workspaces, transactions };
}

// ── Safety net before the cloud copy replaces this device ───────────────────

const BACKUP_KEY = 'pt_sync_backup'; // not in the synced allowlist

/** Keep what this device had, so "use the cloud copy" is never a one-way door. */
export function stashBackup(): void {
    try { localStorage.setItem(BACKUP_KEY, collectSyncBlob()); } catch { /* quota — best effort */ }
}

export function hasBackup(): boolean {
    return localStorage.getItem(BACKUP_KEY) !== null;
}

export function restoreBackup(): boolean {
    const raw = localStorage.getItem(BACKUP_KEY);
    if (!raw || !applySyncBlob(raw)) return false;
    localStorage.removeItem(BACKUP_KEY);
    return true;
}

/** True when there's nothing syncable locally — a fresh device joining a session. */
export function isLocalStateEmpty(): boolean {
    return syncedKeysInStorage().length === 0;
}
