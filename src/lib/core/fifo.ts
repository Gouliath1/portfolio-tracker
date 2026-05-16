import { RawPosition, Transaction } from '@portfolio/types';

/**
 * Convert a flat transaction list into the per-lot "RawPosition" view used
 * by the rest of the app.
 *
 * Rules:
 * - Lots are grouped by (ticker + account). Same ticker in different accounts
 *   is tax-distinct and never matches across.
 * - Within a group, transactions are sorted by date (then by original index
 *   as a stable tiebreaker). Sells consume the oldest open buys first (FIFO).
 * - A single sell may split across multiple buys; each match emits its own
 *   closed RawPosition.
 * - Any sell quantity that can't be matched (more sells than buys for the
 *   ticker+account at that point in time) is silently ignored. The UI should
 *   prevent this at write time.
 *
 * Fees are folded into effective per-unit prices, mirroring the convention
 * used by the rest of the calculation layer:
 *   buy:  effectivePrice = (price * qty + fees) / qty
 *   sell: effectivePrice = (price * qty - fees) / qty
 * For partial sells, the fees are allocated proportionally to the matched
 * quantity.
 */
export function deriveLotsFromTransactions(transactions: Transaction[]): RawPosition[] {
    type IndexedTx = Transaction & { idx: number };
    const indexed: IndexedTx[] = transactions.map((t, idx) => ({ ...t, idx }));

    // Group by (ticker, account).
    const groups = new Map<string, IndexedTx[]>();
    for (const tx of indexed) {
        const key = `${String(tx.ticker)}::${tx.account}`;
        const arr = groups.get(key);
        if (arr) arr.push(tx);
        else groups.set(key, [tx]);
    }

    // Output preserves the original transaction order for open lots
    // (by buy idx) and closed lots (by sell idx). To keep the UI stable
    // we'll collect everything and then sort at the end.
    type Result = { lot: RawPosition; sortKey: number };
    const results: Result[] = [];

    for (const [, txs] of groups) {
        txs.sort((a, b) => {
            const da = normalizeDate(a.date);
            const db = normalizeDate(b.date);
            if (da < db) return -1;
            if (da > db) return 1;
            return a.idx - b.idx;
        });

        // Each open buy carries its remaining unsold quantity.
        const openBuys: Array<{ tx: IndexedTx; remaining: number }> = [];

        for (const tx of txs) {
            const fees = tx.fees ?? 0;
            if (tx.way === 'buy') {
                const effCostPerUnit = tx.quantity > 0 ? (tx.pricePerUnit * tx.quantity + fees) / tx.quantity : tx.pricePerUnit;
                openBuys.push({ tx: { ...tx, pricePerUnit: effCostPerUnit, fees: 0 }, remaining: tx.quantity });
                continue;
            }

            // Sell: allocate fees proportionally across matched portions, by matched qty.
            let sellQtyLeft = tx.quantity;
            while (sellQtyLeft > 0 && openBuys.length > 0) {
                const head = openBuys[0];
                if (head.remaining <= 0) { openBuys.shift(); continue; }
                const matched = Math.min(head.remaining, sellQtyLeft);
                const feeShare = tx.quantity > 0 ? fees * (matched / tx.quantity) : 0;
                const effSalePerUnit = matched > 0 ? (tx.pricePerUnit * matched - feeShare) / matched : tx.pricePerUnit;

                const closed: RawPosition = {
                    transactionDate: head.tx.date,
                    ticker: head.tx.ticker,
                    fullName: head.tx.fullName,
                    broker: head.tx.broker,
                    account: head.tx.account,
                    quantity: matched,
                    costPerUnit: head.tx.pricePerUnit, // already effective
                    transactionCcy: head.tx.ccy,
                    stockCcy: head.tx.stockCcy,
                    saleDate: tx.date,
                    salePricePerUnit: effSalePerUnit,
                    saleCcy: tx.ccy,
                    txBuyIndex: head.tx.idx,
                    txSellIndex: tx.idx,
                };
                results.push({ lot: closed, sortKey: tx.idx });

                head.remaining -= matched;
                sellQtyLeft -= matched;
                if (head.remaining === 0) openBuys.shift();
            }
            // Any leftover sellQtyLeft is dropped (invariant violation).
        }

        // Remaining open lots
        for (const ob of openBuys) {
            if (ob.remaining <= 0) continue;
            const open: RawPosition = {
                transactionDate: ob.tx.date,
                ticker: ob.tx.ticker,
                fullName: ob.tx.fullName,
                broker: ob.tx.broker,
                account: ob.tx.account,
                quantity: ob.remaining,
                costPerUnit: ob.tx.pricePerUnit, // effective
                transactionCcy: ob.tx.ccy,
                stockCcy: ob.tx.stockCcy,
                txBuyIndex: ob.tx.idx,
            };
            results.push({ lot: open, sortKey: ob.tx.idx });
        }
    }

    results.sort((a, b) => a.sortKey - b.sortKey);
    return results.map(r => r.lot);
}

/**
 * Normalize a `YYYY/MM/DD` or `YYYY-MM-DD` string (with possibly single-digit
 * month/day) into a zero-padded `YYYY-MM-DD` for safe lexicographic compare.
 * Falls back to the original string if it doesn't parse.
 */
function normalizeDate(s: string): string {
    const m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
    if (!m) return s;
    const [, y, mo, d] = m;
    return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
}

/**
 * Sum of currently-open quantity for a ticker+account, given a transaction list.
 * Used by the Sell modal to validate.
 */
export function openQuantityFor(transactions: Transaction[], ticker: string | number, account: string): number {
    let qty = 0;
    for (const t of transactions) {
        if (String(t.ticker) !== String(ticker) || t.account !== account) continue;
        qty += t.way === 'buy' ? t.quantity : -t.quantity;
    }
    return Math.max(0, qty);
}
