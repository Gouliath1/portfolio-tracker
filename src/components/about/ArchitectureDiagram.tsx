'use client';

/**
 * The app's architecture, as the system that is running right now.
 *
 * Read top to bottom: your browser, the server it talks to, the databases that
 * server keeps, and the providers it falls back to. Every node reports its own
 * state — carrying traffic, idle in this environment, or blocked — so the
 * drawing cannot quietly claim a piece works when it does not. The state comes
 * from /api/architecture and from localStorage, on mount.
 *
 * Laid out with elements rather than an SVG: the labels are translated, and a
 * French string runs half again as long as its English original, so text that
 * wraps is the only version that survives. It also inherits the theme tokens,
 * which keeps one drawing correct in light and dark.
 */

import { useEffect, useState } from 'react';
import {
    MdArrowDownward, MdLaptopMac, MdDns, MdStorage, MdCloudQueue,
    MdShowChart, MdInsights, MdListAlt, MdSmartToy,
} from 'react-icons/md';
import type { IconType } from 'react-icons';
import { useTranslation } from '../../i18n';
import type { TranslationKey } from '../../i18n';
import { getActiveSetId, getActivePositions } from '../../utils/localPositions';
import { readToken } from '../../utils/aiConnection';

/**
 * What a node is doing, which is also what colours it.
 *  - `live`    — carrying traffic right now
 *  - `idle`    — real, but unused in this environment (the other database)
 *  - `blocked` — meant to be working and is not
 *  - `unknown` — the status probe has not answered yet
 */
type State = 'live' | 'idle' | 'blocked' | 'unknown';

type Storage = 'turso' | 'sqlite' | 'unavailable';

interface ServerStatus {
    environment: 'development' | 'production';
    host: 'local' | 'vercel';
    region: string | null;
    cache: { kind: Storage; location: string | null; rows: number | null; reason: string | null };
    shares: { available: boolean; kind: Storage; location: string | null; reason: string | null };
    providers: { yahoo: boolean; jquants: boolean };
}

const palette: Record<State, { border: string; background: string; dot: string; title: string }> = {
    live:    { border: 'var(--accent-glow)', background: 'var(--surface)',    dot: 'var(--accent)',     title: 'var(--text-primary)' },
    idle:    { border: 'var(--border)',      background: 'transparent',       dot: 'var(--text-muted)', title: 'var(--text-secondary)' },
    blocked: { border: 'var(--warn-glow)',   background: 'var(--warn-dim)',   dot: 'var(--warn)',       title: 'var(--text-primary)' },
    unknown: { border: 'var(--border)',      background: 'transparent',       dot: 'var(--text-muted)', title: 'var(--text-secondary)' },
};

/** A labelled fact inside a node — the same labels in the same order across peers. */
interface Field {
    labelKey: TranslationKey;
    value: string;
    mono?: boolean;
}

interface NodeSpec {
    key: string;
    icon: IconType;
    titleKey: TranslationKey;
    /** One line under the title, saying what it does. */
    subtitleKey?: TranslationKey;
    /** Who runs it — the corner tag. Not translated: these are proper names. */
    tag?: string;
    state: State;
    /** Free lines, for nodes that need no field labels. */
    lines?: string[];
    /** Labelled rows, for nodes that are meant to be compared with a peer. */
    fields?: Field[];
}

function Node({ node }: { node: NodeSpec }) {
    const { t } = useTranslation();
    const tone = palette[node.state];
    const Icon = node.icon;

    return (
        <div
            className="rounded-2xl px-3.5 py-3 h-full"
            style={{
                border: `1.5px solid ${tone.border}`,
                background: tone.background,
                opacity: node.state === 'idle' ? 0.7 : 1,
            }}
        >
            <div className="flex items-start gap-2.5">
                <Icon size={18} style={{ color: tone.dot }} className="flex-shrink-0 mt-px" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                        <p className="text-[13px] font-semibold leading-tight" style={{ color: tone.title }}>
                            {t(node.titleKey)}
                        </p>
                        {node.tag && (
                            <span className="text-[9px] font-semibold uppercase tracking-[0.12em] flex-shrink-0"
                                style={{ color: 'var(--text-muted)' }}>
                                {node.tag}
                            </span>
                        )}
                    </div>
                    {node.subtitleKey && (
                        <p className="text-[11px] mt-0.5 leading-snug" style={{ color: 'var(--text-secondary)' }}>
                            {t(node.subtitleKey)}
                        </p>
                    )}
                </div>
            </div>

            {node.lines && node.lines.length > 0 && (
                <div className="mt-2 pl-[28px] space-y-0.5">
                    {node.lines.map(line => (
                        <p key={line} className="text-[10.5px] leading-snug" style={{ color: 'var(--text-muted)' }}>
                            {line}
                        </p>
                    ))}
                </div>
            )}

            {node.fields && (
                <dl className="mt-2 pl-[28px] grid gap-x-2 gap-y-1"
                    style={{ gridTemplateColumns: 'auto minmax(0, 1fr)' }}>
                    {node.fields.map(field => (
                        <div key={field.labelKey} className="contents">
                            <dt className="text-[9px] font-semibold uppercase tracking-[0.12em] leading-tight pt-px"
                                style={{ color: 'var(--text-muted)' }}>
                                {t(field.labelKey)}
                            </dt>
                            <dd className={`m-0 leading-snug break-words ${field.mono ? 'font-mono text-[10px]' : 'text-[10.5px]'}`}
                                style={{ color: 'var(--text-muted)' }}>
                                {field.value}
                            </dd>
                        </div>
                    ))}
                </dl>
            )}
        </div>
    );
}

