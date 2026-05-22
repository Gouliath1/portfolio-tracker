export type Currency = 'USD' | 'JPY' | 'EUR' | 'GBP' | 'HKD' | 'SGD' | 'AUD' | 'CAD' | 'CHF' | 'CNY' | 'KRW';

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
    // Cumulative dividend income (in base currency) for ex-dates in
    // (transactionDate, saleDate ?? now]. Sourced from the dividend_events
    // cache; FX-converted at each ex-date.
    dividendIncomeJPY: number;
    // Per-event dividend breakdown for this lot, in base currency, sorted by
    // ex-date. Sums to `dividendIncomeJPY`. Used by the XIRR calculation so
    // each dividend becomes a cash inflow on its actual ex-date rather than
    // a single lumped amount. Optional so cached summaries from before this
    // field was introduced still deserialize.
    dividendEvents?: { exDate: string; amountInBase: number }[];
    // Total return % including dividends:
    //   open:   (currentValue + dividends − cost) / cost × 100
    //   closed: (proceeds      + dividends − cost) / cost × 100
    // Falls back to pnlPercentage when prices are still loading.
    totalReturnPercentage: number;
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
    // Dividend income across all lots (open + closed), base currency.
    totalDividendsJPY: number;
}

export interface HistoricalPortfolioSnapshot {
    date: Date;
    totalValueJPY: number;
    totalCostJPY: number;
    pnlJPY: number;
    pnlPercentage: number;
}

/**
 * Per-share dividend issued by a security. Sourced from Yahoo Finance and
 * cached in the shared market-data store. Currency is the security's listing
 * currency — convert at read time using fx_rates.
 *
 * Reconciling against actual cash received (withholding tax, FX at payment,
 * fractional rounding) is a separate concern and lives outside this type.
 */
export interface DividendEvent {
    ticker: string;
    exDate: string;       // YYYY-MM-DD
    amountPerShare: number;
    currency: Currency;
}
