/**
 * Client-side localStorage store for position sets and positions.
 * Replaces the server-side SQLite database for multi-user safety.
 */

import { RawPosition } from '@portfolio/types';
import { DEMO_POSITIONS, DEMO_SET, DEMO_SET_ID } from '../data/demoPositions';

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

const positionsKey = (id: string) => `pt_positions_${id}`;

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

export function getPositionsForSet(id: string): RawPosition[] {
    if (id === DEMO_SET_ID) return DEMO_POSITIONS;
    try {
        const raw = localStorage.getItem(positionsKey(id));
        return raw ? JSON.parse(raw) : DEMO_POSITIONS;
    } catch {
        return DEMO_POSITIONS;
    }
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

export function importPositionSet(
    name: string,
    display_name: string,
    description: string,
    positions: RawPosition[],
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
    localStorage.setItem(positionsKey(id), JSON.stringify(positions));
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

export function exportSetPositions(id: string): RawPosition[] {
    return getPositionsForSet(id);
}

/**
 * Removes a position from a set by index.
 * If the active set is the demo, promotes it to "My Portfolio" first (same
 * pattern as addPositionToSet), then removes. Returns the actual set ID written
 * to (may differ from the input when demo promotion occurs) and the removed position.
 */
export function removePositionFromSet(setId: string, index: number): { removedPosition: RawPosition; actualSetId: string } | null {
    if (setId === DEMO_SET_ID) {
        const demoPositions = getPositionsForSet(DEMO_SET_ID);
        if (index < 0 || index >= demoPositions.length) return null;
        const removed = demoPositions[index];
        const remaining = [...demoPositions.slice(0, index), ...demoPositions.slice(index + 1)];
        const displayName = uniqueDisplayName('My Portfolio');
        const newSet = importPositionSet(
            'my-portfolio',
            displayName,
            'Started from demo data',
            remaining,
            true,
        );
        return { removedPosition: removed, actualSetId: newSet.id };
    }
    const positions = getPositionsForSet(setId);
    if (index < 0 || index >= positions.length) return null;
    const removed = positions[index];
    const updated = [...positions.slice(0, index), ...positions.slice(index + 1)];
    localStorage.setItem(positionsKey(setId), JSON.stringify(updated));
    return { removedPosition: removed, actualSetId: setId };
}

export function insertPositionIntoSet(setId: string, position: RawPosition, index: number): void {
    if (setId === DEMO_SET_ID) return;
    const positions = getPositionsForSet(setId);
    const clamped = Math.max(0, Math.min(index, positions.length));
    const updated = [...positions.slice(0, clamped), position, ...positions.slice(clamped)];
    localStorage.setItem(positionsKey(setId), JSON.stringify(updated));
}

/**
 * Adds a position to a set.
 * If the active set is the demo, promotes it: clones the demo positions into a
 * new real set ("My Portfolio"), activates it, then appends the new position.
 * Returns the id of the set that was written to.
 */
export function addPositionToSet(id: string, position: RawPosition): string {
    if (id !== DEMO_SET_ID) {
        const existing = getPositionsForSet(id);
        localStorage.setItem(positionsKey(id), JSON.stringify([...existing, position]));
        return id;
    }

    // Promote demo → real set
    const newSet = importPositionSet(
        'my-portfolio',
        uniqueDisplayName('My Portfolio'),
        'Started from demo data',
        [...DEMO_POSITIONS, position],
        true,
    );
    return newSet.id;
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