/** The step between two nodes, labelled with what actually crosses. */
function Flow({ labelKey, live = true }: { labelKey: TranslationKey; live?: boolean }) {
    const { t } = useTranslation();
    const color = live ? 'var(--accent)' : 'var(--text-muted)';
    return (
        <div className="flex items-center gap-2 py-2 pl-5">
            <MdArrowDownward size={15} style={{ color }} className="flex-shrink-0" aria-hidden="true" />
            <p className="text-[11px]" style={{ color }}>{t(labelKey)}</p>
        </div>
    );
}

/** A dashed enclosure — everything inside it is one place or one role. */
function Group({
    labelKey,
    detail,
    children,
}: {
    labelKey: TranslationKey;
    detail?: string;
    children: React.ReactNode;
}) {
    const { t } = useTranslation();
    return (
        <div className="rounded-2xl p-3 sm:p-4" style={{ border: '1px dashed var(--border-strong)' }}>
            <div className="flex items-baseline gap-2 mb-2.5 flex-wrap">
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em]"
                    style={{ color: 'var(--text-muted)' }}>
                    {t(labelKey)}
                </p>
                {detail && <p className="text-[10px] font-mono" style={{ color: 'var(--text-muted)' }}>{detail}</p>}
            </div>
            {children}
        </div>
    );
}

function Legend() {
    const { t } = useTranslation();
    const entries: { state: State; labelKey: TranslationKey }[] = [
        { state: 'live', labelKey: 'about.legendLive' },
        { state: 'idle', labelKey: 'about.legendIdle' },
        { state: 'blocked', labelKey: 'about.legendBlocked' },
    ];
    return (
        <div className="flex items-center gap-4 flex-wrap">
            {entries.map(entry => (
                <span key={entry.state} className="flex items-center gap-1.5 text-[10.5px]"
                    style={{ color: 'var(--text-muted)' }}>
                    <span className="rounded-[3px]"
                        style={{
                            width: 10, height: 10,
                            border: `1.5px solid ${palette[entry.state].border}`,
                            background: palette[entry.state].background,
                        }}
                        aria-hidden="true"
                    />
                    {t(entry.labelKey)}
                </span>
            ))}
        </div>
    );
}

