// Draws rounded "pill" badges at the right edge of the chart showing the
// latest value of each visible series — Portfolio Value (blue), Cost Basis
// (slate) and P&L (green). Mirrors modern wealth-dashboard callouts.

interface BadgeConfig {
    symbol: string;
    currency: string;
    showValues: boolean;
}

const compact = (value: number, symbol: string, signed: boolean): string => {
    const sign = value < 0 ? '−' : signed ? '+' : '';
    const a = Math.abs(value);
    let body: string;
    if (a >= 1e9) body = `${(a / 1e9).toFixed(2)}B`;
    else if (a >= 1e6) body = `${(a / 1e6).toFixed(2)}M`;
    else if (a >= 1e3) body = `${(a / 1e3).toFixed(1)}K`;
    else body = Math.round(a).toLocaleString();
    return `${sign}${symbol}${body}`;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const lastFiniteIndex = (data: any[]): number => {
    for (let i = data.length - 1; i >= 0; i--) {
        const v = data[i];
        if (typeof v === 'number' && Number.isFinite(v) && v !== 0) return i;
    }
    return data.length - 1;
};

export const valueBadgePlugin = {
    id: 'valueBadges',
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    afterDatasetsDraw(chart: any) {
        const cfg: BadgeConfig | undefined = chart.options?.plugins?.valueBadges;
        if (!cfg || !cfg.showValues) return;

        const { ctx, chartArea } = chart;
        if (!ctx || !chartArea) return;

        const PILL_H = 22;
        const PAD_X = 9;
        const GAP = 4;
        const xRight = chart.width - 6;

        ctx.save();
        ctx.font = '600 12px Inter, system-ui, sans-serif';

        // Collect a badge for each visible dataset.
        const badges: { y: number; text: string; bg: string; fg: string }[] = [];

        chart.data.datasets.forEach((dataset: { data: number[]; borderColor: string }, i: number) => {
            const meta = chart.getDatasetMeta(i);
            if (meta.hidden || !meta.data?.length) return;

            const idx = lastFiniteIndex(dataset.data);
            const point = meta.data[idx];
            if (!point) return;

            const isCost = i === 1; // 0 value, 1 cost, 2 P&L
            const isPnl = i === 2;
            badges.push({
                y: point.y,
                text: compact(dataset.data[idx], cfg.symbol, isPnl),
                bg: dataset.borderColor,
                fg: isCost ? '#0F172A' : '#FFFFFF',
            });
        });

        // Resolve vertical overlaps so pills stack cleanly.
        badges.sort((a, b) => a.y - b.y);
        for (let i = 1; i < badges.length; i++) {
            const minY = badges[i - 1].y + PILL_H + GAP;
            if (badges[i].y < minY) badges[i].y = minY;
        }
        // Keep within the plot vertically.
        const maxY = chartArea.bottom - PILL_H / 2;
        for (let i = badges.length - 1; i >= 0; i--) {
            if (badges[i].y > maxY) badges[i].y = maxY;
            if (i > 0) {
                const cap = badges[i].y - PILL_H - GAP;
                if (badges[i - 1].y > cap) badges[i - 1].y = cap;
            }
        }

        badges.forEach(({ y, text, bg, fg }) => {
            const w = ctx.measureText(text).width + PAD_X * 2;
            const x = xRight - w;
            const top = y - PILL_H / 2;
            const r = PILL_H / 2;

            ctx.beginPath();
            if (typeof ctx.roundRect === 'function') {
                ctx.roundRect(x, top, w, PILL_H, r);
            } else {
                ctx.rect(x, top, w, PILL_H);
            }
            ctx.fillStyle = bg;
            ctx.fill();

            ctx.fillStyle = fg;
            ctx.textBaseline = 'middle';
            ctx.textAlign = 'left';
            ctx.fillText(text, x + PAD_X, y + 0.5);
        });

        ctx.restore();
    },
};
