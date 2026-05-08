'use client';

import React, { useState, useEffect } from 'react';
import {
    MdPlayArrow, MdDownload, MdDelete, MdSettings,
    MdCheckCircle, MdWarning,
} from 'react-icons/md';
import {
    getPositionSets,
    getActiveSetId,
    activateSet,
    deleteSet,
    exportSetPositions,
    PositionSetLocal,
} from '../../utils/localPositions';
import AddPositionModal from './AddPositionModal';

interface PositionSetManagerProps {
    onPositionSetChanged?: () => void;
}

const PositionSetManager: React.FC<PositionSetManagerProps> = ({ onPositionSetChanged }) => {
    const [sets, setSets] = useState<PositionSetLocal[]>([]);
    const [activeId, setActiveId] = useState<string>('demo');
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);
    const [showAddPosition, setShowAddPosition] = useState(false);

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

    return (
        <div className="space-y-5">
            {/* Header */}
            <div>
                <h2 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
                    Position Sets
                </h2>
                <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
                    Switch between, export, or delete portfolio datasets
                </p>
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

            {showAddPosition && (
                <AddPositionModal
                    setId={activeId}
                    onSaved={() => {
                        setShowAddPosition(false);
                        setSuccess('Position added');
                        refresh();
                        onPositionSetChanged?.();
                    }}
                    onClose={() => setShowAddPosition(false)}
                />
            )}
        </div>
    );
};

export default PositionSetManager;
