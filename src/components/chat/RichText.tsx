'use client';

import { MdOpenInNew } from 'react-icons/md';
import { useMemo } from 'react';
import { useTranslation } from '../../i18n';
import { isNumericText, parseActionSpec, parseBlocks, parseChartSpec, type Block, type Inline } from '../../utils/chatRichText';
import { ChatChart } from './ChatChart';
import { ActionCard } from '../ai/ActionCard';

/**
 * Renders a chat answer: paragraphs, lists, bold, tables, links and charts.
 *
 * Built from React elements only — never `dangerouslySetInnerHTML` — so the
 * model's text cannot inject markup. Gains and losses (+4.2%, −3%) take the
 * P&L colours already used across the app.
 */

const TONE = { pos: 'var(--pnl-green)', neg: 'var(--pnl-red)' } as const;

function Inlines({ nodes }: { nodes: Inline[] }) {
    const { t } = useTranslation();
    return (
        <>
            {nodes.map((n, i) => {
                switch (n.t) {
                    case 'text':
                        return n.tone
                            ? <span key={i} className="font-medium tabular-nums" style={{ color: TONE[n.tone] }}>{n.v}</span>
                            : <span key={i}>{n.v}</span>;
                    case 'bold':
                        return <strong key={i} className="font-semibold"><Inlines nodes={n.c} /></strong>;
                    case 'em':
                        return <em key={i}><Inlines nodes={n.c} /></em>;
                    case 'code':
                        return <code key={i} className="px-1 rounded text-[0.92em] font-mono" style={{ background: 'var(--accent-dim)' }}>{n.v}</code>;
                    case 'link':
                        // Always a new tab: following a link must not throw away the conversation.
                        return (
                            <a key={i} href={n.href} target="_blank" rel="noopener noreferrer"
                                className="underline underline-offset-2 decoration-1 hover:opacity-80 focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
                                style={{ color: 'var(--accent)' }}>
                                {n.v}
                                {n.external && <MdOpenInNew size={12} className="inline ml-0.5 -mt-0.5" aria-hidden="true" />}
                                <span className="sr-only"> {t('chat.opensNewTab')}</span>
                            </a>
                        );
                }
            })}
        </>
    );
}

const plain = (cell: Inline[]): string =>
    cell.map(n => (n.t === 'bold' || n.t === 'em' ? plain(n.c) : n.v)).join('');
const looksNumeric = (cell: Inline[]) => isNumericText(plain(cell));

function BlockView({ block, streaming }: { block: Block; streaming: boolean }) {
    const { t } = useTranslation();
    switch (block.t) {
        case 'p':
            return <p className="whitespace-pre-line break-words"><Inlines nodes={block.c} /></p>;
        case 'heading':
            return <p className="font-semibold pt-1"><Inlines nodes={block.c} /></p>;
        case 'ul':
            return <ul className="list-disc pl-5 space-y-1 marker:text-[var(--text-muted)]">{block.items.map((it, i) => <li key={i}><Inlines nodes={it} /></li>)}</ul>;
        case 'ol':
            return <ol className="list-decimal pl-5 space-y-1 marker:text-[var(--text-muted)]">{block.items.map((it, i) => <li key={i}><Inlines nodes={it} /></li>)}</ol>;
        case 'code':
            return <pre className="text-xs font-mono overflow-x-auto rounded-lg p-2" style={{ background: 'var(--accent-dim)' }}>{block.v}</pre>;
        case 'table':
            return (
                <div className="overflow-x-auto">
                    <table className="w-full text-xs border-collapse">
                        <thead>
                            <tr>{block.head.map((h, i) => (
                                <th key={i} scope="col" className={`py-1 pr-3 font-medium whitespace-nowrap ${i > 0 && block.rows[0] && looksNumeric(block.rows[0][i] ?? []) ? 'text-right' : 'text-left'}`}
                                    style={{ color: 'var(--text-muted)', borderBottom: '1px solid var(--border-strong)' }}>
                                    <Inlines nodes={h} />
                                </th>
                            ))}</tr>
                        </thead>
                        <tbody>
                            {block.rows.map((row, r) => (
                                <tr key={r}>{row.map((cell, i) => (
                                    <td key={i} className={`py-1 pr-3 align-top ${looksNumeric(cell) ? 'text-right tabular-nums whitespace-nowrap' : ''}`}
                                        style={{ borderBottom: '1px solid var(--border)' }}>
                                        <Inlines nodes={cell} />
                                    </td>
                                ))}</tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            );
        case 'action': {
            // Only a finished, valid block becomes a card; a half-streamed one waits.
            const spec = block.complete ? parseActionSpec(block.raw) : null;
            return spec ? <ActionCard id={spec.id} reason={spec.reason} /> : null;
        }
        case 'chart': {
            const spec = block.complete ? parseChartSpec(block.raw) : null;
            if (spec) return <ChatChart spec={spec} />;
            // Still arriving: hold the space. Finished but unusable: show nothing rather than broken JSON.
            return block.complete || !streaming ? null : (
                <div className="my-2 rounded-lg px-3 py-3 text-xs animate-pulse" style={{ border: '1px dashed var(--border-strong)', color: 'var(--text-muted)' }}>
                    {t('chat.chartLoading')}
                </div>
            );
        }
    }
}

export function RichText({ text, streaming = false }: { text: string; streaming?: boolean }) {
    const blocks = useMemo(() => parseBlocks(text), [text]);
    return (
        <div className="space-y-2 leading-relaxed">
            {blocks.map((b, i) => <BlockView key={i} block={b} streaming={streaming} />)}
        </div>
    );
}
