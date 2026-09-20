'use client';

import React, { useEffect, useState } from 'react';
import { MdClose, MdDownload, MdRefresh, MdUpload, MdInsertDriveFile } from 'react-icons/md';
import { importPositionSet } from '../../utils/localPositions';
import { applyTaxSettingsFromBackup, type TaxSettingsBackup } from '../../utils/taxSettingsBackup';
import { TAX_RESIDENCE_STORAGE_KEY } from '../../hooks/useTaxResidence';
import { Transaction } from '@portfolio/types';
import { useTranslation } from '../../i18n';
import type { TranslationKey } from '../../i18n';

/**
 * Import failures are held as a key plus an optional untranslated detail —
 * JSON.parse messages come from the JS engine in its own wording, so they are
 * shown verbatim after a translated lead-in rather than mistranslated.
 */
interface ImportError {
    key: TranslationKey;
    detail?: string;
}

const TEMPLATE_TRANSACTIONS: Transaction[] = [
    {
        way: 'buy',
        date: '2023/01/10',
        ticker: 'AAPL',
        fullName: 'Apple Inc.',
        broker: 'My Broker',
        account: 'Main Account',
        quantity: 10,
        pricePerUnit: 130.0,
        fees: 0,
        ccy: 'USD',
        stockCcy: 'USD',
    },
    {
        way: 'sell',
        date: '2024/05/01',
        ticker: 'AAPL',
        fullName: 'Apple Inc.',
        broker: 'My Broker',
        account: 'Main Account',
        quantity: 4,
        pricePerUnit: 180.0,
        fees: 0,
        ccy: 'USD',
        stockCcy: 'USD',
    },
];

interface ImportSetModalProps {
    onImported: (positionCount: number, setAsActive: boolean) => void;
    onClose: () => void;
}

/** Staged data waiting on the user to confirm it's OK to overwrite their existing tax residence. */
interface PendingTaxOverwrite {
    idName: string;
    displayName: string;
    description: string;
    records: unknown[];
    taxSettings?: TaxSettingsBackup;
}

