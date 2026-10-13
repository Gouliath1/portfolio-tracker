/**
 * The trading day a timestamp belongs to: its America/New_York calendar date,
 * with weekends rolled back to Friday (there is no Saturday/Sunday close).
 *
 * Shared by the server (cache freshness) and the screener UI (stale badges) so
 * both agree on what "today's data" means: a price fetched any time on a
 * market day is current until the next market day starts.
 */
// Built once: constructing an Intl.DateTimeFormat per call is slow, and the
// screener checks every visible row on each render.
const NY_DATE = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' });

export function marketDay(at: Date | string | number = new Date()): string {
    const nyDate = NY_DATE.format(new Date(at));
    const d = new Date(nyDate + 'T12:00:00Z');
    while (d.getUTCDay() === 0 || d.getUTCDay() === 6) d.setUTCDate(d.getUTCDate() - 1);
    return d.toISOString().split('T')[0];
}

/** True when a price fetched at `fetchedAt` is from an earlier market day than `now`. */
export function isPriceStale(fetchedAt: string | null | undefined, now: Date | number = new Date()): boolean {
    if (!fetchedAt) return true;
    return marketDay(fetchedAt) !== marketDay(now);
}
