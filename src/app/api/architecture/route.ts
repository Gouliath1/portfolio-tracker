import { NextResponse } from 'next/server';
import { getCacheStatus } from '@portfolio/server/marketDataDb';
import { getShareStoreStatus, storageUnavailableReason } from '@portfolio/server/shareStore';

/**
 * Which server-side pieces are actually live right now — what the About
 * diagram lights up.
 *
 * Reports capability and placement, never secrets: whether a provider key is
 * present, not what it is; that the cache is on Turso, not which database.
 * Everything else the diagram shows (positions, the AI link) is browser state
 * and is read there.
 */
export interface ArchitectureStatus {
    environment: 'development' | 'production';
    /** Where the server itself is running. */
    host: 'local' | 'vercel';
    /** Vercel's edge region, when deployed there. */
    region: string | null;
    /** Where market data is cached, and how many rows it holds. */
    cache: { kind: 'turso' | 'sqlite' | 'unavailable'; location: string | null; rows: number | null };
    /** Where opt-in AI snapshots are stored. */
    shares: { available: boolean; kind: 'turso' | 'sqlite' | 'unavailable'; location: string | null };
    /** Providers the server can reach with its current configuration. */
    providers: { yahoo: boolean; jquants: boolean };
}

export async function GET() {
    const shares = getShareStoreStatus();

    const status: ArchitectureStatus = {
        environment: process.env.NODE_ENV === 'production' ? 'production' : 'development',
        host: process.env.VERCEL ? 'vercel' : 'local',
        region: process.env.VERCEL_REGION ?? null,
        cache: await getCacheStatus(),
        shares: {
            available: shares.kind !== 'unavailable' && storageUnavailableReason() === null,
            kind: shares.kind,
            location: shares.location,
        },
        providers: {
            // Yahoo needs no key — it is the baseline and is always reachable.
            yahoo: true,
            jquants: !!process.env.JQUANTS_API_KEY,
        },
    };

    return NextResponse.json(status, {
        headers: { 'Cache-Control': 'no-store' },
    });
}
