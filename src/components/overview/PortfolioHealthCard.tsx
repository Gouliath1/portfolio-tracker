'use client';

import { Position } from '@portfolio/types';
import { Card } from './Card';

interface PortfolioHealthCardProps {
    positions: Position[];
    totalValueJPY: number;
}

const Metric = ({ value, label }: { value: string; label: string }) => (
    <div>
        <p className="text-xl font-semibold tabular-nums leading-none" style={{ color: 'var(--text-primary)' }}>
            {value}
        </p>
        <p className="text-xs mt-1.5" style={{ color: 'var(--text-muted)' }}>{label}</p>
    </div>
);

export const PortfolioHealthCard = ({ positions, totalValueJPY }: PortfolioHealthCardProps) => {
    const holdings = positions.filter(p => p.currentValueJPY > 0);
    const largestPct = totalValueJPY > 0
        ? (Math.max(0, ...holdings.map(p => p.currentValueJPY)) / totalValueJPY) * 100
        : 0;
    const brokers = new Set(holdings.map(p => p.broker).filter(Boolean)).size;
    const currencies = new Set(holdings.map(p => p.stockCcy).filter(Boolean)).size;

    return (
        <Card title="Portfolio Health">
            <div className="grid grid-cols-2 gap-x-4 gap-y-5">
                <Metric value={String(holdings.length)} label="Holdings" />
                <Metric value={`${largestPct.toFixed(0)}%`} label="Largest position" />
                <Metric value={String(brokers)} label={brokers === 1 ? 'Broker' : 'Brokers'} />
                <Metric value={String(currencies)} label={currencies === 1 ? 'Currency' : 'Currencies'} />
            </div>
        </Card>
    );
};
