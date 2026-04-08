// Historical data is fetched lazily by the chart component via the Yahoo Finance proxy.
// No pre-refresh is needed.

export async function checkHistoricalDataStatus() {
    return { needsRefresh: false, missingDays: 0, lastDataDate: null, reason: 'Fetched on demand' };
}

export async function autoRefreshHistoricalDataIfNeeded(): Promise<boolean> {
    return false;
}
