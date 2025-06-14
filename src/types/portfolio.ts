export type Currency = 'JPY' | 'USD' | string;

export interface Position {
    date: string;
    ticker: string;
    fullName: string;
    account: string;
    quantity: number;
    costPerUnit: number;
    totalCost: number;
    currency: Currency;
    fxRate: number;
    unitValue: number;
    totalValue: number;
    localCCY: Currency;
    pnlJPY: number;
    pnlPercentage: number;
    annualizedPnl: number;
    dividends?: number;
}

export interface PortfolioSummary {
    totalValueJPY: number;
    totalCostJPY: number;
    totalPnlJPY: number;
    totalPnlPercentage: number;
    positions: Position[];
}
