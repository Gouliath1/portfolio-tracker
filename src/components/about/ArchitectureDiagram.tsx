'use client';

/**
 * The app's architecture, as the system that is running right now.
 *
 * Read top to bottom: your browser, the server it talks to, the database that
 * server keeps, and the providers it falls back to. Every node reports its own
 * state — carrying traffic, idle in this environment, or blocked — so the
 * drawing cannot quietly claim a piece works when it does not. The state comes
 * from /api/architecture and from localStorage, on mount.
 *
 * Nodes are sized to their contents and centred under one another rather than
 * stretched to the page, so the flow reads as a line of cards instead of a
 * stack of bars. Within a node the lines keep a fixed order — what it is,
 * where it sits, its address, what it holds now — which is what lets the two
 * databases be compared at a glance without labelling every row.
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

/**
 * A node's colour carries its state, so the states have to be separable at a
 * glance: the two that matter — carrying traffic, and failing — take the full
 * accent and warning colours at double width, while the ones that are merely
 * present stay hairline and grey.
 */
const palette: Record<State, { border: string; width: string; background: string; icon: string; title: string }> = {
    live:    { border: 'var(--accent)',  width: '2px', background: 'var(--surface)',  icon: 'var(--accent)',     title: 'var(--text-primary)' },
    idle:    { border: 'var(--border)',  width: '1px', background: 'transparent',     icon: 'var(--text-muted)', title: 'var(--text-secondary)' },
    blocked: { border: 'var(--warn)',    width: '2px', background: 'var(--warn-dim)', icon: 'var(--warn)',       title: 'var(--text-primary)' },
    unknown: { border: 'var(--border)',  width: '1px', background: 'transparent',     icon: 'var(--text-muted)', title: 'var(--text-secondary)' },
};

/** A small grey line of specifics under a node's name. */
interface Line {
    text: string;
    /** Paths, hostnames and anything else meant to be read as an identifier. */
    mono?: boolean;
}

interface NodeSpec {
    icon: IconType;
    titleKey: TranslationKey;
    /** One line under the title, saying what it does. */
    subtitleKey?: TranslationKey;
    /** Who runs it — the corner tag. Not translated: these are proper names. */
    tag?: string;
    state: State;
    lines?: (Line | null)[];
}

function Node({ node, className = '' }: { node: NodeSpec; className?: string }) {
    const { t } = useTranslation();
    const tone = palette[node.state];
    const Icon = node.icon;
    const lines = (node.lines ?? []).filter((line): line is Line => line !== null);

    return (
        <div
            className={`rounded-2xl px-3.5 py-3 ${className}`}
            style={{
                border: `${tone.width} solid ${tone.border}`,
                background: tone.background,
                opacity: node.state === 'idle' ? 0.65 : 1,
                boxShadow: node.state === 'live' ? '0 1px 3px var(--accent-dim)' : undefined,
            }}
        >
            <div className="flex items-start gap-2.5">
                <Icon size={17} style={{ color: tone.icon }} className="flex-shrink-0 mt-0.5" aria-hidden="true" />
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

            {lines.length > 0 && (
                <div className="mt-2 space-y-0.5">
                    {lines.map(line => (
                        <p key={line.text}
                            className={`leading-snug break-words ${line.mono ? 'font-mono text-[10px]' : 'text-[10.5px]'}`}
                            style={{ color: 'var(--text-muted)' }}>
                            {line.text}
                        </p>
                    ))}
                </div>
            )}
        </div>
    );
}

