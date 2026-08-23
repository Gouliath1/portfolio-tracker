import React from 'react';
import { useTranslation } from '../../../i18n';

interface ChartStateProps {
    height?: string;
}

export const LoadingState: React.FC<ChartStateProps> = ({ height = 'h-full' }) => {
    const { t } = useTranslation();
    return (
        <div className={`flex items-center justify-center ${height}`}>
            <div className="text-center space-y-3">
                <div
                    className="w-8 h-8 rounded-full border-2 border-t-transparent mx-auto animate-spin"
                    style={{ borderColor: 'var(--accent)', borderTopColor: 'transparent' }}
                />
                <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                    {t('chart.calculating')}
                </p>
            </div>
        </div>
    );
};

export const ErrorState: React.FC<ChartStateProps & { error: string }> = ({ height = 'h-full', error }) => {
    const { t } = useTranslation();
    return (
        <div className={`flex items-center justify-center ${height}`}>
            <div className="text-center space-y-1">
                <p className="font-medium" style={{ color: 'var(--pnl-red)' }}>{t('chart.errorLoading')}</p>
                <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{error}</p>
            </div>
        </div>
    );
};

export const NoDataState: React.FC<ChartStateProps> = ({ height = 'h-full' }) => {
    const { t } = useTranslation();
    return (
        <div className={`flex items-center justify-center ${height}`}>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                {t('chart.noDataForPeriod')}
            </p>
        </div>
    );
};
