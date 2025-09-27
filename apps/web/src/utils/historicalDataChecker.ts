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
 */
export async function checkHistoricalDataStatus(): Promise<HistoricalDataStatus> {
    try {
        const response = await fetch('/api/historical-data/status');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        return await response.json();
    } catch (error) {
        console.error('Error checking historical data status:', error);
        return {
            needsRefresh: true,
            missingDays: 0,
            lastDataDate: null,
            reason: 'Error checking data status'
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
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const result = await response.json();
        console.log(`✅ Auto-refresh completed:`, result);
        return true;
        
    } catch (error) {
        console.error('❌ Auto-refresh failed:', error);
        return false;
    }
}
