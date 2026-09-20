'use client';

import React, { useState, useEffect } from 'react';
import { MdDownload, MdDelete, MdWarning, MdSwapHoriz, MdCheckCircle, MdEdit, MdCheck, MdClose } from 'react-icons/md';
import {
    getPositionSets,
    getActiveSetId,
    activateSet,
    deleteSet,
    renameSet,
    exportSetTransactions,
    PositionSetLocal,
} from '../../utils/localPositions';
import { readTaxSettingsForBackup } from '../../utils/taxSettingsBackup';
import { useTranslation } from '../../i18n';
import type { TranslationKey } from '../../i18n';

interface PositionSetManagerProps {
    onPositionSetChanged?: () => void;
    refreshTrigger?: number;
}

const PositionSetManager: React.FC<PositionSetManagerProps> = ({ onPositionSetChanged, refreshTrigger }) => {
    const { t, locale } = useTranslation();
    const [sets, setSets] = useState<PositionSetLocal[]>([]);
    const [activeId, setActiveId] = useState<string>('demo');
    // The highlighted row — a pending choice, not applied until the user confirms.
    const [selectedId, setSelectedId] = useState<string>('demo');
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editName, setEditName] = useState('');
    const [error, setError] = useState<TranslationKey | null>(null);

    const refresh = () => {
        setSets(getPositionSets());
        const active = getActiveSetId();
        setActiveId(active);
        setSelectedId(active);
    };

    useEffect(() => { refresh(); }, [refreshTrigger]);

    const handleActivate = (id: string) => {
        if (id === activeId) return;
        try {
            activateSet(id);
            refresh();
            onPositionSetChanged?.();
        } catch {
            setError('sets.errSwitch');
        }
    };

    const handleDelete = (id: string) => {
        try {
            const wasActive = getActiveSetId() === id;
            deleteSet(id);
            setDeletingId(null);
            refresh();
            if (wasActive) onPositionSetChanged?.();
        } catch {
            setError('sets.errDelete');
        }
    };

    const startRename = (set: PositionSetLocal) => {
        setEditingId(set.id);
        setEditName(set.display_name);
    };

    const handleRename = (id: string) => {
        const name = editName.trim();
        if (!name) { setEditingId(null); return; }
        try {
            renameSet(id, name);
            setEditingId(null);
            refresh();
            if (getActiveSetId() === id) onPositionSetChanged?.();
        } catch {
            setError('sets.errRename');
        }
    };

    const handleExport = (id: string, name: string) => {
        try {
            const transactions = exportSetTransactions(id);
            // Tax setup lives outside the transaction list — bundled in here (under
            // a key the importer already tolerates) so exporting stays a full backup.
            const taxSettings = readTaxSettingsForBackup();
            const payload = taxSettings ? { transactions, taxSettings } : transactions;
            const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${name}-transactions.json`;
            document.body.appendChild(a);
            a.click();
            URL.revokeObjectURL(url);
            document.body.removeChild(a);
        } catch {
            setError('sets.errSave');
        }
    };

    const formatDate = (iso: string) =>
        new Date(iso).toLocaleDateString(locale, { year: 'numeric', month: 'short', day: 'numeric' });

    const selectedSet = sets.find(s => s.id === selectedId);
    const showConfirm = selectedId !== activeId && !!selectedSet;

    return (
        <div className="space-y-3">
            {error && (
                <div className="rounded-lg px-4 py-3 flex items-start gap-3"
                    style={{ background: 'var(--pnl-red-dim)', border: '1px solid var(--pnl-red)' }}>
                    <MdWarning className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: 'var(--pnl-red)' }} />
                    <p className="text-sm flex-1" style={{ color: 'var(--text-primary)' }}>{t(error)}</p>
                    <button onClick={() => setError(null)} className="opacity-50 hover:opacity-100"
                        style={{ color: 'var(--text-primary)' }}>✕</button>
                </div>
            )}

            <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
                {sets.length === 0 && (
                    <div className="py-10 text-center" style={{ background: 'var(--surface)' }}>
                        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{t('sets.empty')}</p>
                    </div>
                )}

                {sets.map((set, i) => {
                    const isActive = set.id === activeId;
                    const isSelected = set.id === selectedId;
                    const isDeleting = deletingId === set.id;
                    const isEditing = editingId === set.id;
                    const notLast = i < sets.length - 1;
                    const created = formatDate(set.created_at);
                    const updated = formatDate(set.updated_at);

                    return (
                        <div
                            key={set.id}
                            style={{
                                background: isSelected ? 'var(--accent-dim)' : 'var(--surface)',
                                borderBottom: notLast ? '1px solid var(--border)' : 'none',
                                transition: 'background 150ms',
                            }}
                        >
                            {isEditing ? (
                                <div className="flex items-center gap-2 px-4 py-3.5">
                                    <input
                                        autoFocus
                                        value={editName}
                                        onChange={(e) => setEditName(e.target.value)}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') handleRename(set.id);
                                            if (e.key === 'Escape') setEditingId(null);
                                        }}
                                        className="flex-1 min-w-0 px-3 py-1.5 rounded-lg text-sm bg-transparent outline-none"
                                        style={{ color: 'var(--text-primary)', border: '1px solid var(--accent)' }}
                                        aria-label={t('sets.nameLabel')}
                                    />
                                    <button
                                        onClick={() => handleRename(set.id)}
                                        className="p-2 rounded-md transition-opacity opacity-70 hover:opacity-100 flex-shrink-0"
                                        style={{ color: 'var(--pnl-green)' }}
                                        title={t('sets.saveName')}
                                        aria-label={t('sets.saveName')}
                                    >
                                        <MdCheck className="w-4 h-4" />
                                    </button>
                                    <button
                                        onClick={() => setEditingId(null)}
                                        className="p-2 rounded-md transition-opacity opacity-40 hover:opacity-90 flex-shrink-0"
                                        style={{ color: 'var(--text-secondary)' }}
                                        title={t('common.cancel')}
                                        aria-label={t('sets.cancelRename')}
                                    >
                                        <MdClose className="w-4 h-4" />
                                    </button>
                                </div>
                            ) : isDeleting ? (
                                <div className="flex items-center gap-3 px-4 py-3.5">
                                    <p className="flex-1 text-sm" style={{ color: 'var(--text-primary)' }}>
                                        {t('sets.confirmDeleteBefore')}<strong>{set.display_name}</strong>{t('sets.confirmDeleteAfter')}
                                    </p>
                                    <div className="flex items-center gap-2 flex-shrink-0">
                                        <button
                                            onClick={() => setDeletingId(null)}
                                            className="px-3 py-1.5 rounded-lg text-xs font-medium"
                                            style={{ color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
                                        >
                                            {t('common.cancel')}
                                        </button>
                                        <button
                                            onClick={() => handleDelete(set.id)}
                                            className="px-3 py-1.5 rounded-lg text-xs font-medium"
                                            style={{ background: 'var(--pnl-red-dim)', color: 'var(--pnl-red)', border: '1px solid var(--pnl-red)' }}
                                        >
                                            {t('common.delete')}
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <div className="flex items-center gap-3 px-4 py-3.5">
                                    {/* Radio dot — click to select (does not switch yet) */}
                                    <button
                                        onClick={() => setSelectedId(set.id)}
                                        className="flex-shrink-0 w-[18px] h-[18px] rounded-full border-2 flex items-center justify-center transition-all"
                                        style={{
                                            borderColor: isSelected ? 'var(--accent)' : 'var(--border-strong)',
                                            background: isSelected ? 'var(--accent)' : 'transparent',
                                        }}
                                        aria-label={t('sets.select', { name: set.display_name })}
                                        aria-pressed={isSelected}
                                    >
                                        {isSelected && <div style={{ width: 7, height: 7, borderRadius: '50%', background: 'oklch(100% 0.003 275)' }} />}
                                    </button>

                                    {/* Name + dates — clicking selects the row */}
                                    <button
                                        onClick={() => setSelectedId(set.id)}
                                        className="flex-1 min-w-0 text-left"
                                    >
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <span className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                                                {set.display_name}
                                            </span>
                                            {isActive && (
                                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[11px] font-medium flex-shrink-0"
                                                    style={{ background: 'var(--pnl-green-dim)', color: 'var(--pnl-green)' }}>
                                                    <MdCheckCircle className="w-3 h-3" /> {t('sets.inUse')}
                                                </span>
                                            )}
                                            {set.info_type === 'warning' && (
                                                <span className="text-xs flex-shrink-0" style={{ color: 'var(--text-muted)' }}>{t('sets.demo')}</span>
                                            )}
                                        </div>
                                        <div className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                                            {t('sets.created', { date: created })}
                                            {updated !== created && <> · {t('sets.updated', { date: updated })}</>}
                                        </div>
                                    </button>

                                    {/* Icon actions */}
                                    <div className="flex items-center gap-0.5 flex-shrink-0">
                                        {set.id !== 'demo' && (
                                            <button
                                                onClick={() => startRename(set)}
                                                className="p-2 rounded-md transition-opacity opacity-40 hover:opacity-90"
                                                style={{ color: 'var(--text-secondary)' }}
                                                title={t('sets.rename')}
                                                aria-label={t('sets.renamePortfolio')}
                                            >
                                                <MdEdit className="w-4 h-4" />
                                            </button>
                                        )}
                                        <button
                                            onClick={() => handleExport(set.id, set.name)}
                                            className="p-2 rounded-md transition-opacity opacity-40 hover:opacity-90"
                                            style={{ color: 'var(--text-secondary)' }}
                                            title={t('sets.saveToFile')}
                                            aria-label={t('sets.saveToFile')}
                                        >
                                            <MdDownload className="w-4 h-4" />
                                        </button>
                                        {set.id !== 'demo' && (
                                            <button
                                                onClick={() => setDeletingId(set.id)}
                                                className="p-2 rounded-md transition-opacity opacity-40 hover:opacity-90"
                                                style={{ color: 'var(--pnl-red)' }}
                                                title={t('common.delete')}
                                                aria-label={t('sets.deletePortfolio')}
                                            >
                                                <MdDelete className="w-4 h-4" />
                                            </button>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            {/* Confirm switch — selecting a row only highlights it; the user
                applies the change here so portfolios never toggle by accident. */}
            {showConfirm && (
                <div className="flex items-center gap-3 rounded-xl px-4 py-3"
                    style={{ background: 'var(--accent-dim)', border: '1px solid var(--accent-glow)' }}>
                    <p className="flex-1 text-sm" style={{ color: 'var(--text-primary)' }}>
                        {t('sets.confirmSwitchBefore')}<strong>{selectedSet!.display_name}</strong>{t('sets.confirmSwitchAfter')}
                    </p>
                    <button
                        onClick={() => handleActivate(selectedId)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium flex-shrink-0 transition-all"
                        style={{ background: 'var(--accent)', color: 'oklch(100% 0.003 275)' }}
                    >
                        <MdSwapHoriz className="w-4 h-4" />
                        {t('sets.switch')}
                    </button>
                </div>
            )}
        </div>
    );
};

export default PositionSetManager;
