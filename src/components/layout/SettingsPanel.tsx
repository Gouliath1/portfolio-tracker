'use client';

import { useEffect, useRef } from 'react';
import { useTheme } from 'next-themes';
import { MdClose, MdLightMode, MdDarkMode } from 'react-icons/md';
import PositionSetManager from '../management/PositionSetManager';

interface SettingsPanelProps {
    open: boolean;
    onClose: () => void;
    onPositionSetChanged: () => void;
}

export const SettingsPanel = ({ open, onClose, onPositionSetChanged }: SettingsPanelProps) => {
    const { resolvedTheme, setTheme } = useTheme();
    const panelRef = useRef<HTMLDivElement>(null);

    // Close on Escape key
    useEffect(() => {
        const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        document.addEventListener('keydown', handler);
        return () => document.removeEventListener('keydown', handler);
    }, [onClose]);

    // Lock body scroll when open
    useEffect(() => {
        document.body.style.overflow = open ? 'hidden' : '';
        return () => { document.body.style.overflow = ''; };
    }, [open]);

    return (
        <>
            {/* Backdrop */}
            <div
                onClick={onClose}
                className="fixed inset-0 z-40 transition-opacity duration-300"
                style={{
                    background: 'rgba(0,0,0,0.45)',
                    backdropFilter: 'blur(2px)',
                    opacity: open ? 1 : 0,
                    pointerEvents: open ? 'auto' : 'none',
                }}
                aria-hidden="true"
            />

            {/* Drawer */}
            <div
                ref={panelRef}
                role="dialog"
                aria-modal="true"
                aria-label="Settings"
                className="fixed top-0 right-0 h-full z-50 flex flex-col"
                style={{
                    width: 'min(480px, 100vw)',
                    background: 'var(--glass-bg)',
                    backdropFilter: 'blur(20px)',
                    WebkitBackdropFilter: 'blur(20px)',
                    borderLeft: '1px solid var(--glass-border)',
                    transform: open ? 'translateX(0)' : 'translateX(100%)',
                    transition: 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                    boxShadow: open ? '-8px 0 32px rgba(0,0,0,0.4)' : 'none',
                }}
            >
                {/* Panel header */}
                <div className="flex items-center justify-between px-6 py-5"
                    style={{ borderBottom: '1px solid var(--border)' }}>
                    <h2 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>
                        Settings
                    </h2>
                    <button
                        onClick={onClose}
                        className="p-2 rounded-lg transition-colors"
                        style={{ color: 'var(--text-muted)' }}
                        aria-label="Close settings"
                    >
                        <MdClose size={18} />
                    </button>
                </div>

                {/* Scrollable content */}
                <div className="flex-1 overflow-y-auto px-6 py-5 space-y-8">

                    {/* Appearance section */}
                    <section className="space-y-3">
                        <h3 className="text-xs font-semibold uppercase tracking-widest"
                            style={{ color: 'var(--text-muted)' }}>
                            Appearance
                        </h3>
                        <div className="glass rounded-xl p-4 flex items-center justify-between gap-4">
                            <div>
                                <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>Theme</p>
                                <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                                    {resolvedTheme === 'dark' ? 'Dark mode' : 'Light mode'}
                                </p>
                            </div>
                            <button
                                onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
                                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium glass glass-hover transition-all"
                                style={{ color: 'var(--accent)', border: '1px solid var(--accent-glow)' }}
                                aria-label="Toggle theme"
                            >
                                {resolvedTheme === 'dark'
                                    ? <><MdLightMode size={16} /> Light</>
                                    : <><MdDarkMode size={16} /> Dark</>
                                }
                            </button>
                        </div>
                    </section>

                    {/* Position sets section */}
                    <section className="space-y-3">
                        <h3 className="text-xs font-semibold uppercase tracking-widest"
                            style={{ color: 'var(--text-muted)' }}>
                            Position Sets
                        </h3>
                        <PositionSetManager onPositionSetChanged={() => { onPositionSetChanged(); onClose(); }} />
                    </section>
                </div>
            </div>
        </>
    );
};
