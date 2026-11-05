import {
    clipByDate, monthWindow, parseISODate, presetWindow, rangeStartISO, rangeTokenReaching,
    spanDays, stepMs, toISODate, trailingWindow, windowBetween, windowDates, windowFromRangeToken,
} from '../../src/lib/core/dateWindow';

const NOW = new Date(2026, 10, 5, 12); // 5 Nov 2026
const iso = (d: Date) => toISODate(d);

describe('ISO dates', () => {
    it('round-trips and rejects impossible days', () => {
        expect(iso(parseISODate('2026-09-30')!)).toBe('2026-09-30');
        expect(parseISODate('2026-02-30')).toBeNull();
        expect(parseISODate('2026-9-3')).toBeNull();
        expect(parseISODate(20260930)).toBeNull();
    });
});

describe('windows', () => {
    it('builds trailing and preset windows ending now', () => {
        expect(iso(trailingWindow(14, 'd', NOW).from)).toBe('2026-10-22');
        expect(iso(presetWindow('1M', NOW).from)).toBe('2026-10-05');
        expect(iso(presetWindow('YTD', NOW).from)).toBe('2026-01-01');
    });

    it('builds a whole past calendar month', () => {
        const sep = monthWindow(2026, 8, NOW);
        expect([iso(sep.from), iso(sep.to)]).toEqual(['2026-09-01', '2026-09-30']);
    });

    it('ends the current month at now, not in the future', () => {
        const nov = monthWindow(2026, 10, NOW);
        expect(nov.to.getTime()).toBe(NOW.getTime());
    });

    it('builds a window between dates, inclusive of the end day', () => {
        const w = windowBetween('2026-10-01', '2026-10-14', NOW)!;
        expect([iso(w.from), iso(w.to)]).toEqual(['2026-10-01', '2026-10-14']);
        expect(spanDays(w)).toBeCloseTo(14, 0);
    });

    it('clamps a future end and rejects bad or reversed input', () => {
        expect(windowBetween('2026-10-01', '2027-01-01', NOW)!.to.getTime()).toBe(NOW.getTime());
        expect(windowBetween('2026-10-14', '2026-10-01', NOW)).toBeNull();
        expect(windowBetween('nope', '2026-10-01', NOW)).toBeNull();
    });

    it('reads the routes\' range tokens', () => {
        expect(iso(windowFromRangeToken('60d', NOW)!.from)).toBe('2026-09-06');
        expect(iso(windowFromRangeToken('max', NOW)!.from)).toBe('1996-11-05');
        expect(windowFromRangeToken('banana', NOW)).toBeNull();
        expect(rangeStartISO('1y', NOW)).toBe('2025-11-05');
    });

    it('picks a range token that reaches back to a date', () => {
        expect(rangeTokenReaching(parseISODate('2026-09-01')!, NOW)).toBe('67d');
        expect(rangeTokenReaching(parseISODate('2020-01-01')!, NOW)).toBe('7y');
    });
});

describe('sampling', () => {
    it('chooses a step from the span', () => {
        const step = (days: number) => stepMs(trailingWindow(days, 'd', NOW)) / 86_400_000;
        expect([step(1), step(14), step(31), step(120), step(730), step(2000)]).toEqual([1 / 24, 1, 1, 7, 30, 90]);
    });

    it('always ends on the last day', () => {
        const w = windowBetween('2026-10-01', '2026-10-14', NOW)!;
        const dates = windowDates(w);
        expect(iso(dates[0])).toBe('2026-10-01');
        expect(dates[dates.length - 1].getTime()).toBeGreaterThanOrEqual(w.to.getTime() - 43_200_000);
    });
});

describe('clipByDate', () => {
    const rows: [string, number][] = [['2026-08-27', 1], ['2026-08-31', 2], ['2026-09-10', 3], ['2026-09-30', 4], ['2026-10-02', 5]];
    const sep = windowBetween('2026-09-01', '2026-09-30', NOW)!;

    it('keeps only rows inside the window', () => {
        expect(clipByDate(rows, sep).map(r => r[0])).toEqual(['2026-09-10', '2026-09-30']);
    });

    it('prepends the prior close as a baseline', () => {
        expect(clipByDate(rows, sep, true).map(r => r[0])).toEqual(['2026-08-31', '2026-09-10', '2026-09-30']);
    });

    it('ignores a baseline more than a week before', () => {
        expect(clipByDate([['2026-08-01', 9], ['2026-09-10', 3]], sep, true)).toEqual([['2026-09-10', 3]]);
    });
});
