import { NextResponse } from 'next/server';
import { resolveAssetClasses } from '@portfolio/server';

// Returns a { ticker: assetClass } map for the requested tickers. Asset class
// is sourced from Yahoo (meta.instrumentType) on first request and cached in
// the DB thereafter, so subsequent loads are a single local query.
export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const tickersParam = searchParams.get('tickers');

    if (!tickersParam) {
        return NextResponse.json({ assetClasses: {} });
    }

    const tickers = tickersParam.split(',').map(t => t.trim()).filter(Boolean);

    try {
        const assetClasses = await resolveAssetClasses(tickers);
        return NextResponse.json({ assetClasses });
    } catch (error) {
        console.error('Error resolving asset classes:', error);
        return NextResponse.json({ assetClasses: {} });
    }
}
