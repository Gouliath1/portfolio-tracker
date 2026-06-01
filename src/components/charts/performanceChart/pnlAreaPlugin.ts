const cssVar = (n: string) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();

// Chart plugin for drawing colored P&L areas
export const pnlAreaPlugin = {
    id: 'pnlArea',
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    beforeDatasetsDraw(chart: any) {
        const { ctx, data, scales } = chart;
        
        // Type guards and null checks
        if (!ctx || !data?.datasets || !scales) return;
        
        // Find the P&L dataset. Label is `P&L (<currency>)` when showing values
        // (currency varies — JPY, EUR, …) or `P&L (%)` in percentage mode.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const pnlDatasetIndex = data.datasets.findIndex((dataset: any) =>
            typeof dataset.label === 'string' && dataset.label.startsWith('P&L (')
        );
        if (pnlDatasetIndex === -1) return;
        
        const pnlDataset = data.datasets[pnlDatasetIndex];
        if (!pnlDataset?.data) return;
        
        // Use the correct Y-axis based on the dataset's yAxisID
        const yAxisId = pnlDataset.yAxisID || 'y';
        const yScale = scales[yAxisId];
        const xScale = scales.x;
        
        if (!yScale || !xScale) return;
        
        const zeroY = yScale.getPixelForValue(0);
        
        ctx.save();
        
        // Draw areas for each segment
        for (let i = 0; i < pnlDataset.data.length - 1; i++) {
            const currentValue = pnlDataset.data[i] as number;
            const nextValue = pnlDataset.data[i + 1] as number;
            
            if (typeof currentValue !== 'number' || typeof nextValue !== 'number') continue;
            
            const x1 = xScale.getPixelForValue(i);
            const x2 = xScale.getPixelForValue(i + 1);
            const y1 = yScale.getPixelForValue(currentValue);
            const y2 = yScale.getPixelForValue(nextValue);
            
            // Determine color based on values
            const isPositive = currentValue >= 0 && nextValue >= 0;
            const isNegative = currentValue <= 0 && nextValue <= 0;
            
            const greenFill = cssVar('--pnl-green-dim');
            const redFill   = cssVar('--pnl-red-dim');

            if (isPositive) {
                ctx.fillStyle = greenFill;
            } else if (isNegative) {
                ctx.fillStyle = redFill;
            } else {
                // Mixed segment — draw two parts
                const intersectionX = x1 + (x2 - x1) * (Math.abs(currentValue) / (Math.abs(currentValue) + Math.abs(nextValue)));

                if (currentValue > 0) {
                    ctx.fillStyle = greenFill;
                    ctx.beginPath();
                    ctx.moveTo(x1, zeroY);
                    ctx.lineTo(x1, y1);
                    ctx.lineTo(intersectionX, zeroY);
                    ctx.closePath();
                    ctx.fill();
                }

                if (nextValue < 0) {
                    ctx.fillStyle = redFill;
                    ctx.beginPath();
                    ctx.moveTo(intersectionX, zeroY);
                    ctx.lineTo(x2, y2);
                    ctx.lineTo(x2, zeroY);
                    ctx.closePath();
                    ctx.fill();
                }
                continue;
            }
            
            // Draw the area
            ctx.beginPath();
            ctx.moveTo(x1, zeroY);
            ctx.lineTo(x1, y1);
            ctx.lineTo(x2, y2);
            ctx.lineTo(x2, zeroY);
            ctx.closePath();
            ctx.fill();
        }
        
        ctx.restore();
    }
};
