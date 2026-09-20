'use client';

import { useEffect, useState } from 'react';
import { MdArrowForward, MdBarChart, MdClose } from 'react-icons/md';
import { useTranslation, SUPPORTED_LANGUAGES } from '../../i18n';

const STORAGE_KEY = 'pt_onboarded';

interface WelcomeModalProps {
    onAddPosition: () => void;
    onImport: () => void;
}

export default function WelcomeModal({ onAddPosition, onImport }: WelcomeModalProps) {
    const { t, language, setLanguage } = useTranslation();
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        const already = localStorage.getItem(STORAGE_KEY);
        if (!already) setVisible(true);
    }, []);

    const dismiss = () => {
        localStorage.setItem(STORAGE_KEY, '1');
        setVisible(false);
    };

    // Same dialog convention as SettingsPanel: Escape closes, background scroll locks.
    useEffect(() => {
        if (!visible) return;
        const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') dismiss(); };
        document.addEventListener('keydown', handler);
        document.body.style.overflow = 'hidden';
        return () => {
            document.removeEventListener('keydown', handler);
            document.body.style.overflow = '';
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [visible]);

    const handleAddPosition = () => {
        dismiss();
        onAddPosition();
    };

    const handleImport = () => {
        dismiss();
        onImport();
    };

    if (!visible) return null;

    return (
        /* Backdrop — flat dim, no blur: opaque surfaces per the product's design principles. */
        <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ background: 'rgba(0,0,0,0.70)' }}
        >
            {/* Card — border carries the elevation; no shadow stacked on top of it. */}
            <div
                role="dialog"
                aria-modal="true"
                aria-label={t('welcome.title')}
                className="relative w-full max-w-md rounded-2xl p-8 space-y-6"
                style={{ background: 'var(--surface-popover)', border: '1px solid var(--border-strong)' }}
            >
                {/* Dismiss */}
                <button
                    onClick={dismiss}
                    className="absolute top-4 right-4 p-1.5 rounded-lg transition-colors"
                    style={{ color: 'var(--text-muted)' }}
                    aria-label={t('welcome.dismiss')}
                >
                    <MdClose size={18} />
                </button>

                {/* Icon + language + title.
                    The language picker sits in the very first row, before the
                    welcome copy: a French speaker landing here for the first
                    time can switch the whole modal into their own language
                    before reading anything or deciding anything. `pr-8` keeps
                    it clear of the absolutely-positioned dismiss button. */}
                <div className="space-y-3">
                    <div className="flex items-start justify-between gap-3 pr-8">
                        <div
                            className="inline-flex items-center justify-center w-12 h-12 rounded-xl flex-shrink-0"
                            style={{ background: 'var(--accent-dim)', border: '1px solid var(--accent-glow)' }}
                        >
                            <MdBarChart size={24} style={{ color: 'var(--accent)' }} />
                        </div>

                        <div
                            className="flex items-center gap-1 flex-wrap justify-end"
                            role="group"
                            aria-label={t('settings.language')}
                        >
                            {SUPPORTED_LANGUAGES.map(l => (
                                <button
                                    key={l.code}
                                    onClick={() => setLanguage(l.code)}
                                    lang={l.code}
                                    aria-pressed={language === l.code}
                                    className="px-2.5 py-1 rounded-full text-xs font-medium transition-all"
                                    style={language === l.code ? {
                                        background: 'var(--accent-dim)',
                                        color: 'var(--accent)',
                                        border: '1px solid var(--accent-glow)',
                                    } : {
                                        background: 'transparent',
                                        color: 'var(--text-muted)',
                                        border: '1px solid var(--border)',
                                    }}
                                >
                                    {l.label}
                                </button>
                            ))}
                        </div>
                    </div>
                    <div>
                        <h2 className="text-xl font-semibold" style={{ color: 'var(--text-primary)' }}>
                            {t('welcome.title')}
                        </h2>
                        <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
                            {t('welcome.subtitleBefore')}{' '}
                            <strong style={{ color: 'var(--text-primary)' }}>{t('welcome.demoData')}</strong>
                            {t('welcome.subtitleAfter')}
                        </p>
                    </div>
                </div>

                {/* Primary path: add a position by hand — no file, no format to learn.
                    One instruction stated once: this line of plain text, then the button
                    that does it. No boxed card restating the same thing above it. */}
                <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                    {t('welcome.primaryBody')}
                </p>

                {/* Two real, equally-clickable next steps: add data by hand, or just look around
                    (the demo is already what's loaded behind this modal — dismissing is enough).
                    Equal flex-1 widths keep both buttons the same height even when translated
                    copy (French) runs longer than the English original. */}
                <div className="flex gap-3 items-stretch">
                    <button
                        onClick={handleAddPosition}
                        className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all"
                        style={{ background: 'var(--accent-dim)', color: 'var(--accent)', border: '1px solid var(--accent-glow)' }}
                    >
                        {t('welcome.ctaPrimary')}
                        <MdArrowForward size={16} />
                    </button>
                    <button
                        onClick={dismiss}
                        className="flex-1 flex items-center justify-center px-4 py-2.5 rounded-xl text-sm font-medium glass glass-hover transition-all"
                        style={{ color: 'var(--text-secondary)' }}
                    >
                        {t('welcome.ctaExplore')}
                    </button>
                </div>

                {/* Least common path — already has an export file — stays a low-weight link. */}
                <button
                    onClick={handleImport}
                    className="text-xs underline-offset-2 hover:underline"
                    style={{ color: 'var(--text-muted)' }}
                >
                    {t('welcome.importLink')}
                </button>

                {/* Data persistence note */}
                <p className="text-xs" style={{ color: 'var(--text-muted)', borderTop: '1px solid var(--border)', paddingTop: '1rem' }}>
                    {t('welcome.localDataNote')}
                </p>
            </div>
        </div>
    );
}
