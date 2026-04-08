'use client';

import React, { useState, useEffect } from 'react';
import {
    MdAdd, MdPlayArrow, MdDownload, MdDelete, MdSettings,
    MdCheckCircle, MdWarning, MdRefresh,
} from 'react-icons/md';
import {
    getPositionSets,
    getActiveSetId,
    importPositionSet,
    activateSet,
    deleteSet,
    exportSetPositions,
    PositionSetLocal,
} from '../../utils/localPositions';
import { RawPosition } from '@portfolio/types';

interface PositionSetManagerProps {
    onPositionSetChanged?: () => void;
}

const TEMPLATE_POSITIONS: RawPosition[] = [
    {
        transactionDate: '2023/01/10',
        ticker: 'AAPL',
        fullName: 'Apple Inc.',
        broker: 'My Broker',
        account: 'Main Account',
        quantity: 10,
        costPerUnit: 130.0,
        transactionCcy: 'USD',
        stockCcy: 'USD',
    },
];

const PositionSetManager: React.FC<PositionSetManagerProps> = ({ onPositionSetChanged }) => {
    const [sets, setSets] = useState<PositionSetLocal[]>([]);
    const [activeId, setActiveId] = useState<string>('demo');
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);
    const [showImportForm, setShowImportForm] = useState(false);
    const [importData, setImportData] = useState({ name: '', description: '', set_as_active: false });
    const [importing, setImporting] = useState(false);

    const refresh = () => {
        setSets(getPositionSets());
        setActiveId(getActiveSetId());
    };

    useEffect(() => { refresh(); }, []);

    useEffect(() => {
        if (success) {
            const timer = setTimeout(() => setSuccess(null), 4000);
            return () => clearTimeout(timer);
        }
    }, [success]);

    const handleActivate = (id: string) => {
        try {
            activateSet(id);
            refresh();
            setSuccess('Position set activated');
            onPositionSetChanged?.();
        } catch {
            setError('Failed to activate position set');
        }
    };

    const handleDelete = (id: string, name: string) => {
        if (!confirm(`Delete "${name}"? This will permanently remove all positions in this set.`)) return;
        try {
            deleteSet(id);
            refresh();
            setSuccess('Position set deleted');
        } catch {
            setError('Failed to delete position set');
        }
    };

    const handleExport = (id: string, name: string) => {
        try {
            const positions = exportSetPositions(id);
            const blob = new Blob([JSON.stringify(positions, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${name}-positions.json`;
            document.body.appendChild(a);
            a.click();
            URL.revokeObjectURL(url);
            document.body.removeChild(a);
            setSuccess('Exported successfully');
        } catch {
            setError('Failed to export');
        }
    };

    const handleDownloadTemplate = () => {
        const blob = new Blob([JSON.stringify(TEMPLATE_POSITIONS, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'positions-template.json';
        document.body.appendChild(a);
        a.click();
        URL.revokeObjectURL(url);
        document.body.removeChild(a);
    };

    const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;
        setImporting(true);
        try {
            const content = await file.text();
            const jsonData = JSON.parse(content);
            let positions: RawPosition[];
            if (Array.isArray(jsonData)) {
                positions = jsonData;
            } else if (jsonData.positions && Array.isArray(jsonData.positions)) {
                positions = jsonData.positions;
            } else {
                throw new Error('Invalid JSON format. Expected a positions array.');
            }

            const name = importData.name || `imported-${Date.now()}`;
            importPositionSet(
                name,
                importData.name || file.name.replace('.json', ''),
                importData.description || `Imported from ${file.name}`,
                positions,
                importData.set_as_active,
            );

            setSuccess(`Imported ${positions.length} positions`);
            setShowImportForm(false);
            const wasActive = importData.set_as_active;
            setImportData({ name: '', description: '', set_as_active: false });
            refresh();
            if (wasActive) onPositionSetChanged?.();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to import');
        } finally {
            setImporting(false);
            event.target.value = '';
        }
    };

    return (
        <div className="space-y-5">
            {/* Header */}
            <div className="flex justify-between items-start gap-4">
                <div>
                    <h2 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
                        Position Sets
                    </h2>
                    <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
                        Import, export and switch between portfolio datasets
                    </p>
                </div>
                <button
                    onClick={() => setShowImportForm(!showImportForm)}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all"
                    style={{ background: 'var(--accent-dim)', color: 'var(--accent)', border: '1px solid var(--accent-glow)' }}
                >
                    <MdAdd className="w-4 h-4" />
                    Import set
                </button>
            </div>

            {/* Messages */}
            {error && (
                <div className="rounded-xl px-4 py-3 flex items-start gap-3"
                    style={{ background: 'var(--pnl-red-dim)', border: '1px solid var(--pnl-red)' }}>
                    <MdWarning className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: 'var(--pnl-red)' }} />
                    <p className="text-sm flex-1" style={{ color: 'var(--text-primary)' }}>{error}</p>
                    <button onClick={() => setError(null)} className="opacity-50 hover:opacity-100"
                        style={{ color: 'var(--text-primary)' }}>✕</button>
                </div>
            )}
            {success && (
                <div className="rounded-xl px-4 py-3 flex items-start gap-3"
                    style={{ background: 'var(--pnl-green-dim)', border: '1px solid var(--pnl-green)' }}>
                    <MdCheckCircle className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: 'var(--pnl-green)' }} />
                    <p className="text-sm flex-1" style={{ color: 'var(--text-primary)' }}>{success}</p>
                </div>
            )}

            {/* Import form */}
            {showImportForm && (
                <div className="glass rounded-2xl p-6 space-y-4">
                    <h3 className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                        Import Position Set
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-1">
                            <label className="text-xs" style={{ color: 'var(--text-muted)' }}>Name</label>
                            <input
                                type="text"
                                value={importData.name}
                                onChange={e => setImportData(p => ({ ...p, name: e.target.value }))}
                                placeholder="My Portfolio 2025"
                                className="w-full px-3 py-2 rounded-lg text-sm glass outline-none"
                                style={{ color: 'var(--text-primary)', caretColor: 'var(--accent)' }}
                            />
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs" style={{ color: 'var(--text-muted)' }}>Description</label>
                            <input
                                type="text"
                                value={importData.description}
                                onChange={e => setImportData(p => ({ ...p, description: e.target.value }))}
                                placeholder="Optional description"
                                className="w-full px-3 py-2 rounded-lg text-sm glass outline-none"
                                style={{ color: 'var(--text-primary)', caretColor: 'var(--accent)' }}
                            />
                        </div>
                    </div>
                    <label className="flex items-center gap-2 cursor-pointer">
                        <input
                            type="checkbox"
                            checked={importData.set_as_active}
                            onChange={e => setImportData(p => ({ ...p, set_as_active: e.target.checked }))}
                            style={{ accentColor: 'var(--accent)' }}
                        />
                        <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                            Set as active after import
                        </span>
                    </label>
                    <div className="space-y-2">
                        <div className="flex items-center justify-between">
                            <label className="text-xs" style={{ color: 'var(--text-muted)' }}>JSON File *</label>
                            <button
                                onClick={handleDownloadTemplate}
                                className="text-xs flex items-center gap-1 transition-opacity opacity-70 hover:opacity-100"
                                style={{ color: 'var(--accent)' }}
                            >
                                <MdDownload className="w-3 h-3" />
                                Download template
                            </button>
                        </div>
                        <input
                            type="file"
                            accept=".json"
                            onChange={handleFileUpload}
                            disabled={importing}
                            className="w-full text-sm"
                            style={{ color: 'var(--text-secondary)' }}
                        />
                        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                            JSON array of positions — each requires: ticker, fullName, account, quantity, costPerUnit, transactionCcy, stockCcy, transactionDate
                        </p>
                    </div>
                    {importing && (
                        <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--accent)' }}>
                            <MdRefresh className="w-4 h-4 animate-spin" />
                            Importing…
                        </div>
                    )}
                    <div className="flex justify-end">
                        <button
                            onClick={() => setShowImportForm(false)}
                            className="px-4 py-2 text-sm glass glass-hover rounded-lg transition-all"
                            style={{ color: 'var(--text-secondary)' }}
                        >
                            Cancel
                        </button>
                    </div>
                </div>
            )}

            {/* Position sets list */}
            <div className="glass rounded-2xl overflow-hidden">
                {sets.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 gap-3">
                        <MdSettings className="w-10 h-10" style={{ color: 'var(--text-muted)' }} />
                        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                            No position sets — import a JSON file to get started
                        </p>
                    </div>
                ) : (
                    <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
                        {sets.map(set => (
                            <div key={set.id} className="px-6 py-4 flex items-center justify-between gap-4 glass-hover transition-colors">
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <span className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                                            {set.display_name}
                                        </span>
                                        {set.id === activeId && (
                                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
                                                style={{ background: 'var(--pnl-green-dim)', color: 'var(--pnl-green)', border: '1px solid var(--pnl-green)' }}>
                                                <MdCheckCircle className="w-3 h-3" /> Active
                                            </span>
                                        )}
                                        {set.info_type === 'warning' && (
                                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
                                                style={{ background: 'rgba(255,180,0,0.12)', color: '#ffb400', border: '1px solid rgba(255,180,0,0.3)' }}>
                                                <MdWarning className="w-3 h-3" /> Demo
                                            </span>
                                        )}
                                    </div>
                                    {set.description && (
                                        <p className="text-xs mt-0.5 truncate" style={{ color: 'var(--text-muted)' }}>
                                            {set.description}
                                        </p>
                                    )}
                                </div>

                                <div className="flex items-center gap-2 flex-shrink-0">
                                    {set.id !== activeId && (
                                        <button
                                            onClick={() => handleActivate(set.id)}
                                            className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                                            style={{ background: 'var(--accent-dim)', color: 'var(--accent)', border: '1px solid var(--accent-glow)' }}
                                        >
                                            <MdPlayArrow className="w-3 h-3" />
                                            Activate
                                        </button>
                                    )}
                                    <button
                                        onClick={() => handleExport(set.id, set.name)}
                                        className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium glass glass-hover transition-all"
                                        style={{ color: 'var(--text-secondary)' }}
                                    >
                                        <MdDownload className="w-3 h-3" />
                                        Export
                                    </button>
                                    {set.id !== 'demo' && (
                                        <button
                                            onClick={() => handleDelete(set.id, set.display_name)}
                                            className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                                            style={{ background: 'var(--pnl-red-dim)', color: 'var(--pnl-red)', border: '1px solid rgba(255,68,102,0.3)' }}
                                        >
                                            <MdDelete className="w-3 h-3" />
                                            Delete
                                        </button>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

export default PositionSetManager;
