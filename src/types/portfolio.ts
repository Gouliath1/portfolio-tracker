export type Currency = 'JPY' | 'USD' | string;

export interface RawPosition {
    transactionDate: string;
    ticker: string | number;
    fullName: string;
    broker?: string; // Broker name (e.g., "Rakuten", "Credit Agricole")
    account: string;
    quantity: number;
    costPerUnit: number;
    baseCcy: Currency;
    transactionFx?: number; // Optional, will be derived from historical FX rates
    fxPair?: string; // FX pair for the transaction (e.g., "EUR/USD", "USD/JPY")
}

export interface Position extends RawPosition {
    currentPrice: number | null;
    costInJPY: number;
    currentValueJPY: number;
    pnlJPY: number;
    pnlPercentage: number;
    transactionFxRate: number; // FX rate used for cost calculation (historical or transaction)
    currentFxRate: number; // Current FX rate used for value calculation
    transactionFxDetails?: { [pair: string]: number }; // Constituent rates used in transaction
    currentFxDetails?: { [pair: string]: number }; // Constituent rates used in current valuation
}

export interface PortfolioSummary {
    totalValueJPY: number;
    totalCostJPY: number;
    totalPnlJPY: number;
    totalPnlPercentage: number;
    positions: Position[];
}

export interface HistoricalPortfolioSnapshot {
    date: Date;
    totalValueJPY: number;
    totalCostJPY: number;
    pnlJPY: number;
    pnlPercentage: number;
}
