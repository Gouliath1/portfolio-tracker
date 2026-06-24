/**
 * Client-side localStorage store for position sets and transactions.
 *
 * The on-disk format is a flat list of buy/sell `Transaction` records.
 * Lot views (open + closed) are derived on read via FIFO matching.
 *
 * Legacy storage from earlier versions used a flat `RawPosition[]` (each
 * record was a lot, with optional sale fields). On read we auto-migrate
 * those into transactions; writes always emit the new format.
 */

import { RawPosition, Transaction, Currency } from '@portfolio/types';
import { deriveLotsFromTransactions } from '@portfolio/core';
import { DEMO_POSITIONS, DEMO_TRANSACTIONS, DEMO_SET, DEMO_SET_ID } from '../data/demoPositions';

export interface PositionSetLocal {
    id: string;
    name: string;
    display_name: string;
    description: string | null;
    info_type: string;
    is_active: boolean;
    created_at: string;
    updated_at: string;
}

const SETS_KEY = 'pt_sets';
const ACTIVE_KEY = 'pt_active_set';
export const JUST_IMPORTED_KEY = 'pt_just_imported_set';

const positionsKey = (id: string) => `pt_positions_${id}`;

// ── Migration ────────────────────────────────────────────────

type LegacyRawPosition = {
    transactionDate: string;
    ticker: string | number;
    fullName: string;
    broker?: string;
    account: string;
    quantity: number;
    costPerUnit: number;
    transactionCcy: string;
    stockCcy: string;
    saleDate?: string;
    salePricePerUnit?: number;
    saleCcy?: string;
};

function isLegacyArray(arr: unknown): arr is LegacyRawPosition[] {
    if (!Array.isArray(arr) || arr.length === 0) return false;
    // Treat as legacy if every element looks like a lot (has costPerUnit, no way).
    return arr.every(el => typeof el === 'object' && el !== null
        && 'costPerUnit' in el && !('way' in el));
}

function migrateLegacy(legacy: LegacyRawPosition[]): Transaction[] {
    const txs: Transaction[] = [];
    for (const p of legacy) {
        txs.push({
            way: 'buy',
            date: p.transactionDate,
            ticker: p.ticker,
            fullName: p.fullName,
            broker: p.broker,
            account: p.account,
            quantity: p.quantity,
            pricePerUnit: p.costPerUnit, // already effective, treat fees as 0
            fees: 0,
            ccy: p.transactionCcy as Currency,
            stockCcy: p.stockCcy as Currency,
        });
        if (p.saleDate && p.salePricePerUnit !== undefined) {
            txs.push({
                way: 'sell',
                date: p.saleDate,
                ticker: p.ticker,
                fullName: p.fullName,
                broker: p.broker,
                account: p.account,
                quantity: p.quantity,
                pricePerUnit: p.salePricePerUnit,
                fees: 0,
                ccy: (p.saleCcy ?? p.stockCcy) as Currency,
                stockCcy: p.stockCcy as Currency,
            });
        }
    }
    return txs;
}

// ── Reads ─────────────────────────────────────────────────────

export function getPositionSets(): PositionSetLocal[] {
    try {
        const raw = localStorage.getItem(SETS_KEY);
        const stored: PositionSetLocal[] = raw ? JSON.parse(raw) : [];
        return [DEMO_SET, ...stored];
    } catch {
        return [DEMO_SET];
    }
}

export function getActiveSetId(): string {
    return localStorage.getItem(ACTIVE_KEY) ?? DEMO_SET_ID;
}

export function getActiveSet(): PositionSetLocal {
    const id = getActiveSetId();
    return getPositionSets().find(s => s.id === id) ?? DEMO_SET;
}

export function getTransactionsForSet(id: string): Transaction[] {
    if (id === DEMO_SET_ID) return DEMO_TRANSACTIONS;
    try {
        const raw = localStorage.getItem(positionsKey(id));
        if (raw === null) return [];
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        if (isLegacyArray(parsed)) {
            const migrated = migrateLegacy(parsed);
            localStorage.setItem(positionsKey(id), JSON.stringify(migrated));
            return migrated;
        }
        return parsed as Transaction[];
    } catch {
        return [];
    }
}

export function getActiveTransactions(): Transaction[] {
    return getTransactionsForSet(getActiveSetId());
}

/** Lot view (open + closed), derived from the transactions of a set. */
export function getPositionsForSet(id: string): RawPosition[] {
    if (id === DEMO_SET_ID) return DEMO_POSITIONS;
    return deriveLotsFromTransactions(getTransactionsForSet(id));
}

export function getActivePositions(): RawPosition[] {
    return getPositionsForSet(getActiveSetId());
}

export function isUsingDemoData(): boolean {
    return getActiveSetId() === DEMO_SET_ID;
}

// ── Writes ────────────────────────────────────────────────────

export function uniqueDisplayName(base: string): string {
    const existing = getStoredSets().map(s => s.display_name);
    if (!existing.includes(base)) return base;
    let n = 2;
    while (existing.includes(`${base} ${n}`)) n++;
    return `${base} ${n}`;
}

