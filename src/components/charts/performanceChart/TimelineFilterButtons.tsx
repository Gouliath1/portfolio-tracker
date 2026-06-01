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
        <div className="flex flex-wrap gap-1.5">
            {TIMELINE_BUTTONS.map(({ key, label }) => (
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
                    {label}
                </button>
            ))}
        </div>
    );
};
