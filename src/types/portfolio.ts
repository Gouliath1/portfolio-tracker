export type Currency = 'JPY' | 'USD' | string;

export interface RawPosition {
    transactionDate: string;
    ticker: string | number;
    fullName: string;
    account: string;
    quantity: number;
    costPerUnit: number;
    baseCcy: Currency;
    transactionFx: number;
    currentCostInBaseCcy: number;
}

export interface Position extends RawPosition {
    costInJPY: number;
    currentValueJPY: number;
    pnlJPY: number;
    pnlPercentage: number;
}

export interface PortfolioSummary {
    totalValueJPY: number;
    totalCostJPY: number;
    totalPnlJPY: number;
    totalPnlPercentage: number;
    positions: Position[];
}
