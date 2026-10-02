'use client';

/**
 * Cross-device sync state, mounted once at the app root so it keeps syncing
 * whether or not the settings panel is open.
 *
 * Opt-in: with no device state stored, this does nothing and never contacts
 * the server. See `utils/syncClient` for the decision logic and
 * `utils/syncState` for what is carried.
 *
 * Applying a pulled blob rewrites localStorage and then reloads the page —
 * the rest of the app reads storage on mount, and a reload is the one
 * guarantee that nothing keeps rendering stale in-memory state.
 */

import {
    createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState,
    type ReactNode,
} from 'react';
import { useTranslation } from '../../i18n';
import {
    generateSyncToken, readDeviceState, writeDeviceState, clearDeviceState,
    buildJoinLink, readJoinTokenFromHash, planSync, pullSync, pushSync, revokeSync,
    type ServerSnapshot,
} from '../../utils/syncClient';
import { collectSyncBlob, applySyncBlob, isLocalStateEmpty, stashBackup } from '../../utils/syncState';

export type SyncStatus = 'off' | 'idle' | 'syncing' | 'error' | 'conflict';

interface Conflict {
    token: string;
    server: ServerSnapshot;
}

export interface SyncContextValue {
    status: SyncStatus;
    enabled: boolean;
    error: string | null;
    lastSyncedAt: Date | null;
    /** Shareable join link for this device's session, when enabled. */
    link: string | null;
    conflict: Conflict | null;
    /** A `#sync=` link was opened; the user hasn't yet decided to join. */
    pendingJoin: string | null;
    /** The cloud copy changed on another device; applying it reloads the page. */
    remoteUpdate: boolean;
    applyRemoteUpdate: () => Promise<void>;
    enable: () => Promise<void>;
    join: (token: string) => Promise<void>;
    disable: () => Promise<void>;
    syncNow: () => Promise<void>;
    resolveConflict: (keep: 'local' | 'cloud') => Promise<void>;
    dismissPendingJoin: () => void;
    /** The sync panel (opened from the menu button) is showing. */
    panelOpen: boolean;
    openPanel: () => void;
    closePanel: () => void;
}

const SyncContext = createContext<SyncContextValue | null>(null);

/** Null outside a provider, so components that render in isolation (tests, previews) can omit sync UI. */
export function useOptionalSync(): SyncContextValue | null {
    return useContext(SyncContext);
}

export function useSync(): SyncContextValue {
    const ctx = useOptionalSync();
    if (!ctx) throw new Error('useSync must be used inside <SyncProvider>');
    return ctx;
}

const CHECK_INTERVAL_MS = 5_000;
const REMOTE_POLL_MS = 60_000;
const BACKOFF_BASE_MS = 5_000;
const BACKOFF_MAX_MS = 5 * 60_000;

