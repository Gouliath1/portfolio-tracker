import React from 'react';
import { TimelineFilter, TIMELINE_BUTTONS } from './chartUtils';

interface TimelineFilterProps {
    selectedTimeline: TimelineFilter;
    onTimelineChange: (timeline: TimelineFilter) => void;
}

export const TimelineFilterButtons: React.FC<TimelineFilterProps> = ({
    selectedTimeline,
    onTimelineChange,
}) => {
    return (
        <div className="flex flex-wrap gap-2 mb-4 justify-center">
            {TIMELINE_BUTTONS.map(({ key, label }) => (
                <button
                    key={key}
                    onClick={() => onTimelineChange(key)}
                    className="px-3 py-1 rounded-lg text-xs font-medium transition-all"
                    style={selectedTimeline === key ? {
                        background: 'var(--accent-dim)',
                        color: 'var(--accent)',
                        border: '1px solid var(--accent-glow)',
                    } : {
                        background: 'var(--glass-bg)',
                        color: 'var(--text-muted)',
                        border: '1px solid var(--border)',
                    }}
                >
                    {label}
                </button>
            ))}
        </div>
    );
};
