import { NextResponse } from 'next/server';
import { resolveAssetClasses } from '@portfolio/server';
import { parseSymbols, badRequest, cdnCache, expensiveRoutesDisabled, disabledResponse } from '../../../lib/server/requestGuards';

// Returns a { ticker: assetClass } map for the requested tickers. Asset class
// is sourced from Yahoo (meta.instrumentType) on first request and cached in
// the DB thereafter, so subsequent loads are a single local query.
export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const tickersParam = searchParams.get('tickers');

    if (!tickersParam) {
        return NextResponse.json({ assetClasses: {} });
    }

    // One Yahoo call per unknown ticker, so the list is capped and validated.
    const parsed = parseSymbols(tickersParam);
    if (parsed.rejected) return badRequest('tickers: up to 100 valid symbols');
    const tickers = parsed.symbols;
    if (expensiveRoutesDisabled()) return disabledResponse();

    try {
        const assetClasses = await resolveAssetClasses(tickers);
        return NextResponse.json({ assetClasses }, { headers: cdnCache(86400, 604800) });
    } catch (error) {
        console.error('Error resolving asset classes:', error);
        return NextResponse.json({ assetClasses: {} });
    }
}
