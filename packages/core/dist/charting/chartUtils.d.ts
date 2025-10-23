import { Position } from '@portfolio/types';
export type TimelineFilter = '1D' | '5D' | '1M' | '6M' | 'YTD' | '1Y' | '2Y' | '5Y' | 'All';
export declare const TIMELINE_BUTTONS: {
    key: TimelineFilter;
    label: string;
}[];
export declare const getIntervalForTimeline: (timeline: TimelineFilter) => number;
export declare const generateDateIntervals: (timeline: TimelineFilter, positions: Position[]) => Date[];
export declare const formatDateLabel: (date: Date, timeline: TimelineFilter) => string;
export declare const getTransactionsNearDate: (positions: Position[], targetDate: Date, intervalMs: number) => Position[];