/** Imports raw transactions into a new set (or migrates legacy on the way in). */
export function importPositionSet(
    name: string,
    display_name: string,
    description: string,
    transactions: Transaction[] | LegacyRawPosition[],
    setAsActive: boolean
): PositionSetLocal {
    const stored = getStoredSets();
    const id = `set_${Date.now()}`;
    const now = new Date().toISOString();

    if (setAsActive) {
        stored.forEach(s => { s.is_active = false; });
        localStorage.setItem(ACTIVE_KEY, id);
    }

    const newSet: PositionSetLocal = {
        id,
        name,
        display_name,
        description,
        info_type: 'info',
        is_active: setAsActive,
        created_at: now,
        updated_at: now,
    };

    stored.push(newSet);
    saveStoredSets(stored);
    const finalTxs: Transaction[] = isLegacyArray(transactions)
        ? migrateLegacy(transactions)
        : (transactions as Transaction[]);
    localStorage.setItem(positionsKey(id), JSON.stringify(finalTxs));
    try { sessionStorage.setItem(JUST_IMPORTED_KEY, id); } catch { /* sessionStorage unavailable */ }
    return newSet;
}

export function activateSet(id: string): void {
    if (id === DEMO_SET_ID) {
        const stored = getStoredSets();
        stored.forEach(s => { s.is_active = false; });
        saveStoredSets(stored);
        localStorage.setItem(ACTIVE_KEY, DEMO_SET_ID);
        return;
    }
    const stored = getStoredSets();
    stored.forEach(s => { s.is_active = s.id === id; });
    saveStoredSets(stored);
    localStorage.setItem(ACTIVE_KEY, id);
}

/** Rename a set's display_name. The demo set is read-only and cannot be renamed. */
export function renameSet(id: string, displayName: string): void {
    if (id === DEMO_SET_ID) return;
    const name = displayName.trim();
    if (!name) return;
    const stored = getStoredSets();
    const s = stored.find(x => x.id === id);
    if (!s) return;
    s.display_name = name;
    s.updated_at = new Date().toISOString();
    saveStoredSets(stored);
}

export function deleteSet(id: string): void {
    if (id === DEMO_SET_ID) return;
    const stored = getStoredSets().filter(s => s.id !== id);
    localStorage.removeItem(positionsKey(id));
    saveStoredSets(stored);

    if (getActiveSetId() === id) {
        const next = stored.length > 0 ? stored[0].id : DEMO_SET_ID;
        localStorage.setItem(ACTIVE_KEY, next);
        if (stored.length > 0) {
            stored[0].is_active = true;
            saveStoredSets(stored);
        }
    }
}

/** Raw export — emits the new Transaction format. */
export function exportSetTransactions(id: string): Transaction[] {
    return getTransactionsForSet(id);
}

/** Bump a set's updated_at so "last updated" stays accurate after edits. */
function touchSet(id: string): void {
    if (id === DEMO_SET_ID) return;
    const stored = getStoredSets();
    const s = stored.find(x => x.id === id);
    if (s) {
        s.updated_at = new Date().toISOString();
        saveStoredSets(stored);
    }
}

/**
 * Append a transaction to a set. If acting on the demo set, promotes it to
 * a real "My Portfolio" set first. Returns the id of the set written to.
 */
export function addTransactionToSet(setId: string, tx: Transaction): string {
    if (setId !== DEMO_SET_ID) {
        const existing = getTransactionsForSet(setId);
        localStorage.setItem(positionsKey(setId), JSON.stringify([...existing, tx]));
        touchSet(setId);
        return setId;
    }
    const newSet = importPositionSet(
        'my-portfolio',
        uniqueDisplayName('My Portfolio'),
        'Started from demo data',
        [...DEMO_TRANSACTIONS, tx],
        true,
    );
    return newSet.id;
}

/**
 * Remove a transaction by its index in the on-disk array. Returns the removed
 * transaction and the set id written to (may differ on demo promotion).
 */
export function removeTransactionFromSet(setId: string, index: number): { removed: Transaction; actualSetId: string } | null {
    if (setId === DEMO_SET_ID) {
        const demo = getTransactionsForSet(DEMO_SET_ID);
        if (index < 0 || index >= demo.length) return null;
        const removed = demo[index];
        const remaining = [...demo.slice(0, index), ...demo.slice(index + 1)];
        const newSet = importPositionSet(
            'my-portfolio',
            uniqueDisplayName('My Portfolio'),
            'Started from demo data',
            remaining,
            true,
        );
        return { removed, actualSetId: newSet.id };
    }
    const txs = getTransactionsForSet(setId);
    if (index < 0 || index >= txs.length) return null;
    const removed = txs[index];
    const updated = [...txs.slice(0, index), ...txs.slice(index + 1)];
    localStorage.setItem(positionsKey(setId), JSON.stringify(updated));
    touchSet(setId);
    return { removed, actualSetId: setId };
}

export function insertTransactionIntoSet(setId: string, tx: Transaction, index: number): void {
    if (setId === DEMO_SET_ID) return;
    const txs = getTransactionsForSet(setId);
    const clamped = Math.max(0, Math.min(index, txs.length));
    const updated = [...txs.slice(0, clamped), tx, ...txs.slice(clamped)];
    localStorage.setItem(positionsKey(setId), JSON.stringify(updated));
    touchSet(setId);
}

// ── Internal helpers ──────────────────────────────────────────

function getStoredSets(): PositionSetLocal[] {
    try {
        const raw = localStorage.getItem(SETS_KEY);
        return raw ? JSON.parse(raw) : [];
    } catch {
        return [];
    }
}

function saveStoredSets(sets: PositionSetLocal[]): void {
    localStorage.setItem(SETS_KEY, JSON.stringify(sets));
}
