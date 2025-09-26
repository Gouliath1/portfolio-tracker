// Check if we're running in a server context
function isServerSide(): boolean {
    return typeof window === 'undefined';
}

export async function getCachedFxRate(fxPair: string): Promise<number | null> {
    try {
        // In server-side context, we can't use relative URLs for fetch
        if (isServerSide()) {
            console.log(`⚠️ getCachedFxRate called in server context for ${fxPair}, skipping cache check`);
            return null;
        }
        
        const response = await fetch(`/api/fx-rates?pair=${encodeURIComponent(fxPair)}`);
        if (!response.ok) {
            console.error('Failed to fetch cached FX rate:', await response.text());
            return null;
        }
        const data = await response.json();
        
        if (data.rate !== null) {
            console.log(`${fxPair}: ${data.rate} (from cache)`);
        }
        
        return data.rate;
    } catch (error) {
        console.error('Error fetching cached FX rate:', error);
        return null;
    }
}

export async function updateFxRateCache(fxPair: string, rate: number): Promise<void> {
    try {
        // In server-side context, we can't use relative URLs for fetch
        if (isServerSide()) {
            console.log(`⚠️ updateFxRateCache called in server context for ${fxPair}, skipping cache update via API`);
            return;
        }
        
        const response = await fetch('/api/fx-rates', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ fxPair, rate }),
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
