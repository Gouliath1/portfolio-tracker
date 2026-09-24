'use client';

import { MdConstruction } from 'react-icons/md';
import { useTranslation } from '../../i18n';

interface WipBadgeProps {
    size?: 'sm' | 'md';
    className?: string;
}

/**
 * Marks a feature that's still being built — the tax estimates, currently.
 * Purely visual; the actual gating is the "Tax estimates (beta)" toggle in
 * Settings (useTaxFeatureEnabled). Kept as one component so every place that
 * flags WIP stays visually consistent and easy to find/remove later.
 */
export function WipBadge({ size = 'sm', className = '' }: WipBadgeProps) {
    const { t } = useTranslation();
    const isSm = size === 'sm';
    return (
        <span
            className={`inline-flex items-center gap-1 rounded-full font-semibold whitespace-nowrap ${isSm ? 'text-[10px] px-1.5 py-0.5' : 'text-xs px-2 py-1'} ${className}`}
            style={{ background: 'rgba(245, 158, 11, 0.16)', color: '#f59e0b', border: '1px solid rgba(245, 158, 11, 0.45)' }}
            title={t('common.wipTooltip')}
        >
            <MdConstruction size={isSm ? 10 : 12} />
            {t('common.wip')}
        </span>
    );
}
