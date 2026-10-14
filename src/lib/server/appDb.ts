/**
 * The app's own database (sync blobs, accounts, sessions) — separate from the
 * market-data cache, same hosting rule: Turso on Vercel (read-only filesystem),
 * a local SQLite file in dev.
 *
 * One client and one failure state shared by every store, so "storage is down"
 * is reported once, with its real cause, instead of each store rediscovering it.
 */

import { createClient, Client } from '@libsql/client';
import { dirname } from 'path';
import { mkdirSync } from 'fs';

const DEFAULT_LOCAL_PATH = './data/app.db';

let _client: Client | null = null;
let _unavailable = false;
let _unavailableReason: string | null = null;
const _schemas = new Map<string, Promise<void>>();

export function appDbUnavailableReason(): string | null {
    return _unavailableReason;
}

function markUnavailable(reason: string): null {
    _unavailable = true;
    _unavailableReason = reason;
    console.warn(`[appDb] ${reason}`);
    return null;
}

function getClient(): Client | null {
    if (_unavailable) return null;
    if (_client) return _client;

    const url = process.env.TURSO_DATABASE_URL;
    const token = process.env.TURSO_AUTH_TOKEN;

    try {
        if (url && token) {
            _client = createClient({ url, authToken: token });
        } else if (process.env.VERCEL) {
            return markUnavailable(
                'TURSO_DATABASE_URL / TURSO_AUTH_TOKEN are not set in this environment, ' +
                'and a serverless filesystem cannot hold a local database.',
            );
        } else {
            const path = process.env.APP_DB_PATH ?? process.env.SYNC_DB_PATH ?? DEFAULT_LOCAL_PATH;
            try { mkdirSync(dirname(path), { recursive: true }); } catch { /* exists */ }
            _client = createClient({ url: `file:${path}` });
        }
        return _client;
    } catch (error) {
        return markUnavailable(
            `Could not open the database: ${error instanceof Error ? error.message : String(error)}`,
        );
    }
}

/**
 * The client, once the named schema has been created. Each store passes its own
 * `init`; it runs once per process (and again after a transient failure, so an
 * outage doesn't pin the process to a permanent error).
 */
export async function withSchema(name: string, init: (c: Client) => Promise<void>): Promise<Client | null> {
    const client = getClient();
    if (!client) return null;

    let pending = _schemas.get(name);
    if (!pending) {
        pending = init(client);
        _schemas.set(name, pending);
    }
    try {
        await pending;
    } catch (error) {
        _schemas.delete(name);
        return markUnavailable(
            `Database rejected the ${name} schema setup: ${error instanceof Error ? error.message : String(error)}`,
        );
    }
    return client;
}

/** Test seam — drops the memoised client and schema state so a new DB path takes effect. */
export function resetAppDbForTests(): void {
    _client = null;
    _unavailable = false;
    _unavailableReason = null;
    _schemas.clear();
}
