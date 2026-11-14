/**
 * Portfolio chat: one question in, one streamed plain-text answer out.
 *
 * Stateless — the browser sends the portfolio brief and recent turns with each
 * request, and nothing is stored here. See `lib/server/chat` for the cost
 * levers. The model may call the tools in `lib/server/chatTools` for up to
 * `MAX_TOOL_ROUNDS` rounds; only the text it writes is streamed to the browser.
 */

import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { clientIp, NO_STORE } from '../../../lib/server/requestGuards';
import { getRequestUser } from '../../../lib/server/authSession';
import { claimQuestion, refundQuestion, remainingToday } from '../../../lib/server/chatUsageStore';
import { MAX_TOOL_ROUNDS, buildChatTools, runChatTool } from '../../../lib/server/chatTools';
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

    const { brief, messages: history, language, snapshot, screener, actions } = parsed.request;
    const client = new Anthropic();
    const system = buildSystem(brief, language);
    const tools = buildChatTools(actions);
    const abort = new AbortController();
    /** One confirm card per action per question, whatever the model asks for. */
    const proposed = new Set<string>();

    const encoder = new TextEncoder();
    const body_ = new ReadableStream<Uint8Array>({
        async start(controller) {
            let started = false;
            const messages: Anthropic.MessageParam[] = [...history];
            try {
                for (let round = 0; ; round++) {
                    // Thinking off and low effort: reading a table needs no deliberation,
                    // and reasoning tokens bill as output. The last round withholds the
                    // tools so the answer always ends in text.
                    const lastRound = round >= MAX_TOOL_ROUNDS;
                    const stream = client.messages.stream({
                        model: CHAT_MODEL,
                        max_tokens: MAX_OUTPUT_TOKENS,
                        thinking: { type: 'disabled' },
                        output_config: { effort: 'low' },
                        system,
                        tools,
                        ...(lastRound ? { tool_choice: { type: 'none' as const } } : {}),
                        messages,
                    }, { signal: abort.signal });

                    let wroteThisRound = false;
                    for await (const event of stream) {
                        if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
                            // Text from an earlier round and this one would run together.
                            if (!wroteThisRound && started) controller.enqueue(encoder.encode('\n\n'));
                            wroteThisRound = true;
                            started = true;
                            controller.enqueue(encoder.encode(event.delta.text));
                        }
                    }
                    const final = await stream.finalMessage();
                    // Cache hit/miss is the number to watch when tuning cost.
                    console.info('[chat] usage', round, JSON.stringify(final.usage));

                    if (final.stop_reason !== 'tool_use' || lastRound) break;

                    const calls = final.content.filter(
                        (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use',
                    );
                    const results = await Promise.all(calls.map(async call => {
                        const out = await runChatTool(call.name, call.input, { snapshot: snapshot ?? null, screener: screener ?? null, actions });
                        console.info('[chat] tool', call.name, out.isError ? 'error' : 'ok');
                        if (out.emit) {
                            const id = String((call.input as { id?: unknown }).id);
                            // The card is part of the answer, so it streams like text.
                            if (!proposed.has(id)) {
                                proposed.add(id);
                                started = true;
                                controller.enqueue(encoder.encode(out.emit));
                            }
                        }
                        return {
                            type: 'tool_result' as const,
                            tool_use_id: call.id,
                            content: out.text,
                            ...(out.isError ? { is_error: true } : {}),
                        };
                    }));
                    messages.push({ role: 'assistant', content: final.content });
                    messages.push({ role: 'user', content: results });
                }
                controller.close();
            } catch (error) {
                console.error('[chat] failed', error instanceof Error ? error.message : error);
                if (!started) await refundQuestion(user.id).catch(() => undefined);
                controller.error(error);
            }
        },
        cancel() {
            abort.abort();
        },
    });

    return new Response(body_, {
        headers: { 'content-type': 'text/plain; charset=utf-8', ...NO_STORE },
    });
}
