import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { resolveWindow, selectionKey } from '../../src/components/charts/performanceChart/chartUtils';
import { TimelineFilterButtons } from '../../src/components/charts/performanceChart/TimelineFilterButtons';
import { toISODate } from '../../src/lib/core/dateWindow';
import type { Position } from '../../src/types';

const NOW = new Date(2026, 10, 5, 12);
const pos = (transactionDate: string) => ({ transactionDate }) as Position;

describe('resolveWindow', () => {
    it('resolves presets, All and a custom past range', () => {
        expect(toISODate(resolveWindow({ timeline: '1M' }, [], NOW)!.from)).toBe('2026-10-05');
        expect(toISODate(resolveWindow({ timeline: 'All' }, [pos('2024-03-02'), pos('2025-01-01')], NOW)!.from)).toBe('2024-03-02');
        const sep = resolveWindow({ timeline: 'Custom', custom: { from: '2026-09-01', to: '2026-09-30' } }, [], NOW)!;
        expect([toISODate(sep.from), toISODate(sep.to)]).toEqual(['2026-09-01', '2026-09-30']);
    });

    it('has no window for All without positions, or an invalid custom range', () => {
        expect(resolveWindow({ timeline: 'All' }, [], NOW)).toBeNull();
        expect(resolveWindow({ timeline: 'Custom', custom: { from: '2026-09-30', to: '2026-09-01' } }, [], NOW)).toBeNull();
        expect(resolveWindow({ timeline: 'Custom' }, [], NOW)).toBeNull();
    });

    it('keys custom ranges by their dates so each caches separately', () => {
        expect(selectionKey({ timeline: '6M' })).toBe('6M');
        expect(selectionKey({ timeline: 'Custom', custom: { from: '2026-09-01', to: '2026-09-30' } })).toBe('Custom_2026-09-01_2026-09-30');
    });
});

describe('TimelineFilterButtons custom range', () => {
    it('opens on last month and lets either end be edited', () => {
        const onChange = jest.fn();
        const { rerender } = render(<TimelineFilterButtons selection={{ timeline: '1M' }} onSelectionChange={onChange} />);
        fireEvent.click(screen.getByRole('button', { name: 'Custom' }));
        const picked = onChange.mock.calls[0][0];
        expect(picked.timeline).toBe('Custom');
        expect(picked.custom.from < picked.custom.to).toBe(true);

        rerender(<TimelineFilterButtons selection={picked} onSelectionChange={onChange} />);
        fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-01-05' } });
        expect(onChange).toHaveBeenLastCalledWith({ timeline: 'Custom', custom: { from: '2026-01-05', to: picked.custom.to } });
    });
});
