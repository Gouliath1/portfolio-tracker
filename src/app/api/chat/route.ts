/**
 * Portfolio chat: one question in, one streamed plain-text answer out.
 *
 * Stateless — the browser sends the portfolio brief and recent turns with each
 * request, and nothing is stored here. See `lib/server/chat` for the cost
 * levers and why the brief is inlined rather than fetched through tools.
 */

import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { clientIp, NO_STORE } from '../../../lib/server/requestGuards';
import { getRequestUser } from '../../../lib/server/authSession';
import { claimQuestion, refundQuestion, remainingToday } from '../../../lib/server/chatUsageStore';
import {
    CHAT_MODEL, MAX_OUTPUT_TOKENS, admitIp, buildSystem, chatEnabled, parseChatRequest,
} from '../../../lib/server/chat';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: NO_STORE });

/**
 * Lets the UI show "not set up" or "sign in" instead of a chat box that can
 * only fail, and how many questions are left today.
 */
export async function GET(request: NextRequest) {
    const user = await getRequestUser(request);
    return json({
        enabled: chatEnabled(),
        signedIn: user !== null,
        remaining: user ? await remainingToday(user.id) : null,
    });
}

export async function POST(request: NextRequest) {
    if (!chatEnabled()) return json({ error: 'Chat is not enabled on this server' }, 503);

    // Chat spends the owner's key, so it is for signed-in accounts only.
    const user = await getRequestUser(request);
    if (!user) return json({ error: 'Sign in to use chat' }, 401);

    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return json({ error: 'Invalid JSON' }, 400);
    }

    const parsed = parseChatRequest(body);
    if (!parsed.ok) return json({ error: parsed.error }, parsed.status);

    if (!admitIp(clientIp(request))) return json({ error: 'Too many questions — try again in a few minutes' }, 429);

    // Spent only now that the request is valid, and given back if no answer starts.
    const claim = await claimQuestion(user.id);
    if (!claim.ok) {
        return claim.reason === 'limit'
            ? json({ error: 'Daily chat limit reached — try again tomorrow', code: 'daily' }, 429)
            : json({ error: 'Chat is temporarily unavailable' }, 503);
    }

    const { brief, messages, language } = parsed.request;
    const client = new Anthropic();

    // Thinking off and low effort: reading a table needs no deliberation, and
    // reasoning tokens bill as output.
    const stream = client.messages.stream({
        model: CHAT_MODEL,
        max_tokens: MAX_OUTPUT_TOKENS,
        thinking: { type: 'disabled' },
        output_config: { effort: 'low' },
        system: buildSystem(brief, language),
        messages,
    });

    const encoder = new TextEncoder();
    const body_ = new ReadableStream<Uint8Array>({
        async start(controller) {
            let started = false;
            try {
                for await (const event of stream) {
                    if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
                        started = true;
                        controller.enqueue(encoder.encode(event.delta.text));
                    }
                }
                const final = await stream.finalMessage();
                // Cache hit/miss is the number to watch when tuning cost.
                console.info('[chat] usage', JSON.stringify(final.usage));
                controller.close();
            } catch (error) {
                console.error('[chat] failed', error instanceof Error ? error.message : error);
                if (!started) await refundQuestion(user.id).catch(() => undefined);
                controller.error(error);
            }
        },
        cancel() {
            stream.abort();
        },
    });

    return new Response(body_, {
        headers: { 'content-type': 'text/plain; charset=utf-8', ...NO_STORE },
    });
}
