import React from 'react';
import { TimelineFilter, TIMELINE_BUTTONS } from './chartUtils';
import { useTranslation } from '../../../i18n';

interface TimelineFilterProps {
    selectedTimeline: TimelineFilter;
    onTimelineChange: (timeline: TimelineFilter) => void;
}

export const TimelineFilterButtons: React.FC<TimelineFilterProps> = ({
    selectedTimeline,
    onTimelineChange,
}) => {
    const { t } = useTranslation();

    return (
        <div className="flex flex-wrap gap-1.5">
            {TIMELINE_BUTTONS.map(({ key, labelKey }) => (
                <button
                    key={key}
                    onClick={() => onTimelineChange(key)}
                    className="px-2.5 py-1 rounded-md text-xs font-medium transition-all"
                    style={selectedTimeline === key ? {
                        background: 'var(--accent-dim)',
                        color: 'var(--accent)',
                        border: '1px solid var(--accent-glow)',
                    } : {
                        color: 'var(--text-muted)',
                        border: '1px solid var(--border)',
                    }}
                >
                    {t(labelKey)}
                </button>
            ))}
        </div>
    );
};
