/**
 * Tests for screener sort behaviour.
 *
 * Key invariant: empty/null values always sort to the BOTTOM regardless of
 * whether the user sorts ascending or descending. Previously, sorting descending
 * pushed null values to the TOP (because TanStack Table negates the comparator
 * for desc sorts and the null sentinel was not adjusted).
 *
 * The fix: numSort() reads the current sort direction from sortingRef and
 * returns an inverted sentinel so nulls always end up at the bottom.
 */

// ── Pure reproduction of numSort logic ───────────────────────────────────────
// We extract the comparison math so it can be tested without React/TanStack.

function makeNumSort(sortingState: { id: string; desc: boolean }[]) {
    // Simulates sortingRef.current
    const sortingRef = { current: sortingState };

    return function numSort(
        columnId: string,
        aVal: number | null,
        bVal: number | null,
    ): number {
        if (aVal == null && bVal == null) return 0;
        const desc = sortingRef.current.find(s => s.id === columnId)?.desc ?? false;
        if (aVal == null) return desc ? -1 : 1;
        if (bVal == null) return desc ? 1 : -1;
        return aVal - bVal;
    };
}

// TanStack Table applies `result * -1` for desc sorts.
function applyTableDesc(result: number, desc: boolean): number {
    return desc ? result * -1 : result;
}

describe('numSort — null values always at bottom', () => {
    describe('ascending (desc=false)', () => {
        const sort = makeNumSort([{ id: 'pe', desc: false }]);

        it('puts null after a real value', () => {
            const raw = sort('pe', null, 10);
            // TanStack uses result as-is for asc
            expect(applyTableDesc(raw, false)).toBeGreaterThan(0); // null goes after 10
        });

        it('puts real value before null', () => {
            const raw = sort('pe', 5, null);
            expect(applyTableDesc(raw, false)).toBeLessThan(0); // 5 goes before null
        });

        it('returns 0 for two nulls', () => {
            expect(sort('pe', null, null)).toBe(0);
        });

        it('sorts two real values numerically', () => {
            expect(sort('pe', 5, 10)).toBeLessThan(0); // 5 < 10
            expect(sort('pe', 10, 5)).toBeGreaterThan(0); // 10 > 5
        });
    });

    describe('descending (desc=true) — this was the bug', () => {
        const sort = makeNumSort([{ id: 'pe', desc: true }]);

        it('null after a real value even when TanStack negates', () => {
            const raw = sort('pe', null, 10);
            // TanStack negates: raw=-1 becomes +1 → null goes after 10 ✓
            expect(applyTableDesc(raw, true)).toBeGreaterThan(0);
        });

        it('real value before null even when TanStack negates', () => {
            const raw = sort('pe', 5, null);
            // TanStack negates: raw=+1 becomes -1 → 5 goes before null ✓
            expect(applyTableDesc(raw, true)).toBeLessThan(0);
        });

        it('sorts two real values in descending order', () => {
            // TanStack negates, so we return (a-b) and table flips it
            const raw = sort('pe', 10, 5);
            // raw = 5 (positive), after negation = -5 → 10 before 5 in desc ✓
            expect(applyTableDesc(raw, true)).toBeLessThan(0);
        });
    });

    describe('mixed table simulation', () => {
        it('null values end at the bottom in both directions', () => {
            const rows = [10, null, 5, null, 20, 1];

            // Ascending
            const sortAsc = makeNumSort([{ id: 'pe', desc: false }]);
            const sorted = [...rows].sort((a, b) => sortAsc('pe', a, b));
            expect(sorted).toEqual([1, 5, 10, 20, null, null]);

            // Descending — simulate TanStack's negation
            const sortDesc = makeNumSort([{ id: 'pe', desc: true }]);
            const sortedDesc = [...rows].sort((a, b) => {
                const r = sortDesc('pe', a, b);
                return r * -1; // TanStack negates for desc
            });
            expect(sortedDesc).toEqual([20, 10, 5, 1, null, null]);
        });
    });
});
