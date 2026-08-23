'use client';

import { Position } from '@portfolio/types';
import { Card } from './Card';
import { useTranslation } from '../../i18n';

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
    const { t } = useTranslation();
    const holdings = positions.filter(p => p.currentValueJPY > 0);
    const largestPct = totalValueJPY > 0
        ? (Math.max(0, ...holdings.map(p => p.currentValueJPY)) / totalValueJPY) * 100
        : 0;
    const brokers = new Set(holdings.map(p => p.broker).filter(Boolean)).size;
    const currencies = new Set(holdings.map(p => p.stockCcy).filter(Boolean)).size;

    return (
        <Card title={t('overview.portfolioHealth')}>
            <div className="grid grid-cols-2 gap-x-4 gap-y-5">
                <Metric value={String(holdings.length)} label={t('overview.holdings')} />
                <Metric value={`${largestPct.toFixed(0)}%`} label={t('overview.largestPosition')} />
                <Metric value={String(brokers)} label={t(brokers === 1 ? 'overview.broker' : 'overview.brokers')} />
                <Metric value={String(currencies)} label={t(currencies === 1 ? 'overview.currency' : 'overview.currencies')} />
            </div>
        </Card>
    );
};
