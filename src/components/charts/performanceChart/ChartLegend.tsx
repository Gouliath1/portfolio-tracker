import React from 'react';

interface ChartLegendProps {
    showValues: boolean;
}

const Dot = ({ color }: { color: string }) => (
    <span
        aria-hidden="true"
        style={{
            width: 10,
            height: 10,
            borderRadius: '50%',
            background: color,
            display: 'inline-block',
        }}
    />
);

const Dash = ({ color }: { color: string }) => (
    <span
        aria-hidden="true"
        style={{
            width: 16,
            height: 0,
            borderTop: `2px dashed ${color}`,
            display: 'inline-block',
        }}
    />
);

const Item = ({ children }: { children: React.ReactNode }) => (
    <span className="inline-flex items-center gap-2">{children}</span>
);

export const ChartLegend: React.FC<ChartLegendProps> = ({ showValues }) => (
    <div
        className="flex flex-wrap items-center gap-x-5 gap-y-2 mt-2.5"
        style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-secondary)' }}
    >
        {showValues ? (
            <>
                <Item>
                    <Dot color="var(--chart-line1)" />
                    Portfolio Value
                </Item>
                <Item>
                    <Dash color="var(--chart-line2)" />
                    Cost Basis
                </Item>
                <Item>
                    <Dot color="var(--chart-line3)" />
                    P&amp;L
                </Item>
            </>
        ) : (
            <Item>
                <Dot color="var(--chart-line3)" />
                Portfolio P&amp;L %
            </Item>
        )}
    </div>
);