/** The step between two nodes, labelled with what actually crosses. */
function Flow({ labelKey, live = true }: { labelKey: TranslationKey; live?: boolean }) {
    const { t } = useTranslation();
    const color = live ? 'var(--accent)' : 'var(--text-muted)';
    return (
        <div className="flex items-center gap-2 py-2">
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
        <div className="w-full rounded-2xl py-3 px-3 sm:px-4" style={{ border: '1px dashed var(--border-strong)' }}>
            <div className="flex items-baseline gap-2 mb-3 flex-wrap">
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em]"
                    style={{ color: 'var(--text-muted)' }}>
                    {t(labelKey)}
                </p>
                {detail && <p className="text-[10px] font-mono" style={{ color: 'var(--text-muted)' }}>{detail}</p>}
            </div>
            <div className="flex flex-col items-center">{children}</div>
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
                            width: 11, height: 11,
                            border: `${palette[entry.state].width} solid ${palette[entry.state].border}`,
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

/** Widths are set per node so a card is as wide as it needs to be, no wider. */
const SPINE = 'w-full max-w-[22rem]';
const STORE = 'w-full sm:w-[17rem]';
const PROVIDER = 'w-full sm:w-[13rem]';

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

    /**
     * Both databases say the same things in the same order — what it is, where
     * it sits, its address, what it holds now — so they read as two answers to
     * one question rather than two different descriptions.
     */
    const storeLines = (kind: Storage, whereKey: TranslationKey, address: string): Line[] => [
        { text: t('about.techSqlite') },
        { text: t(whereKey) },
        { text: address, mono: true },
        { text: storeNow(kind) },
    ];

    /** Locally the server is this machine, which is worth saying rather than implying. */
    const serverDetail = server
        ? (server.host === 'vercel'
            ? [t('about.hostVercel'), server.region].filter(Boolean).join(' · ')
            : t('about.hostLocal'))
        : undefined;

    const providerState = (ok: boolean | undefined): State =>
        server === null ? 'unknown' : ok ? 'live' : 'idle';

    return (
        <figure className="m-0">
            <div className="mb-4"><Legend /></div>

            <div className="flex flex-col items-center">

                {/* 1 — the browser, which is where the portfolio actually lives */}
                <Node className={SPINE} node={{
                    icon: MdLaptopMac,
                    titleKey: 'about.layerBrowser',
                    subtitleKey: 'about.subBrowser',
                    tag: 'YOU',
                    state: 'live',
                    lines: [
                        browser
                            ? { text: t(browser.positions === 1 ? 'about.detailPosition' : 'about.detailPositions', { count: n(browser.positions) }) }
                            : null,
                        { text: t('about.detailBrowserMath') },
                    ],
                }} />

                <Flow labelKey="about.flowToServer" />

                {/* 2 — the server and the database it keeps, in one enclosure */}
                <Group labelKey="about.groupServer" detail={serverDetail}>
                    <Node className={SPINE} node={{
                        icon: MdDns,
                        titleKey: 'about.boxRuntime',
                        subtitleKey: 'about.detailRoutes',
                        tag: server?.host === 'vercel' ? 'VERCEL' : 'LOCAL',
                        state: server ? 'live' : 'unknown',
                        lines: [
                            { text: t('about.lineAppCacheFirst') },
                            { text: t('about.lineAppNoHoldings') },
                        ],
                    }} />

                    <Flow labelKey="about.flowToStore" live={server?.cache.kind !== 'unavailable'} />

                    <p className="text-[10px] font-semibold uppercase tracking-[0.18em] mb-2 text-center"
                        style={{ color: 'var(--text-muted)' }}>
                        {t('about.subStores')}
                    </p>
                    <div className="flex flex-wrap justify-center gap-2.5 w-full">
                        <Node className={STORE} node={{
                            icon: MdStorage,
                            titleKey: 'about.boxSqliteFiles',
                            tag: 'LOCAL',
                            state: storeState('sqlite'),
                            lines: storeLines('sqlite', 'about.whereSameMachine', './data/*.db'),
                        }} />
                        <Node className={STORE} node={{
                            icon: MdCloudQueue,
                            titleKey: 'about.boxTursoService',
                            tag: 'TURSO',
                            state: storeState('turso'),
                            lines: storeLines('turso', 'about.whereTurso', 'libsql://….turso.io'),
                        }} />
                    </div>
                </Group>

                <Flow labelKey="about.flowToProviders" />

                {/* 3 — where the numbers originally come from */}
                <Group labelKey="about.layerProviders">
                    <div className="flex flex-wrap justify-center gap-2.5 w-full">
                        <Node className={PROVIDER} node={{
                            icon: MdShowChart,
                            titleKey: 'about.boxYahoo',
                            subtitleKey: 'about.subYahoo',
                            tag: 'YAHOO',
                            state: providerState(server?.providers.yahoo),
                            lines: [{ text: t('about.lineNoKeyNeeded') }],
                        }} />
                        <Node className={PROVIDER} node={{
                            icon: MdInsights,
                            titleKey: 'about.boxJquants',
                            subtitleKey: 'about.subJquants',
                            tag: 'JPX',
                            state: providerState(server?.providers.jquants),
                            lines: [{ text: t(server?.providers.jquants ? 'about.lineKeySet' : 'about.detailNoKey') }],
                        }} />
                        <Node className={PROVIDER} node={{
                            icon: MdListAlt,
                            titleKey: 'about.boxTopix',
                            subtitleKey: 'about.subTopix',
                            tag: 'BLACKROCK',
                            state: 'live',
                            lines: [{ text: t('about.lineBundled') }],
                        }} />
                    </div>
                </Group>

                {/* 4 — the opt-in branch, which is off until the user turns it on */}
                <div className="w-full mt-4 pt-4" style={{ borderTop: '1px dashed var(--border)' }}>
                    <Group labelKey="about.layerAi">
                        <Node className={SPINE} node={{
                            icon: MdSmartToy,
                            titleKey: 'about.boxMcp',
                            subtitleKey: 'about.subMcp',
                            tag: 'MCP',
                            state: browser?.aiConnected ? 'live' : 'idle',
                            lines: [
                                browser ? { text: t(browser.aiConnected ? 'about.detailConnected' : 'about.detailNotConnected') } : null,
                            ],
                        }} />
                    </Group>
                </div>
            </div>

            {/* The failure the drawing is currently reporting, in words. */}
            {server?.cache.reason && (
                <p className="text-[10.5px] mt-4 leading-relaxed font-mono break-words"
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
