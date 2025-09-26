// Check if we're running in a server context
function isServerSide(): boolean {
    return typeof window === 'undefined';
}

export async function getCachedPrice(symbol: string): Promise<number | null> {
    try {
        // In server-side context, we can't use relative URLs for fetch
        if (isServerSide()) {
            console.log(`⚠️ getCachedPrice called in server context for ${symbol}, skipping cache check`);
            return null;
        }
        
        const response = await fetch(`/api/prices?symbol=${encodeURIComponent(symbol)}`);
        if (!response.ok) {
            console.error('Failed to fetch cached price:', await response.text());
            return null;
        }
        const data = await response.json();
        
        if (data.price !== null) {
            console.log(`${symbol}: ${data.price} (from cache)`);
        }
        
        return data.price;
    } catch (error) {
        console.error('Error fetching cached price:', error);
        return null;
    }
}

export async function updatePriceCache(symbol: string, price: number): Promise<void> {
    try {
        // In server-side context, we can't use relative URLs for fetch
        if (isServerSide()) {
            console.log(`⚠️ updatePriceCache called in server context for ${symbol}, skipping cache update via API`);
            return;
        }
        
        const response = await fetch('/api/prices', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ symbol, price }),
        });
        
        if (!response.ok) {
            console.error('Failed to update price cache:', await response.text());
        } else {
            console.log(`💾 Updated cache for ${symbol}: ${price}`);
        }
    } catch (error) {
        console.error('Error updating price cache:', error);
    }
}
