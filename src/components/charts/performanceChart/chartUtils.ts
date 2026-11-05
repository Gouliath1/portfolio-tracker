import { Position } from '@portfolio/types';
import { presetWindow, spanDays, windowBetween, type DateWindow, type WindowPreset } from '@portfolio/core';
import type { TranslationKey } from '../../../i18n';

export type TimelineFilter = WindowPreset | 'All' | 'Custom';

/**
 * The `key` is the internal timeline identity (never translated — it drives the
 * date maths and cache keys); `labelKey` is what the button shows.
 */
export const TIMELINE_BUTTONS: { key: Exclude<TimelineFilter, 'Custom'>; labelKey: TranslationKey }[] = [
    { key: '1D', labelKey: 'timeline.1d' },
    { key: '5D', labelKey: 'timeline.5d' },
    { key: '1M', labelKey: 'timeline.1m' },
    { key: '6M', labelKey: 'timeline.6m' },
    { key: 'YTD', labelKey: 'timeline.ytd' },
    { key: '1Y', labelKey: 'timeline.1y' },
    { key: '2Y', labelKey: 'timeline.2y' },
    { key: '5Y', labelKey: 'timeline.5y' },
    { key: 'All', labelKey: 'timeline.all' }
];

/** A selected period: a preset button, "All", or a user-picked date range. */
export interface TimelineSelection {
    timeline: TimelineFilter;
    /** ISO dates; only meaningful when `timeline` is 'Custom'. */
    custom?: { from: string; to: string };
}

/** Stable identity of a selection, for cache keys. */
export const selectionKey = ({ timeline, custom }: TimelineSelection): string =>
    timeline === 'Custom' && custom ? `Custom_${custom.from}_${custom.to}` : timeline;

/**
 * The concrete dates a selection covers, or null when it has none yet ("All"
 * with no positions, or a custom range that isn't valid).
 */
export const resolveWindow = (
    { timeline, custom }: TimelineSelection,
    positions: Position[],
    now: Date = new Date(),
): DateWindow | null => {
    if (timeline === 'Custom') return custom ? windowBetween(custom.from, custom.to, now) : null;
    if (timeline === 'All') {
        const first = positions.map(p => new Date(p.transactionDate).getTime()).filter(Number.isFinite);
        return first.length === 0 ? null : { from: new Date(Math.min(...first)), to: new Date(now) };
    }
    return presetWindow(timeline, now);
};

/** Axis label granularity follows the span, so any window reads sensibly. */
export const formatDateLabel = (date: Date, dateWindow: DateWindow, locale = 'en-US'): string => {
    const days = spanDays(dateWindow);
    if (days <= 1) return date.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
    if (days <= 900) return date.toLocaleDateString(locale, { month: 'short', day: 'numeric' });
    return date.toLocaleDateString(locale, { year: 'numeric', month: 'short' });
};

export const getTransactionsNearDate = (
    positions: Position[], 
    targetDate: Date, 
    intervalMs: number
): Position[] => {
    const halfInterval = intervalMs / 2;
    const startRange = new Date(targetDate.getTime() - halfInterval);
    const endRange = new Date(targetDate.getTime() + halfInterval);
    
    return positions.filter(pos => {
        const posDate = new Date(pos.transactionDate);
        return posDate >= startRange && posDate <= endRange;
    });
};
