'use client';

/**
 * The app's architecture, drawn top-to-bottom in the order data travels:
 * browser → server → market data providers.
 *
 * The server step has two forms, and the difference is the whole point of the
 * storage design, so both are drawn side by side rather than one being folded
 * away: on a laptop the database is a file on the same disk, and on Vercel the
 * disk is read-only so the database is Turso, a separate service reached over
 * the network. Whichever one is serving this page is lit; the other stays dim.
 *
 * It draws the running system, not a picture of one — states resolve on mount
 * from localStorage and /api/architecture. Built from layout elements rather
 * than an SVG because the labels are translated, and text that wraps is the
 * only version that survives French.
 */

import { useEffect, useState } from 'react';
import { MdArrowDownward } from 'react-icons/md';
import { useTranslation } from '../../i18n';
import type { TranslationKey } from '../../i18n';
import { getActiveSetId, getActivePositions } from '../../utils/localPositions';
import { readToken } from '../../utils/aiConnection';

/** Lit, dimmed, or not yet known. */
type State = 'live' | 'off' | 'unknown';

interface Box {
    key: string;
    titleKey: TranslationKey;
    state: State;
    /** One short line — a count, a mode, a reason. Never a sentence. */
    detail?: string;
    /** Where it physically sits: a file path, a host, a service name. */
    location?: string;
}

type Storage = 'turso' | 'sqlite' | 'unavailable';

interface ServerStatus {
    environment: 'development' | 'production';
    host: 'local' | 'vercel';
    region: string | null;
    cache: { kind: Storage; location: string | null; rows: number | null };
    shares: { available: boolean; kind: Storage; location: string | null };
    providers: { yahoo: boolean; jquants: boolean };
}

function StatusBox({ box }: { box: Box }) {
    const { t } = useTranslation();
    const live = box.state === 'live';

    return (
        <div
            className="rounded-xl px-3 py-2.5"
            style={{
                border: `1px solid ${live ? 'var(--accent-glow)' : 'var(--border)'}`,
                background: live ? 'var(--surface)' : 'transparent',
                opacity: box.state === 'off' ? 0.55 : 1,
            }}
        >
            <div className="flex items-center gap-2">
                <span
                    className="flex-shrink-0 rounded-full"
                    style={{ width: 6, height: 6, background: live ? 'var(--pnl-green)' : 'var(--text-muted)' }}
                    aria-hidden="true"
                />
                <p className="text-[13px] font-medium leading-tight" style={{ color: 'var(--text-primary)' }}>
                    {t(box.titleKey)}
                </p>
            </div>
            {(box.detail || box.location) && (
                <div className="pl-3.5 mt-1 space-y-0.5">
                    {box.detail && (
                        <p className="text-[11px] leading-tight" style={{ color: 'var(--text-muted)' }}>{box.detail}</p>
                    )}
                    {box.location && (
                        <p className="text-[10px] font-mono leading-tight break-all" style={{ color: 'var(--text-muted)' }}>
                            {box.location}
                        </p>
                    )}
                </div>
            )}
        </div>
    );
}

function Layer({
    labelKey,
    detail,
    boxes,
    highlight = false,
}: {
    labelKey: TranslationKey;
    detail?: string;
    boxes: Box[];
    highlight?: boolean;
}) {
    const { t } = useTranslation();
    return (
        <div
            className="rounded-2xl p-3 sm:p-4"
            style={{
                border: `1px solid ${highlight ? 'var(--accent-glow)' : 'var(--border)'}`,
                background: highlight ? 'var(--accent-dim)' : 'transparent',
            }}
        >
            <div className="flex items-baseline gap-2 mb-2.5 flex-wrap">
                <p className="text-[10px] font-semibold uppercase tracking-widest"
                    style={{ color: highlight ? 'var(--accent)' : 'var(--text-muted)' }}>
                    {t(labelKey)}
                </p>
                {detail && <p className="text-[10px] font-mono" style={{ color: 'var(--text-muted)' }}>{detail}</p>}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                {boxes.map(box => <StatusBox key={box.key} box={box} />)}
            </div>
        </div>
    );
}

