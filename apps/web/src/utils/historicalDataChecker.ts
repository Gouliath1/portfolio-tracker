// Client-side utility to check and automatically refresh missing historical data

interface HistoricalDataStatus {
    needsRefresh: boolean;
    missingDays: number;
    lastDataDate: string | null;
    reason: string;
}

/**
 * Check if historical data needs to be refreshed
 * This calls the server-side API to check database status
 * Gracefully handles errors and returns safe defaults
 */
export async function checkHistoricalDataStatus(): Promise<HistoricalDataStatus> {
    try {
        const response = await fetch('/api/historical-data/status');
        const data = await response.json();

        // Return the data regardless of response status
        // API will return appropriate status object
        return data;
    } catch (error) {
        console.warn('[checkHistoricalDataStatus] Unable to check status, returning safe defaults:', error);
        return {
            needsRefresh: true,
            missingDays: 0,
            lastDataDate: null,
            reason: 'Unable to connect to server'
        };
    }
}

/**
 * Automatically refresh historical data if needed
 * This should be called during page load
 */
export async function autoRefreshHistoricalDataIfNeeded(): Promise<boolean> {
    const status = await checkHistoricalDataStatus();
    
    console.log(`🔍 Historical data status: ${status.reason}`);
    
    if (!status.needsRefresh) {
        console.log(`✅ Historical data is current`);
        return false;
    }
    
    console.log(`🔄 Auto-refreshing historical data (missing ${status.missingDays} days)`);
    
    try {
        // Call the historical data refresh API
        const response = await fetch('/api/historical-data', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
        });

        const result = await response.json();

        // Check if the result indicates success
        if (result && !result.error) {
            console.log(`✅ Auto-refresh completed:`, result);
            return true;
        } else {
            console.warn(`⚠️ Auto-refresh returned with issues:`, result);
            return false;
        }

    } catch (error) {
        console.warn('[autoRefreshHistoricalDataIfNeeded] Auto-refresh failed:', error);
        return false;
    }
}
