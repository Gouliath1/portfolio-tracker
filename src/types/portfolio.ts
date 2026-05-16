export type Currency = 'JPY' | 'USD' | string;

export type TransactionWay = 'buy' | 'sell';

/**
 * On-disk transaction record. The portfolio file is an array of these.
 * Lots (open + closed) are derived from the transactions via FIFO matching.
 *
 * Matching key: (ticker, account) — same ticker in different accounts is
 * treated as a separate tax-distinct holding.
 */
export interface Transaction {
    way: TransactionWay;
    date: string;            // YYYY/MM/DD
    ticker: string | number;
    fullName: string;
    broker?: string;
    account: string;
    quantity: number;
    pricePerUnit: number;    // gross price per unit (fees are tracked separately)
    fees?: number;           // settlement-currency fees on this transaction
    ccy: Currency;           // currency the transaction settled in
    stockCcy: Currency;      // currency the stock trades in
}

/**
 * A derived "lot view" of a holding. Produced by FIFO over transactions.
 * Open lots have no sale fields; closed lots have both sides populated.
 *
 * txBuyIndex / txSellIndex point back to the originating transactions in
 * the on-disk array — used by the UI to delete / undo by transaction.
 */
export interface RawPosition {
    transactionDate: string;
    ticker: string | number;
    fullName: string;
    broker?: string; // Broker name (e.g., "Rakuten", "Credit Agricole")
    account: string;
    quantity: number;
    costPerUnit: number;
    transactionCcy: Currency;
    stockCcy: Currency; // The currency the stock trades in (e.g., USD for AAPL, JPY for 7940.T)
    // Sale fields — present only when this lot has been (fully or partially) closed.
    // Effective salePricePerUnit folds sell-side fees, same convention as costPerUnit.
    saleDate?: string;
    salePricePerUnit?: number;
    saleCcy?: Currency;
    // Provenance — index into the on-disk transactions array.
    txBuyIndex?: number;
    txSellIndex?: number;
}

export type PositionStatus = 'open' | 'closed';

export interface Position extends RawPosition {
    status: PositionStatus;
    currentPrice: number | null;
    costInJPY: number;
    currentValueJPY: number; // 0 for closed lots
    pnlJPY: number;          // potential P&L for open, 0 for closed
    pnlPercentage: number;   // potential % for open, 0 for closed
    transactionFxRate: number; // FX rate used for cost calculation (historical or transaction)
    currentFxRate: number;     // Current FX rate used for value calculation
    // Realized fields — only populated for closed lots.
    proceedsJPY?: number;
    realizedPnlJPY?: number;
    realizedPnlPercentage?: number;
    saleFxRate?: number;
}

export interface PortfolioSummary {
    totalValueJPY: number;        // open lots only
    totalCostJPY: number;         // open lots only
    totalPnlJPY: number;          // open lots only (potential)
    totalPnlPercentage: number;   // open lots only
    positions: Position[];        // open lots only
    closedPositions: Position[];  // closed lots
    realizedPnlJPY: number;       // sum across closed lots
    realizedCostJPY: number;      // cost basis of closed lots (for %)
    realizedPnlPercentage: number;
}

export interface HistoricalPortfolioSnapshot {
    date: Date;
    totalValueJPY: number;
    totalCostJPY: number;
    pnlJPY: number;
    pnlPercentage: number;
}
