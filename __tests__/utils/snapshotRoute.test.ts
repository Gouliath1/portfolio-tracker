/**
 * @jest-environment node
 *
 * Guards the snapshot bridge's write path.
 *
 * The bug this exists for: the portal publishes several times in the second or
 * two after a page load, and a plain `writeFile` truncates before it writes. A
 * shorter payload landing on top of a longer one left the tail of the longer
 * file sitting after the closing brace — valid-looking on disk, but no longer
 * parseable, so the MCP server reading it would report the snapshot corrupt.
 *
 * Writes go through a queue and a rename, and the concurrency test below fails
 * without both.
 */

import { mkdtemp, rm, readFile } from 'fs/promises';
import { tmpdir } from 'os';
import path from 'path';
import { NextRequest } from 'next/server';

let dir: string;
let snapshotFile: string;

/** A snapshot payload whose serialized length varies with `holdingCount`. */
function payload(holdingCount: number) {
    return {
        snapshot: {
            generatedAt: '2026-09-12',
            baseCurrency: 'JPY',
            portfolioName: 'Test',
            holdingCount,
            totals: { value: holdingCount * 1000 },
            holdings: Array.from({ length: holdingCount }, (_, i) => ({
                ticker: `T${i}`,
                name: `Holding number ${i} with a name long enough to matter`,
            })),
        },
        markdown: `# Brief\n${'padding line\n'.repeat(holdingCount)}`,
    };
}

function post(body: unknown): NextRequest {
    return new NextRequest('http://localhost:3000/api/snapshot', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
    });
}

async function loadRoute() {
    // The route reads the env var at call time, so set it before importing.
    process.env.PORTFOLIO_SNAPSHOT_PATH = snapshotFile;
    return import('../../src/app/api/snapshot/route');
}

beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'snapshot-route-'));
    snapshotFile = path.join(dir, 'nested', 'portfolio-snapshot.json');
    jest.resetModules();
});

afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
    delete process.env.PORTFOLIO_SNAPSHOT_PATH;
});

describe('POST /api/snapshot', () => {
    it('writes the snapshot, creating the directory if needed', async () => {
        const { POST } = await loadRoute();

        const response = await POST(post(payload(3)));
        expect(response.status).toBe(200);

        const written = JSON.parse(await readFile(snapshotFile, 'utf8'));
        expect(written.version).toBe(1);
        expect(written.snapshot.holdingCount).toBe(3);
        expect(written.markdown).toContain('# Brief');
        expect(Date.parse(written.writtenAt)).not.toBeNaN();
    });

    it('leaves valid JSON behind when writes of different sizes overlap', async () => {
        const { POST } = await loadRoute();

        // Descending sizes: without atomic, serialized writes the largest
        // payload's tail survives past the smallest payload's closing brace.
        await Promise.all([
            POST(post(payload(400))),
            POST(post(payload(40))),
            POST(post(payload(4))),
        ]);

        const raw = await readFile(snapshotFile, 'utf8');
        // The actual failure mode: JSON.parse throwing "Extra data".
        const parsed = JSON.parse(raw);
        expect([4, 40, 400]).toContain(parsed.snapshot.holdingCount);
        // No debris after the closing brace.
        expect(raw.trimEnd().endsWith('}')).toBe(true);
    });

    it('leaves no temp files behind', async () => {
        const { POST } = await loadRoute();
        await Promise.all([POST(post(payload(10))), POST(post(payload(200)))]);

        const { readdir } = await import('fs/promises');
        const entries = await readdir(path.dirname(snapshotFile));
        expect(entries.filter(f => f.endsWith('.tmp'))).toEqual([]);
    });

    it('rejects a body that is not a snapshot', async () => {
        const { POST } = await loadRoute();

        expect((await POST(post({ markdown: 'no snapshot' }))).status).toBe(400);
        expect((await POST(post({ snapshot: {}, markdown: 42 }))).status).toBe(400);
    });

    it('rejects malformed JSON', async () => {
        const { POST } = await loadRoute();

        const request = new NextRequest('http://localhost:3000/api/snapshot', {
            method: 'POST',
            body: '{ not json',
        });
        expect((await POST(request)).status).toBe(400);
    });
});

describe('GET /api/snapshot', () => {
    it('returns 404 before anything has been written', async () => {
        const { GET } = await loadRoute();
        expect((await GET()).status).toBe(404);
    });

    it('returns what POST wrote', async () => {
        const { POST, GET } = await loadRoute();
        await POST(post(payload(2)));

        const response = await GET();
        expect(response.status).toBe(200);
        expect((await response.json()).snapshot.holdingCount).toBe(2);
    });
});