export default function ImportSetModal({ onImported, onClose }: ImportSetModalProps) {
    const { t } = useTranslation();
    const [fields, setFields] = useState({ name: '', set_as_active: false });
    const [stagedFile, setStagedFile] = useState<File | null>(null);
    const [importing, setImporting] = useState(false);
    const [error, setError] = useState<ImportError | null>(null);
    const [dragging, setDragging] = useState(false);
    const [pendingTaxOverwrite, setPendingTaxOverwrite] = useState<PendingTaxOverwrite | null>(null);

    // Prevent the browser from navigating to a dropped file anywhere outside the drop zone.
    useEffect(() => {
        const stop = (e: DragEvent) => e.preventDefault();
        window.addEventListener('dragover', stop);
        window.addEventListener('drop', stop);
        return () => {
            window.removeEventListener('dragover', stop);
            window.removeEventListener('drop', stop);
        };
    }, []);

    const handleDownloadTemplate = () => {
        const blob = new Blob([JSON.stringify(TEMPLATE_TRANSACTIONS, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'positions-template.json';
        document.body.appendChild(a);
        a.click();
        URL.revokeObjectURL(url);
        document.body.removeChild(a);
    };

    // Stage the file but don't import yet — wait for the explicit "Add" click.
    const stageFile = (file: File) => {
        setError(null);
        setStagedFile(file);
        // Pre-fill the name from the file if the user hasn't set one.
        if (!fields.name) {
            setFields(p => ({ ...p, name: file.name.replace(/\.json$/i, '') }));
        }
    };

    const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) stageFile(file);
        e.target.value = '';
    };

    const handleDrop = (e: React.DragEvent<HTMLLabelElement>) => {
        e.preventDefault();
        setDragging(false);
        const file = e.dataTransfer.files[0];
        if (file) stageFile(file);
    };

    // importPositionSet auto-migrates legacy RawPosition[] to Transaction[].
    const commitImport = (pending: PendingTaxOverwrite) => {
        const { idName, displayName, description, records, taxSettings } = pending;
        importPositionSet(
            idName,
            displayName,
            description,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            records as any,
            fields.set_as_active,
        );

        // Tax setup travels in the same file, under a key the shape check
        // above already ignores. Applying it writes straight to localStorage;
        // a reload is the simplest way to get the already-mounted app's tax
        // hooks (which only hydrate once, on mount) to pick it up.
        if (taxSettings && (taxSettings.residenceCountry || taxSettings.accountTaxSettings)) {
            applyTaxSettingsFromBackup(taxSettings);
            onImported(records.length, fields.set_as_active);
            window.location.reload();
            return;
        }

        onImported(records.length, fields.set_as_active);
    };

    const handleAdd = async () => {
        if (!stagedFile) return;
        setImporting(true);
        setError(null);
        try {
            const content = await stagedFile.text();
            const jsonData = JSON.parse(content);
            let records: unknown[];
            if (Array.isArray(jsonData)) {
                records = jsonData;
            } else if (jsonData.transactions && Array.isArray(jsonData.transactions)) {
                records = jsonData.transactions;
            } else if (jsonData.positions && Array.isArray(jsonData.positions)) {
                records = jsonData.positions;
            } else {
                setError({ key: 'import.errShape' });
                return;
            }

            const taxSettings = jsonData.taxSettings as TaxSettingsBackup | undefined;
            const pending: PendingTaxOverwrite = {
                idName: fields.name || `imported-${Date.now()}`,
                displayName: fields.name || stagedFile.name.replace('.json', ''),
                description: t('import.setDescription', { file: stagedFile.name }),
                records,
                taxSettings,
            };

            // A residence value already set is the taxpayer's identity, not
            // this portfolio's — importing overwrites it (see
            // applyTaxSettingsFromBackup), so pause for confirmation instead
            // of silently replacing who the app thinks the user is.
            const existingResidence = localStorage.getItem(TAX_RESIDENCE_STORAGE_KEY);
            const wouldOverwriteResidence =
                !!taxSettings?.residenceCountry && !!existingResidence && existingResidence !== taxSettings.residenceCountry;

            if (wouldOverwriteResidence) {
                setPendingTaxOverwrite(pending);
                return;
            }

            commitImport(pending);
        } catch (err) {
            setError({
                key: 'import.errFailed',
                detail: err instanceof Error ? err.message : undefined,
            });
        } finally {
            setImporting(false);
        }
    };

    const confirmTaxOverwrite = () => {
        if (!pendingTaxOverwrite) return;
        setImporting(true);
        commitImport(pendingTaxOverwrite);
    };

    const inputClass = 'w-full px-3 py-2 rounded-lg text-sm glass outline-none focus:ring-1';
    const inputStyle = { color: 'var(--text-primary)', caretColor: 'var(--accent)', ['--tw-ring-color' as string]: 'var(--accent)' };

    const canAdd = stagedFile !== null && !importing;

    return (
        <div
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4"
            style={{ background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)' }}
            onClick={e => { if (e.target === e.currentTarget) onClose(); }}
        >
            <div
                className="relative w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl flex flex-col"
                style={{
                    background: 'var(--surface-popover)',
                    border: '1px solid var(--border-strong)',
                    boxShadow: '0 24px 64px rgba(0,0,0,0.6)',
                    maxHeight: '90dvh',
                }}
            >
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-5" style={{ borderBottom: '1px solid var(--border)' }}>
                    <h2 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>{t('import.title')}</h2>
                    <button onClick={onClose} className="p-1.5 rounded-lg transition-colors" style={{ color: 'var(--text-muted)' }} aria-label={t('common.close')}>
                        <MdClose size={18} />
                    </button>
                </div>

                {/* Body */}
                <div className="flex-1 scroll-elastic-y px-6 py-5 space-y-5">
                    {pendingTaxOverwrite ? (
                        <>
                            <div className="rounded-xl px-4 py-3 text-sm space-y-2" style={{ background: 'var(--pnl-red-dim)', border: '1px solid var(--pnl-red)', color: 'var(--text-primary)' }}>
                                <p>
                                    {t('import.confirmTaxOverwrite', {
                                        country: t(
                                            pendingTaxOverwrite.taxSettings?.residenceCountry === 'FR'
                                                ? 'settings.taxResidenceFR'
                                                : 'settings.taxResidenceJP',
                                        ),
                                    })}
                                </p>
                            </div>
                            <div className="flex justify-end gap-2 pt-2">
                                <button
                                    onClick={() => setPendingTaxOverwrite(null)}
                                    disabled={importing}
                                    className="px-4 py-2 text-sm glass glass-hover rounded-lg transition-all disabled:opacity-50"
                                    style={{ color: 'var(--text-secondary)' }}
                                >
                                    {t('common.cancel')}
                                </button>
                                <button
                                    onClick={confirmTaxOverwrite}
                                    disabled={importing}
                                    className="flex items-center gap-2 px-4 py-2 text-sm rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                    style={{ background: 'var(--pnl-red-dim)', color: 'var(--pnl-red)', border: '1px solid var(--pnl-red)' }}
                                >
                                    {importing && <MdRefresh className="w-4 h-4 animate-spin" />}
                                    {t('import.confirmTaxOverwriteAction')}
                                </button>
                            </div>
                        </>
                    ) : (
                    <>
                    {error && (
                        <div className="rounded-xl px-4 py-3 text-sm" style={{ background: 'var(--pnl-red-dim)', border: '1px solid var(--pnl-red)', color: 'var(--pnl-red)' }}>
                            {t(error.key)}{error.detail ? ` (${error.detail})` : ''}
                        </div>
                    )}

                    <div className="space-y-1">
                        <label className="text-xs" style={{ color: 'var(--text-muted)' }}>{t('import.name')}</label>
                        <input
                            type="text"
                            value={fields.name}
                            onChange={e => setFields(p => ({ ...p, name: e.target.value }))}
                            placeholder={t('import.namePlaceholder')}
                            className={inputClass}
                            style={inputStyle}
                            autoFocus
                        />
                    </div>

                    <label className="flex items-center gap-2 cursor-pointer">
                        <input
                            type="checkbox"
                            checked={fields.set_as_active}
                            onChange={e => setFields(p => ({ ...p, set_as_active: e.target.checked }))}
                            style={{ accentColor: 'var(--accent)' }}
                        />
                        <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>{t('import.switchAfterLoad')}</span>
                    </label>

                    {/* Drop zone / staged file */}
                    <div className="space-y-2">
                        <div className="flex items-center justify-between">
                            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{t('import.jsonFile')} *</span>
                            <button
                                onClick={handleDownloadTemplate}
                                className="text-xs flex items-center gap-1 transition-opacity opacity-70 hover:opacity-100"
                                style={{ color: 'var(--accent)' }}
                            >
                                <MdDownload className="w-3 h-3" />
                                {t('import.downloadTemplate')}
                            </button>
                        </div>

                        {stagedFile ? (
                            <div
                                className="flex items-center justify-between gap-3 w-full rounded-xl px-4 py-3"
                                style={{ border: '1px solid var(--accent-glow)', background: 'var(--accent-dim)' }}
                            >
                                <div className="flex items-center gap-3 min-w-0">
                                    <MdInsertDriveFile className="w-5 h-5 flex-shrink-0" style={{ color: 'var(--accent)' }} />
                                    <div className="min-w-0">
                                        <div className="text-sm truncate" style={{ color: 'var(--text-primary)' }}>{stagedFile.name}</div>
                                        <div className="text-xs" style={{ color: 'var(--text-muted)' }}>{(stagedFile.size / 1024).toFixed(1)} KB</div>
                                    </div>
                                </div>
                                <button
                                    onClick={() => setStagedFile(null)}
                                    className="text-xs px-2 py-1 rounded-md transition-opacity opacity-70 hover:opacity-100"
                                    style={{ color: 'var(--text-secondary)' }}
                                    aria-label={t('import.removeFile')}
                                >
                                    {t('import.change')}
                                </button>
                            </div>
                        ) : (
                            <label
                                className="flex flex-col items-center justify-center gap-3 w-full rounded-xl cursor-pointer transition-all"
                                style={{
                                    border: `1px dashed ${dragging ? 'var(--accent)' : 'var(--border)'}`,
                                    background: dragging ? 'var(--accent-dim)' : 'var(--glass-bg)',
                                    padding: '2rem 1rem',
                                    color: 'var(--text-secondary)',
                                }}
                                onDragOver={e => { e.preventDefault(); setDragging(true); }}
                                onDragLeave={() => setDragging(false)}
                                onDrop={handleDrop}
                            >
                                <MdUpload className="w-6 h-6" style={{ color: 'var(--accent)' }} />
                                <span className="text-sm text-center">
                                    {t('import.dropZoneBefore')}<span style={{ color: 'var(--accent)' }}>{t('import.dropZoneBrowse')}</span>
                                </span>
                                <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{t('import.dropZoneHint')}</span>
                                <input type="file" accept=".json,application/json" onChange={handleFileInput} className="sr-only" />
                            </label>
                        )}

                        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                            {t('import.formatHelp')} {t('import.formatHelpTaxNote')}
                        </p>
                    </div>

                    <div className="flex justify-end gap-2 pt-2">
                        <button
                            onClick={onClose}
                            disabled={importing}
                            className="px-4 py-2 text-sm glass glass-hover rounded-lg transition-all disabled:opacity-50"
                            style={{ color: 'var(--text-secondary)' }}
                        >
                            {t('common.cancel')}
                        </button>
                        <button
                            onClick={handleAdd}
                            disabled={!canAdd}
                            className="flex items-center gap-2 px-4 py-2 text-sm rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                            style={{
                                background: 'var(--accent-dim)',
                                color: 'var(--accent)',
                                border: '1px solid var(--accent-glow)',
                            }}
                        >
                            {importing && <MdRefresh className="w-4 h-4 animate-spin" />}
                            {importing ? t('import.loading') : t('import.load')}
                        </button>
                    </div>
                    </>
                    )}
                </div>
            </div>
        </div>
    );
}
