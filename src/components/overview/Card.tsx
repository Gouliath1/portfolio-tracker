'use client';

import React from 'react';

interface CardProps {
    title: string;
    action?: React.ReactNode;
    children: React.ReactNode;
    className?: string;
}

// Shared wrapper for the right-rail analytics cards. Matches the P&L chart
// card: white surface, hairline border, soft shadow, 16px radius.
export const Card = ({ title, action, children, className }: CardProps) => (
    <div
        className={`rounded-2xl ${className ?? ''}`}
        style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            boxShadow: '0 1px 2px rgba(16,24,40,0.04), 0 8px 24px rgba(16,24,40,0.06)',
            padding: '20px',
        }}
    >
        <div className="flex items-center justify-between gap-2 mb-4">
            <h3
                className="font-semibold"
                style={{ color: 'var(--text-primary)', fontSize: '16px', letterSpacing: '-0.01em' }}
            >
                {title}
            </h3>
            {action}
        </div>
        {children}
    </div>
);