/** The labelled arrow between layers — three or four words, no more. */
function Connector({ labelKey, emphasis = false }: { labelKey: TranslationKey; emphasis?: boolean }) {
    const { t } = useTranslation();
    const color = emphasis ? 'var(--accent)' : 'var(--text-muted)';
    return (
        <div className="flex items-center gap-2 py-1.5 pl-4">
            <MdArrowDownward size={14} style={{ color }} aria-hidden="true" className="flex-shrink-0" />
            <p className="text-[11px]" style={{ color }}>{t(labelKey)}</p>
        </div>
    );
}

/**
 * One of the two places the same code runs, with its database underneath and
 * the call between them named — a file opened on the same disk, or a network
 * request to another company's service.
 */
function Branch({
    titleKey,
    host,
    diskKey,
    active,
    runtime,
    callKey,
    store,
}: {
    titleKey: TranslationKey;
    host: string;
    /** Whether this machine's disk can be written to — the reason the two differ. */
    diskKey: TranslationKey;
    active: boolean;
    runtime: Box;
    callKey: TranslationKey;
    store: Box;
}) {
    const { t } = useTranslation();
    return (
        <div
            className="rounded-2xl p-3 sm:p-4"
            style={{
                border: `1px solid ${active ? 'var(--accent-glow)' : 'var(--border)'}`,
                background: active ? 'var(--accent-dim)' : 'transparent',
                opacity: active ? 1 : 0.62,
            }}
        >
            <div className="flex items-baseline gap-2 mb-2.5 flex-wrap">
                <p className="text-[10px] font-semibold uppercase tracking-widest"
                    style={{ color: active ? 'var(--accent)' : 'var(--text-muted)' }}>
                    {t(titleKey)}
                </p>
                <p className="text-[10px] font-mono" style={{ color: 'var(--text-muted)' }}>{host}</p>
                <span className="text-[10px] px-1.5 py-0.5 rounded"
                    style={{ border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                    {t(diskKey)}
                </span>
                {active && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded"
                        style={{ background: 'var(--accent)', color: 'var(--surface)' }}>
                        {t('about.branchServingThis')}
                    </span>
                )}
            </div>

            <StatusBox box={runtime} />

            {/* The call itself — the one line that says why the two differ. */}
            <div className="flex items-center gap-2 py-1.5 pl-4">
                <MdArrowDownward size={14} style={{ color: 'var(--text-muted)' }} aria-hidden="true" className="flex-shrink-0" />
                <p className="text-[11px] font-mono" style={{ color: 'var(--text-muted)' }}>{t(callKey)}</p>
            </div>

            <StatusBox box={store} />
        </div>
    );
}

export function ArchitectureDiagram() {
    const { t, locale } = useTranslation();
    const [server, setServer] = useState<ServerStatus | null>(null);
    const [browser, setBrowser] = useState<{ positions: number; aiConnected: boolean; host: string } | null>(null);

    useEffect(() => {
        try {
            setBrowser({
                positions: getActivePositions().length,
                aiConnected: !!readToken(getActiveSetId()),
                host: window.location.host,
            });
        } catch {
            setBrowser({ positions: 0, aiConnected: false, host: '' });
        }

        let cancelled = false;
        void (async () => {
            try {
                const res = await fetch('/api/architecture');
                if (!res.ok) return;
                const data = (await res.json()) as ServerStatus;
                if (!cancelled) setServer(data);
            } catch {
                // A failed probe leaves the server boxes unknown, which is the
                // truthful answer.
            }
        })();
        return () => { cancelled = true; };
    }, []);

    const n = (value: number) => value.toLocaleString(locale);
    const serverState = (ok: boolean | undefined): State =>
        server === null ? 'unknown' : ok ? 'live' : 'off';

    const onLocal = server?.host === 'local';
    const onVercel = server?.host === 'vercel';
    const rows = server?.cache.rows != null ? t('about.detailRows', { rows: n(server.cache.rows) }) : undefined;

    const browserBoxes: Box[] = [
        { key: 'pages', titleKey: 'about.boxPages', state: 'live' },
        { key: 'engine', titleKey: 'about.boxEngine', state: 'live' },
        {
            key: 'storage',
            titleKey: 'about.boxStorage',
            state: 'live',
            detail: browser
                ? t(browser.positions === 1 ? 'about.detailPosition' : 'about.detailPositions', { count: n(browser.positions) })
                : undefined,
        },
    ];

    const providerBoxes: Box[] = [
        { key: 'yahoo', titleKey: 'about.boxYahoo', state: serverState(server?.providers.yahoo) },
        {
            key: 'jquants',
            titleKey: 'about.boxJquants',
            state: serverState(server?.providers.jquants),
            detail: server && !server.providers.jquants ? t('about.detailNoKey') : undefined,
        },
        { key: 'topix', titleKey: 'about.boxTopix', state: 'live', detail: t('about.detailStatic') },
    ];

    const aiBoxes: Box[] = [
        {
            key: 'mcp',
            titleKey: 'about.boxMcp',
            state: browser?.aiConnected ? 'live' : 'off',
            detail: browser ? t(browser.aiConnected ? 'about.detailConnected' : 'about.detailNotConnected') : undefined,
        },
    ];

    return (
        <figure className="m-0">
            <Layer
                labelKey="about.layerBrowser"
                detail={browser?.host || undefined}
                boxes={browserBoxes}
                highlight
            />
            <Connector labelKey="about.flowToServer" emphasis />

            <p className="text-[10px] font-semibold uppercase tracking-widest mb-2 pl-1"
                style={{ color: 'var(--text-muted)' }}>
                {t('about.branchesLabel')}
            </p>

            {/* Same code, two places it can run — and the databases differ only
                because one of those places has no writable disk. */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <Branch
                    titleKey="about.branchLocal"
                    host="localhost:3000"
                    diskKey="about.diskWritable"
                    active={!!onLocal}
                    runtime={{
                        key: 'local-runtime',
                        titleKey: 'about.boxRuntime',
                        state: onLocal ? 'live' : 'off',
                        detail: t('about.detailRoutes'),
                    }}
                    callKey="about.callFile"
                    store={{
                        key: 'local-store',
                        titleKey: 'about.boxSqliteFiles',
                        state: onLocal && server?.cache.kind === 'sqlite' ? 'live' : 'off',
                        detail: onLocal ? rows : undefined,
                        location: './data/marketCache.db · ./data/shares.db',
                    }}
                />
                <Branch
                    titleKey="about.branchVercel"
                    host={[t('about.hostVercel'), server?.region].filter(Boolean).join(' · ')}
                    diskKey="about.diskReadOnly"
                    active={!!onVercel}
                    runtime={{
                        key: 'vercel-runtime',
                        titleKey: 'about.boxRuntime',
                        state: onVercel ? 'live' : 'off',
                        detail: t('about.detailRoutes'),
                    }}
                    callKey="about.callHttps"
                    store={{
                        key: 'turso',
                        titleKey: 'about.boxTursoService',
                        state: onVercel && server?.cache.kind === 'turso' ? 'live' : 'off',
                        detail: onVercel ? rows : t('about.detailSeparateService'),
                        location: 'libsql://….turso.io',
                    }}
                />
            </div>

            <p className="text-[11px] mt-2.5 leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                {t('about.branchesNote')}
            </p>

            <Connector labelKey="about.flowToProviders" />
            <Layer labelKey="about.layerProviders" boxes={providerBoxes} />

            {/* A branch off the server rather than a link in the chain: nothing
                here runs until the user connects an assistant. */}
            <div className="mt-4 pt-4" style={{ borderTop: '1px dashed var(--border)' }}>
                <Layer labelKey="about.layerAi" boxes={aiBoxes} />
                <p className="text-[11px] mt-2.5 leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                    {t('about.aiNote')}
                </p>
            </div>

            <figcaption className="flex items-center gap-4 mt-4 text-[11px]" style={{ color: 'var(--text-muted)' }}>
                <span className="flex items-center gap-1.5">
                    <span className="rounded-full" style={{ width: 6, height: 6, background: 'var(--pnl-green)' }} aria-hidden="true" />
                    {t('about.legendLive')}
                </span>
                <span className="flex items-center gap-1.5">
                    <span className="rounded-full" style={{ width: 6, height: 6, background: 'var(--text-muted)' }} aria-hidden="true" />
                    {t('about.legendOff')}
                </span>
            </figcaption>
        </figure>
    );
}
