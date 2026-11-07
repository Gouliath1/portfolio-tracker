import React from 'react';
import { monthWindow, toISODate } from '@portfolio/core';
import { TimelineSelection, TIMELINE_BUTTONS } from './chartUtils';
import { useTranslation } from '../../../i18n';

interface TimelineFilterProps {
    selection: TimelineSelection;
    onSelectionChange: (selection: TimelineSelection) => void;
}

const buttonStyle = (active: boolean): React.CSSProperties => active
    ? { background: 'var(--accent-dim)', color: 'var(--accent)', border: '1px solid var(--accent-glow)' }
    : { color: 'var(--text-muted)', border: '1px solid var(--border)' };

/** Custom opens on last calendar month: the usual "what happened then" question. */
const defaultCustomRange = (): { from: string; to: string } => {
    const now = new Date();
    const w = monthWindow(now.getFullYear(), now.getMonth() - 1, now);
    return { from: toISODate(w.from), to: toISODate(w.to) };
};

export const TimelineFilterButtons: React.FC<TimelineFilterProps> = ({ selection, onSelectionChange }) => {
    const { t } = useTranslation();
    const custom = selection.timeline === 'Custom' ? selection.custom : undefined;
    const today = toISODate(new Date());

    const setCustom = (patch: Partial<{ from: string; to: string }>) =>
        onSelectionChange({ timeline: 'Custom', custom: { ...(custom ?? defaultCustomRange()), ...patch } });

    const inputClass = 'px-2 py-1 rounded-md text-xs';
    const inputStyle: React.CSSProperties = {
        background: 'var(--bg-base)', color: 'var(--text-primary)', border: '1px solid var(--border)',
    };

    return (
        <div className="flex flex-wrap items-center gap-1.5">
            {TIMELINE_BUTTONS.map(({ key, labelKey }) => (
                <button
                    key={key}
                    onClick={() => onSelectionChange({ timeline: key })}
                    className="px-2.5 py-1 rounded-md text-xs font-medium transition-all"
                    style={buttonStyle(selection.timeline === key)}
                >
                    {t(labelKey)}
                </button>
            ))}
            <button
                onClick={() => onSelectionChange({ timeline: 'Custom', custom: custom ?? defaultCustomRange() })}
                aria-pressed={selection.timeline === 'Custom'}
                className="px-2.5 py-1 rounded-md text-xs font-medium transition-all"
                style={buttonStyle(selection.timeline === 'Custom')}
            >
                {t('timeline.custom')}
            </button>
            {custom && (
                <span className="flex items-center gap-1.5">
                    <input type="date" value={custom.from} max={custom.to || today}
                        aria-label={t('timeline.from')} onChange={e => setCustom({ from: e.target.value })}
                        className={inputClass} style={inputStyle} />
                    <span style={{ color: 'var(--text-muted)' }}>–</span>
                    <input type="date" value={custom.to} min={custom.from} max={today}
                        aria-label={t('timeline.to')} onChange={e => setCustom({ to: e.target.value })}
                        className={inputClass} style={inputStyle} />
                </span>
            )}
        </div>
    );
};
