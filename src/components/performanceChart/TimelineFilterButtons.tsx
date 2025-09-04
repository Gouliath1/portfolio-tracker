import React from 'react';
import { TimelineFilter, TIMELINE_BUTTONS } from './chartUtils';

interface TimelineFilterProps {
    selectedTimeline: TimelineFilter;
    onTimelineChange: (timeline: TimelineFilter) => void;
}

export const TimelineFilterButtons: React.FC<TimelineFilterProps> = ({
    selectedTimeline,
    onTimelineChange
}) => {
    return (
        <div className="flex flex-wrap gap-2 mb-4 justify-center">
            {TIMELINE_BUTTONS.map(({ key, label }) => (
                <button
                    key={key}
                    onClick={() => onTimelineChange(key)}
                    className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${
                        selectedTimeline === key
                            ? 'bg-blue-600 text-white shadow-md'
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                >
                    {label}
                </button>
            ))}
        </div>
    );
};
