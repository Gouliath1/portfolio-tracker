/**
 * Browser side of cross-device sync: the key, the per-device sync state, the
 * API calls, and the pure decision of what a sync pass should do.
 *
 * Opt-in. Until the user enables sync (or joins a session) nothing here talks
 * to the server, and positions stay in this browser.
 */

const DEVICE_KEY = 'pt_sync'; // per-device, deliberately not in the synced allowlist
const FRAGMENT_PARAM = 'sync';

export interface DeviceSyncState {
    /** The anonymous sync key, or null when this device syncs as the signed-in account. */
    token: string | null;
    /** Server version this device last matched. */
    version: number;
    /** Exact blob at that version, to tell "local changed" from "unchanged". */
    lastBlob: string;
}

export interface ServerSnapshot {
    version: number;
    blob: string;
}

export type SyncAction = 'noop' | 'push' | 'pull' | 'conflict' | 'adopt' | 'ended';

// ── Key + device state ──────────────────────────────────────────────────────

/** 32 random bytes, base64url — 43 chars, matching the server's token format. */
export function generateSyncToken(): string {
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    let bin = '';
    for (const b of bytes) bin += String.fromCharCode(b);
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function readDeviceState(): DeviceSyncState | null {
    try {
        const raw = localStorage.getItem(DEVICE_KEY);
        if (!raw) return null;
        const s = JSON.parse(raw);
        if ((typeof s?.token === 'string' || s?.token === null)
            && typeof s.version === 'number' && typeof s.lastBlob === 'string') {
            return s as DeviceSyncState;
        }
    } catch { /* fall through */ }
    return null;
}

export function writeDeviceState(state: DeviceSyncState): void {
    localStorage.setItem(DEVICE_KEY, JSON.stringify(state));
}

export function clearDeviceState(): void {
    localStorage.removeItem(DEVICE_KEY);
}

// When a device moves from an anonymous key to an account, the old key should
// stop working. The switch can end in a page reload (adopting the cloud copy),
// so the revoke is queued here and performed on the next start.
const REVOKE_KEY = 'pt_sync_revoke';
export const queueKeyRevoke = (token: string) => localStorage.setItem(REVOKE_KEY, token);
export function takeQueuedKeyRevoke(): string | null {
    const t = localStorage.getItem(REVOKE_KEY);
    if (t) localStorage.removeItem(REVOKE_KEY);
    return t;
}

// ── Share link ──────────────────────────────────────────────────────────────

/** The key rides in the URL fragment, which browsers never send to servers (or their logs). */
export function buildJoinLink(token: string, origin = window.location.origin): string {
    return `${origin}/#${FRAGMENT_PARAM}=${token}`;
}

export function readJoinTokenFromHash(hash: string): string | null {
    const match = new RegExp(`[#&]${FRAGMENT_PARAM}=([A-Za-z0-9_-]{32,128})`).exec(hash);
    return match ? match[1] : null;
}

// ── Decision ────────────────────────────────────────────────────────────────

/** What one sync pass should do, given local and server state. Pure. */
export function planSync(args: {
    localBlob: string;
    device: Pick<DeviceSyncState, 'version' | 'lastBlob'>;
    server: ServerSnapshot | null;
}): SyncAction {
    const { localBlob, device, server } = args;
    const localChanged = localBlob !== device.lastBlob;

    if (!server) return 'ended'; // expired or revoked elsewhere — stop syncing, never re-create
    if (server.blob === localBlob) {
        return server.version === device.version ? 'noop' : 'adopt';
    }
    if (server.version === device.version) return localChanged ? 'push' : 'noop';
    return localChanged ? 'conflict' : 'pull';
}

// ── API ─────────────────────────────────────────────────────────────────────

export type PullResult =
    | { ok: true; found: false }
    | { ok: true; found: true; blob: string; version: number }
    | { ok: false; error: string; unauthorized?: boolean };

export type PushResponse =
    | { ok: true; version: number }
    | { ok: false; conflict: ServerSnapshot | null; error: string; unauthorized?: boolean };

/** A key identifies an anonymous session; no key means "the signed-in account" (the cookie decides). */
async function call(method: string, token: string | null, body: Record<string, unknown> = {}): Promise<Response> {
    return fetch('/api/sync', {
        method,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(token === null ? body : { token, ...body }),
    });
}

export async function pullSync(token: string | null): Promise<PullResult> {
    try {
        const res = await call('PUT', token);
        const data = await res.json();
        if (!res.ok || !data.ok) return { ok: false, error: data.error ?? `HTTP ${res.status}`, unauthorized: res.status === 401 };
        return data.found
            ? { ok: true, found: true, blob: data.blob, version: data.version }
            : { ok: true, found: false };
    } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : 'Network error' };
    }
}

export async function pushSync(token: string | null, blob: string, baseVersion: number): Promise<PushResponse> {
    try {
        const res = await call('POST', token, { blob, baseVersion });
        const data = await res.json();
        if (res.ok && data.ok) return { ok: true, version: data.version };
        return {
            ok: false,
            error: data.error ?? `HTTP ${res.status}`,
            unauthorized: res.status === 401,
            conflict: res.status === 409 && data.conflict
                ? { blob: data.conflict.blob, version: data.conflict.version }
                : null,
        };
    } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : 'Network error', conflict: null };
    }
}

export async function revokeSync(token: string | null): Promise<boolean> {
    try {
        const res = await call('DELETE', token);
        return res.ok;
    } catch {
        return false;
    }
}
