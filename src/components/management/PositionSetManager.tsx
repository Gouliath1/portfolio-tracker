import React, { useState, useEffect } from 'react';
import {
    MdAdd, MdPlayArrow, MdDownload, MdDelete, MdSettings,
    MdCheckCircle, MdWarning, MdRefresh,
} from 'react-icons/md';

interface PositionSet {
    id: number;
    name: string;
    display_name: string;
    description: string | null;
    info_type: string;
    is_active: boolean;
    created_at: string;
    updated_at: string;
}

interface PositionSetsResponse {
    position_sets: PositionSet[];
    active_set: PositionSet | null;
}

interface PositionSetManagerProps {
    onPositionSetChanged?: () => void;
}

const PositionSetManager: React.FC<PositionSetManagerProps> = ({ onPositionSetChanged }) => {
    const [positionSets, setPositionSets] = useState<PositionSet[]>([]);
    const [loading, setLoading] = useState(true);
    const [operationLoading, setOperationLoading] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);
    const [showImportForm, setShowImportForm] = useState(false);
    const [importData, setImportData] = useState({ name: '', description: '', set_as_active: false });

    const fetchPositionSets = async () => {
        try {
            const response = await fetch('/api/position-sets');
            if (!response.ok) throw new Error('Failed to fetch position sets');
            const data: PositionSetsResponse = await response.json();
            setPositionSets(data.position_sets);
        } catch (err) {
            setError('Failed to load position sets');
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchPositionSets(); }, []);

    useEffect(() => {
        if (success) {
            const timer = setTimeout(() => setSuccess(null), 4000);
            return () => clearTimeout(timer);
        }
    }, [success]);

    const handleActivateSet = async (setId: number) => {
        setOperationLoading(`activate-${setId}`);
        try {
            const response = await fetch(`/api/position-sets/${setId}/activate`, { method: 'POST' });
            if (!response.ok) throw new Error('Failed to activate position set');
            setSuccess('Position set activated');
            await fetchPositionSets();
            onPositionSetChanged?.();
        } catch (err) {
            setError('Failed to activate position set');
            console.error(err);
        } finally {
            setOperationLoading(null);
        }
    };

    const handleDeleteSet = async (setId: number, setName: string) => {
        if (!confirm(`Delete "${setName}"? This will permanently remove all positions in this set.`)) return;
        setOperationLoading(`delete-${setId}`);
        try {
            const response = await fetch(`/api/position-sets/${setId}`, { method: 'DELETE' });
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to delete');
            }
            setSuccess('Position set deleted');
            await fetchPositionSets();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to delete');
            console.error(err);
        } finally {
            setOperationLoading(null);
        }
    };

    const handleExportSet = async (setId: number) => {
        setOperationLoading(`export-${setId}`);
        try {
            const response = await fetch(`/api/position-sets/${setId}/export`);
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
                throw new Error(errorData.details || errorData.error || 'Failed to export');
            }
            const contentDisposition = response.headers.get('Content-Disposition');
            const filename = contentDisposition
                ? contentDisposition.split('filename=')[1]?.replace(/"/g, '')
                : `position-set-${setId}.json`;
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
            setSuccess('Exported successfully');
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to export');
        } finally {
            setOperationLoading(null);
        }
    };

    const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;
        setOperationLoading('import');
        try {
            const content = await file.text();
            const jsonData = JSON.parse(content);
            let positions;
            if (Array.isArray(jsonData)) {
                positions = jsonData;
            } else if (jsonData.positions && Array.isArray(jsonData.positions)) {
                positions = jsonData.positions;
            } else {
                throw new Error('Invalid JSON format. Expected positions array.');
            }
            const response = await fetch('/api/position-sets/import', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: importData.name || `imported-${Date.now()}`,
                    description: importData.description || `Imported from ${file.name}`,
                    positions,
                    set_as_active: importData.set_as_active,
                }),
            });
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to import');
            }
            const result = await response.json();
            setSuccess(`Imported ${result.positions_imported} positions`);
            setShowImportForm(false);
            const wasSetAsActive = importData.set_as_active;
            setImportData({ name: '', description: '', set_as_active: false });
            await fetchPositionSets();
            if (wasSetAsActive) onPositionSetChanged?.();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to import');
        } finally {
            setOperationLoading(null);
            event.target.value = '';
        }
    };

    if (loading) return (
        <div className="glass rounded-2xl p-8 flex items-center justify-center gap-3">
            <MdRefresh className="w-5 h-5 animate-spin" style={{ color: 'var(--accent)' }} />
            <span style={{ color: 'var(--text-secondary)' }}>Loading position sets…</span>
        </div>
    );

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
                    style={{
                        background: 'var(--accent-dim)',
                        color: 'var(--accent)',
                        border: '1px solid var(--accent-glow)',
                    }}
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
                            <label className="text-xs" style={{ color: 'var(--text-muted)' }}>Name *</label>
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
                            id="set-as-active"
                            checked={importData.set_as_active}
                            onChange={e => setImportData(p => ({ ...p, set_as_active: e.target.checked }))}
                            style={{ accentColor: 'var(--accent)' }}
                        />
                        <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                            Set as active after import
                        </span>
                    </label>
                    <div className="space-y-1">
                        <label className="text-xs" style={{ color: 'var(--text-muted)' }}>JSON File *</label>
                        <input
                            type="file"
                            accept=".json"
                            onChange={handleFileUpload}
                            disabled={operationLoading === 'import'}
                            className="w-full text-sm"
                            style={{ color: 'var(--text-secondary)' }}
                        />
                        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                            Same format as data/positions.json
                        </p>
                    </div>
                    {operationLoading === 'import' && (
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
                {positionSets.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 gap-3">
                        <MdSettings className="w-10 h-10" style={{ color: 'var(--text-muted)' }} />
                        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                            No position sets — import a JSON file to get started
                        </p>
                    </div>
                ) : (
                    <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
                        {positionSets.map(set => (
                            <div key={set.id} className="px-6 py-4 flex items-center justify-between gap-4 glass-hover transition-colors">
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <span className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                                            {set.display_name}
                                        </span>
                                        {set.is_active && (
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
                                    <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                                        {set.name} · {new Date(set.created_at).toLocaleDateString()}
                                    </p>
                                    {set.description && (
                                        <p className="text-xs mt-0.5 truncate" style={{ color: 'var(--text-muted)' }}>
                                            {set.description}
                                        </p>
                                    )}
                                </div>

                                <div className="flex items-center gap-2 flex-shrink-0">
                                    {!set.is_active && (
                                        <button
                                            onClick={() => handleActivateSet(set.id)}
                                            disabled={!!operationLoading}
                                            className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-all disabled:opacity-40"
                                            style={{ background: 'var(--accent-dim)', color: 'var(--accent)', border: '1px solid var(--accent-glow)' }}
                                        >
                                            {operationLoading === `activate-${set.id}`
                                                ? <MdRefresh className="w-3 h-3 animate-spin" />
                                                : <MdPlayArrow className="w-3 h-3" />}
                                            Activate
                                        </button>
                                    )}
                                    <button
                                        onClick={() => handleExportSet(set.id)}
                                        disabled={!!operationLoading}
                                        className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium glass glass-hover transition-all disabled:opacity-40"
                                        style={{ color: 'var(--text-secondary)' }}
                                    >
                                        {operationLoading === `export-${set.id}`
                                            ? <MdRefresh className="w-3 h-3 animate-spin" />
                                            : <MdDownload className="w-3 h-3" />}
                                        Export
                                    </button>
                                    <button
                                        onClick={() => handleDeleteSet(set.id, set.display_name)}
                                        disabled={!!operationLoading}
                                        className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-all disabled:opacity-40"
                                        style={{ background: 'var(--pnl-red-dim)', color: 'var(--pnl-red)', border: '1px solid rgba(255,68,102,0.3)' }}
                                    >
                                        {operationLoading === `delete-${set.id}`
                                            ? <MdRefresh className="w-3 h-3 animate-spin" />
                                            : <MdDelete className="w-3 h-3" />}
                                        Delete
                                    </button>
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
