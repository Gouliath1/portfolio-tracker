'use client';

import { useState } from 'react';
import { MdBolt, MdCheck } from 'react-icons/md';
import { useTranslation } from '../../i18n';
import { useAiActionRegistry } from './aiActions';

type Status = 'idle' | 'running' | 'done' | 'started' | 'failed' | 'dismissed';

/**
 * A proposed page action, awaiting the user's decision. The model can only ask
 * for an id; what the card says and does comes from the page's own registry,
 * so an id the page doesn't offer renders as unavailable, never as a button.
 */
export function ActionCard({ id, reason }: { id: string; reason?: string }) {
    const { t } = useTranslation();
    const registry = useAiActionRegistry();
    const [status, setStatus] = useState<Status>('idle');
    const action = registry?.find(id);

    if (status === 'dismissed') return null;

    const run = async () => {
        if (!action || action.disabled) return;
        setStatus('running');
        try {
            const outcome = await action.run();
            setStatus(outcome === 'started' ? 'started' : 'done');
            registry?.ran();
        } catch {
            setStatus('failed');
        }
    };

    const frame = 'my-2 rounded-lg px-3 py-2.5 space-y-2 text-sm';
    const style = { background: 'var(--accent-dim)', border: '1px solid var(--accent-glow)' };

    if (!action) {
        return (
            <div className={frame} style={{ border: '1px dashed var(--border-strong)', color: 'var(--text-muted)' }}>
                {t('ai.action.unavailable')}
            </div>
        );
    }

    const finished = status === 'done' || status === 'started';
    return (
        <div className={frame} style={style} role="group" aria-label={t('ai.action.suggested')}>
            <div className="flex items-start gap-2">
                <MdBolt size={16} className="mt-0.5 flex-shrink-0" style={{ color: 'var(--accent)' }} aria-hidden="true" />
                <div className="min-w-0 space-y-0.5">
                    <p className="font-medium" style={{ color: 'var(--text-primary)' }}>{action.label}</p>
                    {(action.detail || reason) && (
                        <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{reason || action.detail}</p>
                    )}
                </div>
            </div>
            {finished ? (
                <p className="text-xs flex items-center gap-1" style={{ color: 'var(--accent)' }}>
                    <MdCheck size={14} aria-hidden="true" />
                    {t(status === 'started' ? 'ai.action.started' : 'ai.action.done')}
                </p>
            ) : (
                <div className="flex items-center gap-2">
                    <button onClick={run} disabled={status === 'running' || action.disabled}
                        className="h-8 px-3 rounded-lg text-xs font-medium transition-all disabled:opacity-50"
                        style={{ background: 'var(--accent)', color: 'var(--surface)' }}>
                        {status === 'running' ? t('ai.action.running') : t('ai.action.run')}
                    </button>
                    <button onClick={() => setStatus('dismissed')} disabled={status === 'running'}
                        className="h-8 px-3 rounded-lg text-xs font-medium transition-all disabled:opacity-50"
                        style={{ color: 'var(--text-secondary)', border: '1px solid var(--border)' }}>
                        {t('ai.action.dismiss')}
                    </button>
                    {status === 'failed' && (
                        <span role="alert" className="text-xs" style={{ color: 'var(--pnl-red)' }}>{t('ai.action.failed')}</span>
                    )}
                </div>
            )}
        </div>
    );
}
