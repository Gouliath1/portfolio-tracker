/**
 * Date windows: the one place that turns "last month", "September", "the 2
 * weeks before that" or "5y" into concrete dates.
 *
 * Pure and dependency-free, so the dashboard chart, the market-data API routes
 * and the AI chat tools all agree on what a period means instead of each
 * keeping its own table of trailing ranges.
 *
 * A window is two real dates. Nothing here assumes it ends today: any past
 * period is as expressible as a trailing one.
 */

export interface DateWindow {
    from: Date;
    to: Date;
}

/** Trailing periods the UI offers as one-click presets. */
export type WindowPreset = '1D' | '5D' | '1M' | '6M' | 'YTD' | '1Y' | '2Y' | '5Y';

const DAY_MS = 24 * 60 * 60 * 1000;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

// ── ISO dates ───────────────────────────────────────────────────────────────

/** `YYYY-MM-DD` → local-midnight Date; null when malformed or not a real day. */
export function parseISODate(s: unknown): Date | null {
    const m = typeof s === 'string' ? ISO_DATE.exec(s) : null;
    if (!m) return null;
    const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
    const date = new Date(y, mo - 1, d);
    return date.getFullYear() === y && date.getMonth() === mo - 1 && date.getDate() === d ? date : null;
}

/** Local calendar date as `YYYY-MM-DD` (what the date inputs and caches use). */
export function toISODate(d: Date): string {
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// ── Building windows ────────────────────────────────────────────────────────

/** Last `n` days / months / years up to `now`. */
export function trailingWindow(n: number, unit: 'd' | 'm' | 'y', now: Date = new Date()): DateWindow {
    const from = new Date(now);
    if (unit === 'd') from.setDate(from.getDate() - n);
    else if (unit === 'm') from.setMonth(from.getMonth() - n);
    else from.setFullYear(from.getFullYear() - n);
    return { from, to: new Date(now) };
}

export function presetWindow(preset: WindowPreset, now: Date = new Date()): DateWindow {
    switch (preset) {
        case '1D': return trailingWindow(1, 'd', now);
        case '5D': return trailingWindow(5, 'd', now);
        case '1M': return trailingWindow(1, 'm', now);
        case '6M': return trailingWindow(6, 'm', now);
        case 'YTD': return { from: new Date(now.getFullYear(), 0, 1), to: new Date(now) };
        case '1Y': return trailingWindow(1, 'y', now);
        case '2Y': return trailingWindow(2, 'y', now);
        case '5Y': return trailingWindow(5, 'y', now);
    }
}

/** A whole calendar month; the current month ends at `now`, not in the future. */
export function monthWindow(year: number, monthIndex: number, now: Date = new Date()): DateWindow {
    const from = new Date(year, monthIndex, 1);
    const end = new Date(year, monthIndex + 1, 0, 23, 59, 59, 999);
    return { from, to: end > now ? new Date(now) : end };
}

/**
 * A window between two ISO dates, inclusive. Null when either date is
 * malformed or the order is reversed. `to` is clamped to `now` so a future end
 * date can't ask for data that does not exist.
 */
export function windowBetween(from: unknown, to: unknown, now: Date = new Date()): DateWindow | null {
    const start = parseISODate(from);
    const endDay = parseISODate(to);
    if (!start || !endDay || endDay < start) return null;
    const end = new Date(endDay.getFullYear(), endDay.getMonth(), endDay.getDate(), 23, 59, 59, 999);
    return { from: start, to: end > now ? new Date(now) : end };
}

/**
 * The API routes' `range` token (`30d`, `1y`, `max`) as a window ending now;
 * null when it isn't one. `max` reaches back 30 years, as the routes always did.
 */
export function windowFromRangeToken(range: unknown, now: Date = new Date()): DateWindow | null {
    if (range === 'max') return trailingWindow(30, 'y', now);
    const m = typeof range === 'string' ? /^(\d{1,3})([dy])$/.exec(range) : null;
    return m ? trailingWindow(Number(m[1]), m[2] as 'd' | 'y', now) : null;
}

/** First date of a `range` token, as ISO. Falls back to today for an unknown token. */
export function rangeStartISO(range: string, now: Date = new Date()): string {
    return toISODate((windowFromRangeToken(range, now) ?? { from: now }).from);
}

/**
 * The smallest `range` token whose trailing window still reaches back to
 * `from`. For asking a route that only understands "last N days" about an
 * earlier period.
 */
export function rangeTokenReaching(from: Date, now: Date = new Date()): string {
    const days = Math.max(1, Math.ceil((now.getTime() - from.getTime()) / DAY_MS) + 1);
    return days <= 999 ? `${days}d` : `${Math.min(99, Math.ceil(days / 365))}y`;
}

// ── Sampling ────────────────────────────────────────────────────────────────

export function spanDays(w: DateWindow): number {
    return (w.to.getTime() - w.from.getTime()) / DAY_MS;
}

/**
 * How far apart to sample points so a window of any length stays readable and
 * affordable to compute: hourly for a day, daily to ~6 weeks, weekly to ~6
 * months, monthly to ~3 years, then quarterly.
 */
export function stepMs(w: DateWindow): number {
    const days = spanDays(w);
    if (days <= 1) return DAY_MS / 24;
    if (days <= 45) return DAY_MS;
    if (days <= 200) return 7 * DAY_MS;
    if (days <= 1100) return 30 * DAY_MS;
    return 90 * DAY_MS;
}

/** Evenly stepped dates across the window; the last one is always `to`. */
export function windowDates(w: DateWindow): Date[] {
    const step = stepMs(w);
    const dates: Date[] = [];
    for (let t = w.from.getTime(); t <= w.to.getTime(); t += step) dates.push(new Date(t));
    const last = dates[dates.length - 1];
    if (!last || last.getTime() < w.to.getTime() - step / 2) dates.push(new Date(w.to));
    return dates;
}

// ── Series ──────────────────────────────────────────────────────────────────

const BASELINE_LOOKBACK_DAYS = 7;

/**
 * Rows (`[ISO date, …]`) inside the window, ordered by date.
 *
 * When `baseline` is set, the last row before `from` (within a week) is kept
 * as the first one, so a window's change is measured from the prior close the
 * way a monthly return conventionally is, not from the first day's close.
 */
export function clipByDate<T>(rows: [string, T][], w: DateWindow, baseline = false): [string, T][] {
    const from = toISODate(w.from);
    const to = toISODate(w.to);
    const sorted = [...rows].sort(([a], [b]) => a.localeCompare(b));
    const inside = sorted.filter(([d]) => d >= from && d <= to);
    if (!baseline) return inside;

    const floor = toISODate(new Date(w.from.getTime() - BASELINE_LOOKBACK_DAYS * DAY_MS));
    const prior = sorted.filter(([d]) => d < from && d >= floor).pop();
    return prior ? [prior, ...inside] : inside;
}
