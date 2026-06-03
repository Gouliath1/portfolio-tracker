'use client';

import { colorForAssetClass } from './assetClassColors';

interface AssetClassFilterProps {
    // Asset classes present in the portfolio, in display order.
    present: string[];
    // null = all classes shown; otherwise the explicit subset that's enabled.
    selected: string[] | null;
    onChange: (next: string[] | null) => void;
}

// Toggle-chip row that scopes the whole overview to a subset of asset classes.
// Hidden when there's nothing to choose between (0 or 1 class present).
export const AssetClassFilter = ({ present, selected, onChange }: AssetClassFilterProps) => {
    if (present.length <= 1) return null;

    const allActive = selected === null;
    const isActive = (c: string) => allActive || selected!.includes(c);

    const toggle = (c: string) => {
        const current = allActive ? [...present] : present.filter(x => selected!.includes(x));
        const next = current.includes(c) ? current.filter(x => x !== c) : [...current, c];
        // Empty or full selection both collapse to "All" — never leave an empty chart.
        onChange(next.length === 0 || next.length === present.length ? null : next);
    };

    return (
        <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-medium uppercase tracking-widest mr-1"
                style={{ color: 'var(--text-muted)' }}>
                Assets
            </span>

            <button
                onClick={() => onChange(null)}
                className="px-2.5 py-1 rounded-full text-xs font-medium transition-all"
                style={allActive
                    ? { background: 'var(--accent-dim)', color: 'var(--accent)', border: '1px solid var(--accent-glow)' }
                    : { color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
            >
                All
            </button>

            {present.map(c => {
                const on = isActive(c);
                return (
                    <button
                        key={c}
                        onClick={() => toggle(c)}
                        aria-pressed={on}
                        className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-all"
                        style={on
                            ? { background: 'var(--surface-popover)', color: 'var(--text-primary)', border: '1px solid var(--border-strong)' }
                            : { color: 'var(--text-muted)', border: '1px solid var(--border)', opacity: 0.6 }}
                    >
                        <span className="w-2 h-2 rounded-full"
                            style={{ background: colorForAssetClass(c), opacity: on ? 1 : 0.4 }} />
                        {c}
                    </button>
                );
            })}
        </div>
    );
};
