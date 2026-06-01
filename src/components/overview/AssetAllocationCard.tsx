'use client';

import { Position } from '@portfolio/types';
import { Card } from './Card';
import { ASSET_CLASS_ORDER, colorForAssetClass } from './assetClassColors';

interface AssetAllocationCardProps {
    positions: Position[];
    assetClasses: Record<string, string>;
    totalValueJPY: number;
    symbol: string;
    showValues: boolean;
    isLoading?: boolean;
}

// Compact money for the donut center (e.g. ¥5.71M) so it always fits the hole.
const compactValue = (value: number, symbol: string, showValues: boolean): string => {
    if (!showValues) return `${symbol}•••`;
    const abs = Math.abs(value);
    if (abs >= 1e9) return `${symbol}${(value / 1e9).toFixed(2)}B`;
    if (abs >= 1e6) return `${symbol}${(value / 1e6).toFixed(2)}M`;
    if (abs >= 1e3) return `${symbol}${(value / 1e3).toFixed(0)}K`;
    return `${symbol}${Math.round(value)}`;
};

interface Segment {
    label: string;
    value: number;
    pct: number;
    color: string;
}

const SIZE = 168;
const STROKE = 22;
const RADIUS = (SIZE - STROKE) / 2;
const CIRC = 2 * Math.PI * RADIUS;

export const AssetAllocationCard = ({
    positions, assetClasses, totalValueJPY, symbol, showValues, isLoading,
}: AssetAllocationCardProps) => {
    // Sum current value per asset class. Tickers not yet classified bucket into
    // "Other" so the donut still renders while Yahoo lookups resolve.
    const totals = new Map<string, number>();
    for (const p of positions) {
        if (p.currentValueJPY <= 0) continue;
        const cls = assetClasses[String(p.ticker)] ?? 'Other';
        totals.set(cls, (totals.get(cls) ?? 0) + p.currentValueJPY);
    }

    const total = [...totals.values()].reduce((s, v) => s + v, 0);

    const segments: Segment[] = [...totals.entries()]
        .map(([label, value]) => ({
            label,
            value,
            pct: total > 0 ? (value / total) * 100 : 0,
            color: colorForAssetClass(label),
        }))
        .sort((a, b) => {
            const ai = ASSET_CLASS_ORDER.indexOf(a.label);
            const bi = ASSET_CLASS_ORDER.indexOf(b.label);
            if (ai !== bi) return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi);
            return b.value - a.value;
        });

    const hasData = segments.length > 0 && total > 0;

    // Accumulate dash offsets for each arc.
    let offset = 0;

    return (
        <Card title="Asset Allocation">
            <div className="flex items-center gap-4">
                {/* Donut */}
                <div className="relative flex-shrink-0" style={{ width: 124, height: 124 }}>
                    <svg
                        width="100%" height="100%" viewBox={`0 0 ${SIZE} ${SIZE}`}
                        style={{ transform: 'rotate(-90deg)' }}
                    >
                        {/* Track */}
                        <circle
                            cx={SIZE / 2} cy={SIZE / 2} r={RADIUS}
                            fill="none" stroke="var(--border)" strokeWidth={STROKE}
                        />
                        {hasData && segments.map(seg => {
                            const len = (seg.pct / 100) * CIRC;
                            const dash = `${len} ${CIRC - len}`;
                            const circle = (
                                <circle
                                    key={seg.label}
                                    cx={SIZE / 2} cy={SIZE / 2} r={RADIUS}
                                    fill="none" stroke={seg.color} strokeWidth={STROKE}
                                    strokeDasharray={dash} strokeDashoffset={-offset}
                                    strokeLinecap="butt"
                                />
                            );
                            offset += len;
                            return circle;
                        })}
                    </svg>
                    {/* Center label */}
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                        <span className="text-sm font-semibold tabular-nums leading-none"
                            style={{ color: 'var(--text-primary)' }}>
                            {isLoading && !hasData ? '—' : compactValue(totalValueJPY, symbol, showValues)}
                        </span>
                        <span className="text-[9px] uppercase tracking-widest mt-1"
                            style={{ color: 'var(--text-muted)' }}>
                            Total Value
                        </span>
                    </div>
                </div>

                {/* Legend */}
                <div className="flex-1 min-w-0 space-y-2">
                    {hasData ? segments.map(seg => (
                        <div key={seg.label} className="flex items-center gap-2 text-sm">
                            <span className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                                style={{ background: seg.color }} />
                            <span className="flex-1 min-w-0 truncate" style={{ color: 'var(--text-secondary)' }}>
                                {seg.label}
                            </span>
                            <span className="tabular-nums font-medium" style={{ color: 'var(--text-primary)' }}>
                                {seg.pct.toFixed(1)}%
                            </span>
                        </div>
                    )) : (
                        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                            {isLoading ? 'Classifying holdings…' : 'No holdings to allocate.'}
                        </p>
                    )}
                </div>
            </div>
        </Card>
    );
};
