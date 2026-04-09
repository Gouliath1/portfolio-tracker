'use client';

import { useEffect, useState } from 'react';
import { MdBarChart, MdUploadFile, MdArrowForward, MdClose } from 'react-icons/md';

const STORAGE_KEY = 'pt_onboarded';

interface WelcomeModalProps {
    onOpenSettings: () => void;
}

export default function WelcomeModal({ onOpenSettings }: WelcomeModalProps) {
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        const already = localStorage.getItem(STORAGE_KEY);
        if (!already) setVisible(true);
    }, []);

    const dismiss = () => {
        localStorage.setItem(STORAGE_KEY, '1');
        setVisible(false);
    };

    const handleImport = () => {
        dismiss();
        onOpenSettings();
    };

    if (!visible) return null;

    return (
        /* Backdrop */
        <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ background: 'rgba(0,0,0,0.70)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' }}
        >
            {/* Card */}
            <div
                className="relative w-full max-w-md rounded-2xl p-8 space-y-6"
                style={{ background: 'var(--surface-popover)', border: '1px solid var(--border-strong)', boxShadow: '0 24px 64px rgba(0,0,0,0.6)' }}
            >
                {/* Dismiss */}
                <button
                    onClick={dismiss}
                    className="absolute top-4 right-4 p-1.5 rounded-lg transition-colors"
                    style={{ color: 'var(--text-muted)' }}
                    aria-label="Dismiss"
                >
                    <MdClose size={18} />
                </button>

                {/* Icon + title */}
                <div className="space-y-3">
                    <div
                        className="inline-flex items-center justify-center w-12 h-12 rounded-xl"
                        style={{ background: 'var(--accent-dim)', border: '1px solid var(--accent-glow)' }}
                    >
                        <MdBarChart size={24} style={{ color: 'var(--accent)' }} />
                    </div>
                    <div>
                        <h2 className="text-xl font-semibold" style={{ color: 'var(--text-primary)' }}>
                            Welcome to PortfolioTracker
                        </h2>
                        <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
                            You&apos;re currently viewing <strong style={{ color: 'var(--text-primary)' }}>demo data</strong> — not your real portfolio.
                        </p>
                    </div>
                </div>

                {/* What you can do */}
                <div className="space-y-3">
                    <div
                        className="flex gap-3 rounded-xl p-4"
                        style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)' }}
                    >
                        <MdUploadFile size={20} className="flex-shrink-0 mt-0.5" style={{ color: 'var(--accent)' }} />
                        <div>
                            <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>Import your positions</p>
                            <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                                Upload a JSON file with your holdings. A template is available in Settings to get you started.
                            </p>
                        </div>
                    </div>
                    <div
                        className="flex gap-3 rounded-xl p-4"
                        style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)' }}
                    >
                        <MdBarChart size={20} className="flex-shrink-0 mt-0.5" style={{ color: 'var(--text-muted)' }} />
                        <div>
                            <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>Or explore the demo first</p>
                            <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                                Browse the sample portfolio to see what the tracker can do before adding your own data.
                            </p>
                        </div>
                    </div>
                </div>

                {/* Data persistence note */}
                <p className="text-xs" style={{ color: 'var(--text-muted)', borderTop: '1px solid var(--border)', paddingTop: '1rem' }}>
                    Your data is stored locally in your browser — nothing is sent to a server. Export regularly to keep a backup.
                </p>

                {/* CTAs */}
                <div className="flex gap-3">
                    <button
                        onClick={handleImport}
                        className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all"
                        style={{ background: 'var(--accent-dim)', color: 'var(--accent)', border: '1px solid var(--accent-glow)' }}
                    >
                        Import positions
                        <MdArrowForward size={16} />
                    </button>
                    <button
                        onClick={dismiss}
                        className="px-4 py-2.5 rounded-xl text-sm font-medium glass glass-hover transition-all"
                        style={{ color: 'var(--text-secondary)' }}
                    >
                        Explore demo
                    </button>
                </div>
            </div>
        </div>
    );
}