export function SyncProvider({ children }: { children: ReactNode }) {
    const { t } = useTranslation();
    const [status, setStatus] = useState<SyncStatus>('off');
    const [error, setError] = useState<string | null>(null);
    const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);
    const [link, setLink] = useState<string | null>(null);
    const [conflict, setConflict] = useState<Conflict | null>(null);
    const [pendingJoin, setPendingJoin] = useState<string | null>(null);
    const [remoteUpdate, setRemoteUpdate] = useState(false);
    const [panelOpen, setPanelOpen] = useState(false);

    const busy = useRef(false);
    const conflictRef = useRef<Conflict | null>(null);
    const lastRemoteCheck = useRef(0);
    // Exponential backoff after failures, so an outage or an unsyncable blob
    // (e.g. over the size cap) doesn't hammer the API every tick.
    const failures = useRef(0);
    const retryAfter = useRef(0);

    const setConflictState = useCallback((c: Conflict | null) => {
        conflictRef.current = c;
        setConflict(c);
        if (c) setStatus('conflict');
    }, []);

    const markSynced = useCallback(() => {
        setStatus('idle');
        setError(null);
        setLastSyncedAt(new Date());
        lastRemoteCheck.current = Date.now();
        failures.current = 0;
        retryAfter.current = 0;
    }, []);

    const fail = useCallback((message: string) => {
        setStatus('error');
        setError(message);
        failures.current += 1;
        retryAfter.current = Date.now()
            + Math.min(BACKOFF_MAX_MS, BACKOFF_BASE_MS * 2 ** failures.current);
    }, []);

    /** Adopt the server's blob locally, record it, and reload. */
    const adoptCloud = useCallback((token: string, server: ServerSnapshot) => {
        const freshDevice = isLocalStateEmpty();
        if (!freshDevice) stashBackup();
        if (!applySyncBlob(server.blob, { freshDevice })) {
            fail(t('sync.errBadBlob'));
            return false;
        }
        writeDeviceState({ token, version: server.version, lastBlob: collectSyncBlob() });
        window.location.reload();
        return true;
    }, [fail, t]);

    /**
     * One sync pass. `applyPull` decides what happens when the cloud copy is
     * newer: true (boot, "Sync now", the banner's Reload) applies it and
     * reloads; false (background polling) only raises `remoteUpdate`, so a
     * reload never lands on someone mid-edit.
     */
    const runPass = useCallback(async (applyPull = false) => {
        const device = readDeviceState();
        if (!device || busy.current || conflictRef.current) return;
        busy.current = true;
        setStatus('syncing');
        try {
            const pulled = await pullSync(device.token);
            if (!pulled.ok) return fail(pulled.error);

            const localBlob = collectSyncBlob();
            const server = pulled.found ? { version: pulled.version, blob: pulled.blob } : null;
            const action = planSync({ localBlob, device, server });
            if (action !== 'pull') setRemoteUpdate(false);

            switch (action) {
                case 'noop':
                    markSynced();
                    break;
                case 'adopt':
                    writeDeviceState({ ...device, version: server!.version, lastBlob: localBlob });
                    markSynced();
                    break;
                case 'ended':
                    // Revoked from another device, or expired. Never re-create it:
                    // that would resurrect a copy the user deliberately deleted.
                    // Local data is untouched; this device just stops syncing.
                    clearDeviceState();
                    setLink(null);
                    setLastSyncedAt(null);
                    setStatus('off');
                    setError(t('sync.endedNotice'));
                    break;
                case 'pull':
                    if (applyPull) {
                        adoptCloud(device.token, server!);
                    } else {
                        setRemoteUpdate(true);
                        setStatus('idle');
                        lastRemoteCheck.current = Date.now();
                    }
                    break;
                case 'conflict':
                    setConflictState({ token: device.token, server: server! });
                    break;
                case 'push': {
                    const res = await pushSync(device.token, localBlob, device.version);
                    if (res.ok) {
                        writeDeviceState({ ...device, version: res.version, lastBlob: localBlob });
                        markSynced();
                    } else if (res.conflict) {
                        setConflictState({ token: device.token, server: res.conflict });
                    } else {
                        fail(res.error);
                    }
                    break;
                }
            }
        } finally {
            busy.current = false;
        }
    }, [adoptCloud, fail, markSynced, setConflictState, t]);

    // Pick up a `#sync=` link. A layout effect, because page-level effects
    // rewrite the URL (dropping the hash) and layout effects run before any
    // passive effect in the tree.
    useLayoutEffect(() => {
        const consumeHash = () => {
            const fromHash = readJoinTokenFromHash(window.location.hash);
            if (!fromHash) return;
            // Drop the key from the address bar and history immediately.
            window.history.replaceState(null, '', window.location.pathname + window.location.search);
            setPendingJoin(fromHash);
        };
        consumeHash();
        // Pasting a link into a tab that's already open changes only the hash — no reload.
        window.addEventListener('hashchange', consumeHash);
        return () => window.removeEventListener('hashchange', consumeHash);
    }, []);

    // Resume if this device already syncs.
    useEffect(() => {
        const device = readDeviceState();
        if (device) {
            setLink(buildJoinLink(device.token));
            setStatus('idle');
            void runPass(true);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Local edits don't raise events (localStorage only notifies *other*
    // tabs), so compare against the last-synced blob on a short timer.
    useEffect(() => {
        const tick = () => {
            if (document.hidden) return;
            const device = readDeviceState();
            if (!device || busy.current || conflictRef.current) return;
            if (Date.now() < retryAfter.current) return;
            const localChanged = collectSyncBlob() !== device.lastBlob;
            const remoteDue = Date.now() - lastRemoteCheck.current > REMOTE_POLL_MS;
            if (localChanged || remoteDue) void runPass();
        };
        const onVisible = () => {
            if (!document.hidden && Date.now() >= retryAfter.current) void runPass();
        };
        const id = window.setInterval(tick, CHECK_INTERVAL_MS);
        document.addEventListener('visibilitychange', onVisible);
        return () => {
            window.clearInterval(id);
            document.removeEventListener('visibilitychange', onVisible);
        };
    }, [runPass]);

    const enable = useCallback(async () => {
        if (readDeviceState()) return;
        setStatus('syncing');
        const token = generateSyncToken();
        const blob = collectSyncBlob();
        const res = await pushSync(token, blob, 0);
        if (!res.ok) return fail(res.error);
        writeDeviceState({ token, version: res.version, lastBlob: blob });
        setLink(buildJoinLink(token));
        markSynced();
    }, [fail, markSynced]);

    const join = useCallback(async (token: string) => {
        setPendingJoin(null);
        setStatus('syncing');
        const pulled = await pullSync(token);
        if (!pulled.ok) return fail(pulled.error);
        if (!pulled.found) return fail(t('sync.errNotFound'));

        const server = { version: pulled.version, blob: pulled.blob };
        const localBlob = collectSyncBlob();

        if (isLocalStateEmpty() || localBlob === server.blob) {
            if (localBlob === server.blob) {
                writeDeviceState({ token, version: server.version, lastBlob: localBlob });
                setLink(buildJoinLink(token));
                markSynced();
            } else {
                adoptCloud(token, server);
            }
            return;
        }
        // This device already has data that differs from the session's.
        setConflictState({ token, server });
    }, [adoptCloud, fail, markSynced, setConflictState, t]);

    const resolveConflict = useCallback(async (keep: 'local' | 'cloud') => {
        const c = conflictRef.current;
        if (!c) return;
        if (keep === 'cloud') {
            setConflictState(null);
            adoptCloud(c.token, c.server);
            return;
        }
        setStatus('syncing');
        const localBlob = collectSyncBlob();
        const res = await pushSync(c.token, localBlob, c.server.version);
        if (res.ok) {
            writeDeviceState({ token: c.token, version: res.version, lastBlob: localBlob });
            setLink(buildJoinLink(c.token));
            setConflictState(null);
            markSynced();
        } else if (res.conflict) {
            // Someone pushed again while the user was deciding — show the newer one.
            setConflictState({ token: c.token, server: res.conflict });
        } else {
            setConflictState(null);
            fail(res.error);
        }
    }, [adoptCloud, fail, markSynced, setConflictState]);

    const disable = useCallback(async () => {
        const device = readDeviceState();
        if (device) {
            setStatus('syncing');
            // Keep the key if the server didn't confirm: dropping it would leave
            // an undeletable cloud copy while the UI claims it's gone.
            if (!(await revokeSync(device.token))) return fail(t('sync.errDisable'));
        }
        clearDeviceState();
        setLink(null);
        setConflictState(null);
        setError(null);
        setLastSyncedAt(null);
        setStatus('off');
    }, [fail, setConflictState, t]);

    const applyRemoteUpdate = useCallback(() => runPass(true), [runPass]);

    const value = useMemo<SyncContextValue>(() => ({
        status, enabled: status !== 'off', error, lastSyncedAt, link, conflict, pendingJoin,
        remoteUpdate, applyRemoteUpdate,
        enable, join, disable, syncNow: applyRemoteUpdate, resolveConflict,
        dismissPendingJoin: () => setPendingJoin(null),
        panelOpen, openPanel: () => setPanelOpen(true), closePanel: () => setPanelOpen(false),
    }), [panelOpen, status, error, lastSyncedAt, link, conflict, pendingJoin, remoteUpdate, applyRemoteUpdate, enable, join, disable, resolveConflict]);

    return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>;
}
