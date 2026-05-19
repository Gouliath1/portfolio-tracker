'use client';

import { useEffect, useState } from 'react';
import type { PositionSetLocal } from '../../utils/localPositions';
import { DEMO_SET } from '../../data/demoPositions';

interface DemoBannerProps {
    refreshTrigger?: number;
}

export default function DemoBanner({ refreshTrigger }: DemoBannerProps) {
    const [activeSet, setActiveSet] = useState<PositionSetLocal | null>(null);
    const [isVisible, setIsVisible] = useState(true);

    useEffect(() => {
        setIsVisible(true);
        try {
            import('../../utils/localPositions').then(({ getActiveSet, JUST_IMPORTED_KEY }) => {
                const set = getActiveSet();
                if (set.info_type === 'info') {
                    // One-shot: only show right after the matching import action.
                    const justImported = sessionStorage.getItem(JUST_IMPORTED_KEY);
                    if (justImported === set.id) {
                        sessionStorage.removeItem(JUST_IMPORTED_KEY);
                        setActiveSet(set);
                    } else {
                        setActiveSet(null);
                    }
                } else {
                    setActiveSet(set);
                }
            }).catch(() => setActiveSet(DEMO_SET));
        } catch {
            setActiveSet(DEMO_SET);
        }
    }, [refreshTrigger]);

    useEffect(() => {
        if (activeSet?.info_type === 'info') {
            const timer = setTimeout(() => setIsVisible(false), 5000);
            return () => clearTimeout(timer);
        }
    }, [activeSet]);

    if (!activeSet || !isVisible) return null;

    const isWarning = activeSet.info_type === 'warning';
    const accentColor = isWarning ? 'var(--pnl-red)' : 'var(--accent)';
    const bgColor = isWarning ? 'var(--pnl-red-dim)' : 'var(--accent-dim)';

    return (
        <div
            className="rounded-xl px-4 py-3 flex items-start gap-3 relative"
            style={{ background: bgColor, border: `1px solid ${accentColor}`, opacity: 0.9 }}
        >
            <svg className="w-4 h-4 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20"
                style={{ color: accentColor }}>
                {isWarning ? (
                    <path fillRule="evenodd"
                        d="M8.485 3.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 3.495zM10 6a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 6zm0 9a1 1 0 100-2 1 1 0 000 2z"
                        clipRule="evenodd" />
                ) : (
                    <path fillRule="evenodd"
                        d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z"
                        clipRule="evenodd" />
                )}
            </svg>

            <p className="text-sm flex-1" style={{ color: 'var(--text-primary)' }}>{activeSet.description}</p>

            {!isWarning && (
                <button onClick={() => setIsVisible(false)}
                    className="flex-shrink-0 opacity-50 hover:opacity-100 transition-opacity"
                    style={{ color: 'var(--text-primary)' }}>
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd"
                            d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                            clipRule="evenodd" />
                    </svg>
                </button>
            )}
        </div>
    );
}
