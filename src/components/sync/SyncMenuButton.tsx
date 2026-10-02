'use client';

/**
 * Quiet entry to cross-device sync from the app's menus. Doubles as the status
 * indicator: muted when sync is off, a coloured dot when it's on (green =
 * synced, amber = update waiting / needs a decision, red = error). Opens the
 * sync panel; renders nothing outside a <SyncProvider>.
 */

import { MdSync } from 'react-icons/md';
import { useTranslation } from '../../i18n';
import { useOptionalSync } from './SyncProvider';

export function useSyncIndicator() {
    const sync = useOptionalSync();
    const { t } = useTranslation();
    if (!sync) return null;
    const { status, enabled, remoteUpdate } = sync;
    const state = !enabled ? 'off'
        : status === 'error' ? 'error'
        : status === 'conflict' || remoteUpdate ? 'attention'
        : status === 'syncing' ? 'syncing'
        : 'ok';
    const label = state === 'off' ? t('nav.sync')
        : state === 'error' ? t('sync.menuError')
        : state === 'attention' ? t('sync.menuUpdate')
        : state === 'syncing' ? t('sync.menuSyncing')
        : t('sync.menuSynced');
    const dot = state === 'ok' ? 'var(--pnl-green, #22c55e)'
        : state === 'error' ? 'var(--pnl-red)'
        : state === 'attention' ? '#f59e0b'
        : null;
    return { sync, state, label, dot, title: state === 'off' ? t('sync.menuOffHint') : label };
}

function Icon({ size, state, dot }: { size: number; state: string; dot: string | null }) {
    return (
        <span className="relative inline-flex">
            <MdSync size={size} className={state === 'syncing' ? 'animate-spin' : undefined} />
            {dot && (
                <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full"
                    style={{ background: dot, border: '1px solid var(--surface-sidebar)' }} />
            )}
        </span>
    );
}

export function SyncMenuButton({ variant, className, style }: {
    variant: 'sidebar' | 'mobile';
    className: string;
    style?: React.CSSProperties;
}) {
    const ind = useSyncIndicator();
    if (!ind) return null;
    const { sync, state, label, dot, title } = ind;
    return (
        <button onClick={sync.openPanel} className={className} style={style} title={title} aria-label={title}>
            <Icon size={variant === 'sidebar' ? 17 : 20} state={state} dot={dot} />
            <span>{label}</span>
        </button>
    );
}
