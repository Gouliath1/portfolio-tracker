'use client';

import { Position } from '@portfolio/types';
import { Card } from './Card';

interface TopHoldingsCardProps {
    positions: Position[];
    totalValueJPY: number;
    formatValue: (amount: number, showValues: boolean) => string;
    showValues: boolean;
    limit?: number;
}

export const TopHoldingsCard = ({
    positions, totalValueJPY, formatValue, showValues, limit = 5,
}: TopHoldingsCardProps) => {
    const top = [...positions]
        .filter(p => p.currentValueJPY > 0)
        .sort((a, b) => b.currentValueJPY - a.currentValueJPY)
        .slice(0, limit);

    return (
        <Card title="Top Holdings">
            {top.length === 0 ? (
                <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No open holdings.</p>
            ) : (
                <div className="space-y-3">
                    {top.map(p => {
                        const pct = totalValueJPY > 0 ? (p.currentValueJPY / totalValueJPY) * 100 : 0;
                        const ret = p.totalReturnPercentage;
                        const retColor = ret >= 0 ? 'var(--pnl-green)' : 'var(--pnl-red)';
                        return (
                            <div key={`${p.ticker}-${p.account}`} className="flex items-center gap-3">
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                                        {p.fullName || String(p.ticker)}
                                    </p>
                                    <p className="text-xs tabular-nums" style={{ color: 'var(--text-muted)' }}>
                                        {String(p.ticker)} · {pct.toFixed(1)}%
                                    </p>
                                </div>
                                <div className="text-right flex-shrink-0">
                                    <p className="text-sm font-semibold tabular-nums" style={{ color: 'var(--text-primary)' }}>
                                        {formatValue(p.currentValueJPY, showValues)}
                                    </p>
                                    <p className="text-xs font-medium tabular-nums" style={{ color: retColor }}>
                                        {ret >= 0 ? '+' : ''}{ret.toFixed(1)}%
                                    </p>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </Card>
    );
};
