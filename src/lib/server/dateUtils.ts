/**
 * Server-side date utilities.
 *
 * Uses the America/New_York timezone so that "last expected business day"
 * is computed relative to NYSE market hours rather than UTC.
 */

/**
 * Return the most recent weekday (Mon–Fri) in the America/New_York timezone
 * whose market close Yahoo Finance would already have.
 *
 * We start from yesterday (NYSE time) because today's close doesn't exist
 * until end-of-day, so treating today as "expected" triggers pointless
 * Yahoo refetches on every page load.
 */
export function lastExpectedBusinessDay(): string {
    const nyNow = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date());
    // Anchor at noon NY time to avoid DST edge-cases when constructing a Date.
    const d = new Date(nyNow + 'T12:00:00');
    d.setDate(d.getDate() - 1);
    while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() - 1);
    return d.toISOString().split('T')[0];
}
