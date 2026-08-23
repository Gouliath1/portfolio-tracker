import { Position } from '@portfolio/types';
import type { TranslationKey } from '../../../i18n';

export type TimelineFilter = '1D' | '5D' | '1M' | '6M' | 'YTD' | '1Y' | '2Y' | '5Y' | 'All';

/**
 * The `key` is the internal timeline identity (never translated — it drives the
 * date maths and cache keys); `labelKey` is what the button shows.
 */
export const TIMELINE_BUTTONS: { key: TimelineFilter; labelKey: TranslationKey }[] = [
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

export const generateDateIntervals = (timeline: TimelineFilter, positions: Position[]): Date[] => {
    const now = new Date();
    const dates: Date[] = [];
    let startDate: Date;
    let interval: number; // in milliseconds

    switch (timeline) {
        case '1D':
            startDate = new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000);
            interval = 60 * 60 * 1000; // 1 hour intervals
            break;
        case '5D':
            startDate = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000);
            interval = 24 * 60 * 60 * 1000; // 1 day intervals
            break;
        case '1M':
            startDate = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
            interval = 24 * 60 * 60 * 1000; // 1 day intervals
            break;
        case '6M':
            startDate = new Date(now.getFullYear(), now.getMonth() - 6, now.getDate());
            interval = 7 * 24 * 60 * 60 * 1000; // 1 week intervals
            break;
        case 'YTD':
            startDate = new Date(now.getFullYear(), 0, 1);
            interval = 7 * 24 * 60 * 60 * 1000; // 1 week intervals
            break;
        case '1Y':
            startDate = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
            interval = 30 * 24 * 60 * 60 * 1000; // 1 month intervals
            break;
        case '2Y':
            startDate = new Date(now.getFullYear() - 2, now.getMonth(), now.getDate());
            interval = 30 * 24 * 60 * 60 * 1000; // 1 month intervals
            break;
        case '5Y':
            startDate = new Date(now.getFullYear() - 5, now.getMonth(), now.getDate());
            interval = 90 * 24 * 60 * 60 * 1000; // 3 month intervals
            break;
        case 'All':
        default:
            // For 'All', use transaction dates as reference points but with regular intervals
            const sortedPositions = [...positions].sort((a, b) => 
                new Date(a.transactionDate).getTime() - new Date(b.transactionDate).getTime()
            );
            if (sortedPositions.length === 0) return [];
            
            startDate = new Date(sortedPositions[0].transactionDate);
            interval = 30 * 24 * 60 * 60 * 1000; // 1 month intervals
            break;
    }

    // Generate dates from startDate to now with the specified interval
    let currentDate = new Date(startDate);
    while (currentDate <= now) {
        dates.push(new Date(currentDate));
        currentDate = new Date(currentDate.getTime() + interval);
    }

    // Always include the current date as the last point if it's not already included
    if (dates.length === 0 || dates[dates.length - 1].getTime() < now.getTime() - interval / 2) {
        dates.push(new Date(now));
    }

    return dates;
};

export const formatDateLabel = (date: Date, timeline: TimelineFilter, locale = 'en-US'): string => {
    switch (timeline) {
        case '1D':
            return date.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
        case '5D':
        case '1M':
            return date.toLocaleDateString(locale, { month: 'short', day: 'numeric' });
        case '6M':
        case 'YTD':
        case '1Y':
        case '2Y':
            return date.toLocaleDateString(locale, { month: 'short', day: 'numeric' });
        case '5Y':
        case 'All':
        default:
            return date.toLocaleDateString(locale, { year: 'numeric', month: 'short' });
    }
};

export const getIntervalForTimeline = (timeline: TimelineFilter): number => {
    switch (timeline) {
        case '1D':
            return 60 * 60 * 1000; // 1 hour
        case '5D':
        case '1M':
            return 24 * 60 * 60 * 1000; // 1 day
        case '6M':
        case 'YTD':
        case '1Y':
        case '2Y':
            return 7 * 24 * 60 * 60 * 1000; // 1 week
        default:
            return 30 * 24 * 60 * 60 * 1000; // 1 month
    }
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
