import { NextResponse } from 'next/server';
import { isValidSymbol, badRequest, cdnCache, expensiveRoutesDisabled, disabledResponse } from '../../../lib/server/requestGuards';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const symbol = searchParams.get('symbol');

    if (!symbol) {
        return NextResponse.json({ error: 'Symbol is required' }, { status: 400 });
    }
    if (!isValidSymbol(symbol)) return badRequest('Invalid symbol');
    if (expensiveRoutesDisabled()) return disabledResponse();

    try {
        const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`;
        const res = await fetch(url, {
            headers: { 'User-Agent': 'Mozilla/5.0' },
            signal: AbortSignal.timeout(5000),
        });

        if (!res.ok) {
            return NextResponse.json({ name: null });
        }

        const data = await res.json();
        const meta = data?.chart?.result?.[0]?.meta;
        const name = meta?.longName ?? meta?.shortName ?? null;

        // A ticker's name doesn't change; let the CDN keep it for a day.
        return NextResponse.json({ name }, { headers: cdnCache(86400, 604800) });
    } catch {
        return NextResponse.json({ name: null });
    }
}
