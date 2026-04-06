// Check if we're running in a server context
function isServerSide(): boolean {
    return typeof window === 'undefined';
}

// Returns today's date in YYYY-MM-DD (local time, previous calendar day after market close is fine)
function todayDate(): string {
    const d = new Date();
    return d.toISOString().split('T')[0];
}

export async function getCachedFxRate(fxPair: string): Promise<number | null> {
    try {
        if (isServerSide()) {
            console.log(`⚠️ getCachedFxRate called in server context for ${fxPair}, skipping cache check`);
            return null;
        }

        // Always look up by today's date so we only serve same-day cached rates
        const date = todayDate();
        const response = await fetch(`/api/fx-rates?pair=${encodeURIComponent(fxPair)}&date=${date}`);
        if (!response.ok) {
            console.error('Failed to fetch cached FX rate:', await response.text());
            return null;
        }
        const data = await response.json();

        // Only accept the cached rate if it is from today — reject stale dates
        if (data.rate !== null && data.date === date) {
            console.log(`${fxPair}: ${data.rate} (from cache, date: ${data.date})`);
            return data.rate;
        }

        return null;
    } catch (error) {
        console.error('Error fetching cached FX rate:', error);
        return null;
    }
}

export async function updateFxRateCache(fxPair: string, rate: number): Promise<void> {
    try {
        if (isServerSide()) {
            console.log(`⚠️ updateFxRateCache called in server context for ${fxPair}, skipping cache update via API`);
            return;
        }

        const response = await fetch('/api/fx-rates', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            // Always store with today's date so staleness can be detected on next load
            body: JSON.stringify({ fxPair, rate, date: todayDate() }),
        });
        
        if (!response.ok) {
            console.error('Failed to update FX rate cache:', await response.text());
        } else {
            console.log(`✅ FX rate updated: ${fxPair} = ${rate}`);
        }
    } catch (error) {
        console.error('Error updating FX rate cache:', error);
    }
}
