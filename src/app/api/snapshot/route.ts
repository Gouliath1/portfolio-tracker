/**
 * Snapshot bridge: the portfolio, written to a file an MCP server can read.
 *
 * Positions live in the browser's localStorage, so no server-side process —
 * including an AI assistant's MCP server — can reach them on its own. This
 * route is the one place the data crosses that boundary: the portal POSTs a
 * computed snapshot here, and it lands on disk at a path the MCP server polls.
 *
 * Deliberately *not* a database. The file is a cache of what the browser
 * already holds, rewritten on every change, and readable by exactly one person
 * — whoever is already logged into this machine. The portal only calls this
 * when it is served from localhost (see `publishSnapshot`), so a hosted
 * deployment never receives anyone's holdings.
 */

import { NextRequest, NextResponse } from 'next/server';
import { writeFile, readFile, mkdir, rename, unlink } from 'fs/promises';
import path from 'path';

/** Refuse anything larger — a legitimate snapshot is a few hundred KB at most. */
const MAX_BYTES = 5 * 1024 * 1024;

// Not exported: a Next.js route module may only export route handlers and
// the framework's own config fields, and the build fails on anything else.
const SNAPSHOT_VERSION = 1;

function snapshotPath(): string {
    return process.env.PORTFOLIO_SNAPSHOT_PATH
        ?? path.join(process.cwd(), 'data', 'portfolio-snapshot.json');
}

/**
 * A read-only filesystem is the expected outcome on a serverless host, not a
 * bug — the bridge is a local-machine feature. Distinguish it so the caller
 * gets "not supported here" rather than a generic failure.
 */
function isReadOnly(error: unknown): boolean {
    const code = (error as NodeJS.ErrnoException)?.code;
    return code === 'EROFS' || code === 'EACCES' || code === 'EPERM';
}

/**
 * Serializes writes within this process.
 *
 * The portal publishes several times in quick succession as a page loads —
 * cached prices paint first, then live prices and asset classes resolve — and
 * `writeFile` truncates before it writes. Two of those overlapping leaves the
 * tail of the longer payload sitting after the shorter one's closing brace,
 * producing a file that is no longer valid JSON. Chaining the writes means
 * only one is ever in flight.
 */
let writeQueue: Promise<unknown> = Promise.resolve();

function enqueue<T>(task: () => Promise<T>): Promise<T> {
    const result = writeQueue.then(task, task);
    // Keep the chain alive regardless of individual failures.
    writeQueue = result.catch(() => undefined);
    return result;
}

/**
 * Write via a temp file and rename.
 *
 * `rename` is atomic on POSIX, so a reader — the MCP server polling this path
 * — sees either the previous snapshot or the new one, never a half-written
 * file. Serializing alone wouldn't give us that: a reader can still catch a
 * direct write mid-flight.
 */
async function writeAtomic(target: string, contents: string): Promise<void> {
    const temp = `${target}.${process.pid}.${Date.now()}.tmp`;
    try {
        await writeFile(temp, contents, 'utf8');
        await rename(temp, target);
    } catch (error) {
        await unlink(temp).catch(() => undefined);
        throw error;
    }
}

const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

/**
 * The bridge is a local-machine feature, so refuse anything else:
 *  - the Host must be loopback (also defeats DNS rebinding, where a hostile
 *    domain resolves to 127.0.0.1), and
 *  - a browser-supplied Origin must match it, so a web page the user happens
 *    to have open can't write a poisoned snapshot the MCP server then feeds
 *    to the assistant (a plain `text/plain` POST skips CORS preflight).
 */
function isLocalRequest(request: NextRequest): boolean {
    const host = request.headers.get('host') ?? request.nextUrl.host;
    let hostname: string;
    try { hostname = new URL(`http://${host}`).hostname; } catch { return false; }
    if (!LOCAL_HOSTNAMES.has(hostname)) return false;
    const origin = request.headers.get('origin');
    if (!origin) return true;
    try { return new URL(origin).host === host; } catch { return false; }
}

const forbidden = () => NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 });

export async function POST(request: NextRequest) {
    if (!isLocalRequest(request)) return forbidden();
    let body: unknown;
    try {
        const raw = await request.text();
        if (raw.length > MAX_BYTES) {
            return NextResponse.json(
                { ok: false, error: 'Snapshot too large' },
                { status: 413 },
            );
        }
        body = JSON.parse(raw);
    } catch {
        return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 });
    }

    const { snapshot, markdown } = (body ?? {}) as { snapshot?: unknown; markdown?: unknown };
    if (typeof snapshot !== 'object' || snapshot === null || typeof markdown !== 'string') {
        return NextResponse.json(
            { ok: false, error: 'Expected { snapshot: object, markdown: string }' },
            { status: 400 },
        );
    }

    const target = snapshotPath();
    const payload = {
        version: SNAPSHOT_VERSION,
        writtenAt: new Date().toISOString(),
        snapshot,
        markdown,
    };

    try {
        await enqueue(async () => {
            await mkdir(path.dirname(target), { recursive: true });
            await writeAtomic(target, JSON.stringify(payload, null, 2));
        });
    } catch (error) {
        if (isReadOnly(error)) {
            return NextResponse.json(
                { ok: false, error: 'Filesystem is read-only — the snapshot bridge only runs locally' },
                { status: 503 },
            );
        }
        return NextResponse.json(
            { ok: false, error: error instanceof Error ? error.message : 'Write failed' },
            { status: 500 },
        );
    }

    return NextResponse.json({ ok: true, writtenAt: payload.writtenAt });
}

/** Read the snapshot back — used for debugging the bridge, and by nothing else. */
export async function GET(request: NextRequest) {
    if (!isLocalRequest(request)) return forbidden();
    try {
        const raw = await readFile(snapshotPath(), 'utf8');
        return new NextResponse(raw, {
            status: 200,
            headers: { 'content-type': 'application/json' },
        });
    } catch {
        return NextResponse.json(
            { ok: false, error: 'No snapshot has been written yet' },
            { status: 404 },
        );
    }
}
