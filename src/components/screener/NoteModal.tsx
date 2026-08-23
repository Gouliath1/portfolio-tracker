'use client';

import { useEffect, useState } from 'react';
import { MdClose, MdStickyNote2, MdDelete } from 'react-icons/md';
import { useTranslation } from '../../i18n';

interface NoteModalProps {
    symbol: string;
    name: string;
    existing: string | null;
    onSave: (note: string) => void;
    onClear: () => void;
    onClose: () => void;
}

export function NoteModal({ symbol, name, existing, onSave, onClear, onClose }: NoteModalProps) {
    const { t } = useTranslation();
    const [text, setText] = useState(existing ?? '');

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [onClose]);

    const handleSave = () => {
        const trimmed = text.trim();
        if (!trimmed) { onClear(); return; }
        onSave(trimmed);
    };

    return (
        <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center sm:p-4"
            style={{ background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(6px)' }}
            onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
            <div className="relative w-full sm:max-w-sm rounded-t-2xl sm:rounded-2xl flex flex-col"
                style={{ background: 'var(--surface-popover)', border: '1px solid var(--border-strong)', boxShadow: '0 24px 64px rgba(0,0,0,0.6)' }}>

                <div className="flex items-center justify-between px-6 py-5" style={{ borderBottom: '1px solid var(--border)' }}>
                    <div className="flex items-center gap-2 min-w-0">
                        <MdStickyNote2 size={18} style={{ color: 'var(--accent)' }} />
                        <div className="min-w-0">
                            <h2 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>{t('note.title')} · {symbol}</h2>
                            <p className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>{name}</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-1.5 rounded-lg" style={{ color: 'var(--text-muted)' }} aria-label={t('common.close')}>
                        <MdClose size={18} />
                    </button>
                </div>

                <div className="px-6 py-5 space-y-4">
                    <textarea
                        value={text}
                        onChange={e => setText(e.target.value)}
                        rows={5}
                        placeholder={t('note.placeholder')}
                        className="w-full px-3 py-2 rounded-lg text-sm glass outline-none focus:ring-1"
                        style={{ color: 'var(--text-primary)', caretColor: 'var(--accent)', ['--tw-ring-color' as string]: 'var(--accent)' }}
                        autoFocus
                    />

                    <div className="flex gap-3 pt-1">
                        <button onClick={handleSave} className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium transition-all"
                            style={{ background: 'var(--accent-dim)', color: 'var(--accent)', border: '1px solid var(--accent-glow)' }}>
                            {existing ? t('note.update') : t('note.save')}
                        </button>
                        {existing && (
                            <button onClick={onClear} className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-medium glass transition-all"
                                style={{ color: 'var(--pnl-red)' }}>
                                <MdDelete size={16} /> {t('common.clear')}
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
