/**
 * The URL a user pastes into Claude's connector settings.
 *
 * Everything about the request identity lives in the path: the token is the
 * credential, and possession of the URL is the whole authorisation model. That
 * is a deliberate trade for a tool aimed at people who will not configure
 * OAuth — but it means the usual precautions apply, so the route refuses to be
 * indexed, cached, or embedded anywhere it might leak.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getShare, isValidToken } from '../../../../lib/server/shareStore';
import {
    handleMcpMessage,
    jsonRpcError,
    JSON_RPC_CODES,
    type JsonRpcRequest,
} from '../../../../lib/server/mcpEndpoint';
import type { PortfolioSnapshot } from '../../../../utils/portfolioSnapshot';

/** Snapshots are read fresh per request; nothing here may be cached. */
export const dynamic = 'force-dynamic';

const NO_STORE = {
    'cache-control': 'no-store, no-cache, must-revalidate, private',
    'x-robots-tag': 'noindex, nofollow',
} as const;

const json = (body: unknown, status = 200) =>
    NextResponse.json(body, { status, headers: NO_STORE });

/**
 * A token that doesn't resolve and a token that never existed get the same
 * answer, so the endpoint can't be used to test whether a share is real.
 */
function unknownShare() {
    return json(
        jsonRpcError(null, JSON_RPC_CODES.INVALID_REQUEST,
            'This portfolio connection is not valid. It may have been revoked, or expired after ' +
            '30 days without use. Open the Portfolio Tracker app and connect again to get a new link.'),
        404,
    );
}

export async function POST(
    request: NextRequest,
    context: { params: Promise<{ token: string }> },
) {
    const { token } = await context.params;
    if (!isValidToken(token)) return unknownShare();

    let payload: unknown;
    try {
        payload = await request.json();
    } catch {
        return json(jsonRpcError(null, JSON_RPC_CODES.PARSE_ERROR, 'Invalid JSON'), 400);
    }

    const share = await getShare(token);
    if (!share) return unknownShare();

    const ctx = {
        snapshot: share.snapshot as PortfolioSnapshot,
        markdown: share.markdown,
        updatedAt: share.updatedAt,
    };

    // A client may batch messages into an array; the reply is an array of the
    // responses, with notifications contributing nothing.
    if (Array.isArray(payload)) {
        const responses = payload
            .map(message => handleMcpMessage(message as JsonRpcRequest, ctx))
            .filter(response => response !== null);
        // An all-notification batch warrants acceptance, not an empty array.
        return responses.length === 0
            ? new NextResponse(null, { status: 202, headers: NO_STORE })
            : json(responses);
    }

    const response = handleMcpMessage(payload as JsonRpcRequest, ctx);
    return response === null
        ? new NextResponse(null, { status: 202, headers: NO_STORE })
        : json(response);
}

/**
 * Streamable HTTP uses GET to open a server-initiated SSE stream. A stateless
 * tools-only server never initiates anything, and the spec's prescribed way to
 * say so is 405 — which clients handle by simply not opening a stream.
 */
export async function GET() {
    return json(
        jsonRpcError(null, JSON_RPC_CODES.METHOD_NOT_FOUND,
            'This server is stateless and does not provide an event stream. Send JSON-RPC over POST.'),
        405,
    );
}

/** No session to terminate, but answering keeps client shutdown clean. */
export async function DELETE() {
    return new NextResponse(null, { status: 204, headers: NO_STORE });
}