export function ArchitectureDiagram() {
    const { t, locale } = useTranslation();
    const [server, setServer] = useState<ServerStatus | null>(null);
    const [browser, setBrowser] = useState<{ positions: number; aiConnected: boolean } | null>(null);

    useEffect(() => {
        try {
            setBrowser({
                positions: getActivePositions().length,
                aiConnected: !!readToken(getActiveSetId()),
            });
        } catch {
            setBrowser({ positions: 0, aiConnected: false });
        }

        let cancelled = false;
        void (async () => {
            try {
                const res = await fetch('/api/architecture');
                if (!res.ok) return;
                const data = (await res.json()) as ServerStatus;
                if (!cancelled) setServer(data);
            } catch {
                // A failed probe leaves the server nodes unknown, which is the
                // truthful answer.
            }
        })();
        return () => { cancelled = true; };
    }, []);

    const n = (value: number) => value.toLocaleString(locale);

    /**
     * The database this environment is configured to use. A cache that failed
     * to open reports no kind of its own, so the share store — which reads the
     * same credentials — says which one was meant.
     */
    const intended: Storage | undefined = server
        ? (server.cache.kind !== 'unavailable' ? server.cache.kind : server.shares.kind)
        : undefined;

    const storeState = (kind: Storage): State => {
        if (!server) return 'unknown';
        if (kind !== intended) return 'idle';
        // The configured store failing is the case worth shouting about: it
        // means every request goes to the provider with nothing kept.
        return server.cache.kind === 'unavailable' ? 'blocked' : 'live';
    };

    const storeNow = (kind: Storage): string => {
        if (!server) return '—';
        if (kind !== intended) return t('about.nowUnused');
        if (server.cache.kind === 'unavailable') return t('about.nowWritesBlocked');
        const parts = [t('about.detailRows', { rows: n(server.cache.rows ?? 0) })];
        if (server.shares.available) parts.push(t('about.detailHoldsSnapshots'));
        return parts.join(' · ');
    };

    /** Both databases answer the same questions in the same order, so they compare. */
    const storeFields = (kind: Storage, techKey: TranslationKey, whereKey: TranslationKey, address: string): Field[] => [
        { labelKey: 'about.fieldTech', value: t(techKey) },
        { labelKey: 'about.fieldWhere', value: t(whereKey) },
        { labelKey: 'about.fieldAddress', value: address, mono: true },
        { labelKey: 'about.fieldNow', value: storeNow(kind) },
    ];

    const serverDetail = server
        ? [t(server.host === 'vercel' ? 'about.hostVercel' : 'about.hostLocal'), server.region]
            .filter(Boolean).join(' · ')
        : undefined;

    const providerState = (ok: boolean | undefined): State =>
        server === null ? 'unknown' : ok ? 'live' : 'idle';

    const providers: NodeSpec[] = [
        {
            key: 'yahoo', icon: MdShowChart, titleKey: 'about.boxYahoo', tag: 'YAHOO',
            subtitleKey: 'about.subYahoo', state: providerState(server?.providers.yahoo),
        },
        {
            key: 'jquants', icon: MdInsights, titleKey: 'about.boxJquants', tag: 'JPX',
            subtitleKey: 'about.subJquants', state: providerState(server?.providers.jquants),
            lines: server && !server.providers.jquants ? [t('about.detailNoKey')] : undefined,
        },
        {
            key: 'topix', icon: MdListAlt, titleKey: 'about.boxTopix', tag: 'BLACKROCK',
            subtitleKey: 'about.subTopix', state: 'live', lines: [t('about.detailStatic')],
        },
    ];

    return (
        <figure className="m-0">
            <div className="mb-4"><Legend /></div>

            {/* 1 — the browser, which is where the portfolio actually lives */}
            <Node node={{
                key: 'browser',
                icon: MdLaptopMac,
                titleKey: 'about.layerBrowser',
                subtitleKey: 'about.subBrowser',
                tag: 'YOU',
                state: 'live',
                lines: browser
                    ? [
                        t(browser.positions === 1 ? 'about.detailPosition' : 'about.detailPositions', { count: n(browser.positions) }),
                        t('about.detailBrowserMath'),
                    ]
                    : undefined,
            }} />

            <Flow labelKey="about.flowToServer" />

            {/* 2 — the server and the database it keeps, in one enclosure */}
            <Group labelKey="about.groupServer" detail={serverDetail}>
                <Node node={{
                    key: 'app',
                    icon: MdDns,
                    titleKey: 'about.boxRuntime',
                    subtitleKey: 'about.detailRoutes',
                    tag: server?.host === 'vercel' ? 'VERCEL' : 'LOCAL',
                    state: server ? 'live' : 'unknown',
                }} />

                <Flow labelKey="about.flowToStore" live={server?.cache.kind !== 'unavailable'} />

                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] mb-2"
                    style={{ color: 'var(--text-muted)' }}>
                    {t('about.subStores')}
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 items-stretch">
                    <Node node={{
                        key: 'sqlite',
                        icon: MdStorage,
                        titleKey: 'about.boxSqliteFiles',
                        tag: 'LOCAL',
                        state: storeState('sqlite'),
                        fields: storeFields('sqlite', 'about.techSqliteFile', 'about.whereSameMachine',
                            './data/marketCache.db · ./data/shares.db'),
                    }} />
                    <Node node={{
                        key: 'turso',
                        icon: MdCloudQueue,
                        titleKey: 'about.boxTursoService',
                        tag: 'TURSO',
                        state: storeState('turso'),
                        fields: storeFields('turso', 'about.techSqliteHosted', 'about.whereTurso',
                            'libsql://….turso.io'),
                    }} />
                </div>
            </Group>

            <Flow labelKey="about.flowToProviders" />

            {/* 3 — where the numbers originally come from */}
            <Group labelKey="about.layerProviders">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 items-stretch">
                    {providers.map(provider => <Node key={provider.key} node={provider} />)}
                </div>
            </Group>

            {/* 4 — the opt-in branch, which is off until the user turns it on */}
            <div className="mt-4 pt-4" style={{ borderTop: '1px dashed var(--border)' }}>
                <Group labelKey="about.layerAi">
                    <Node node={{
                        key: 'mcp',
                        icon: MdSmartToy,
                        titleKey: 'about.boxMcp',
                        subtitleKey: 'about.subMcp',
                        tag: 'MCP',
                        state: browser?.aiConnected ? 'live' : 'idle',
                        lines: browser
                            ? [t(browser.aiConnected ? 'about.detailConnected' : 'about.detailNotConnected')]
                            : undefined,
                    }} />
                </Group>
            </div>

            {/* The failure the drawing is currently reporting, in words. */}
            {server?.cache.reason && (
                <p className="text-[10.5px] mt-3 leading-relaxed font-mono break-words"
                    style={{ color: 'var(--warn)' }}>
                    {server.cache.reason}
                </p>
            )}

            <figcaption className="text-[11px] mt-3 leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                {t('about.diagramNote')}
            </figcaption>
        </figure>
    );
}
