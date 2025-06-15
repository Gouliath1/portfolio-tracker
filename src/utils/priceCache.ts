export async function getCachedPrice(symbol: string): Promise<number | null> {
    try {
        const response = await fetch(`/api/prices?symbol=${encodeURIComponent(symbol)}`);
        if (!response.ok) {
            console.error('Failed to fetch cached price:', await response.text());
            return null;
        }
        const data = await response.json();
        return data.price;
    } catch (error) {
        console.error('Error fetching cached price:', error);
        return null;
    }
}

export async function updatePriceCache(symbol: string, price: number): Promise<void> {
    try {
        const response = await fetch('/api/prices', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ symbol, price }),
        });
        
        if (!response.ok) {
            console.error('Failed to update price cache:', await response.text());
        }
    } catch (error) {
        console.error('Error updating price cache:', error);
    }
}
