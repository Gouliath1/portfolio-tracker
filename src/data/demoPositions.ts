import { RawPosition, Transaction } from '@portfolio/types';
import { deriveLotsFromTransactions } from '../lib/core/fifo';

// A deliberately diversified sample portfolio so the Overview dashboard shows
// off every analytic: multiple asset classes (equity / ETF / fund / crypto),
// four currencies (USD, JPY, EUR, CHF) and four brokers. All tickers are real
// Yahoo symbols so live prices and asset-class lookups resolve.
export const DEMO_TRANSACTIONS: Transaction[] = [
    // ── US equities — Charles Schwab ──────────────────────────────
    {
        way: 'buy',
        date: '2020/01/15',
        ticker: 'AAPL',
        fullName: 'Apple Inc.',
        broker: 'Charles Schwab',
        account: 'US Account',
        quantity: 50,
        pricePerUnit: 75.5,
        ccy: 'USD',
        stockCcy: 'USD',
    },
    {
        way: 'buy',
        date: '2021/03/10',
        ticker: 'MSFT',
        fullName: 'Microsoft Corp.',
        broker: 'Charles Schwab',
        account: 'US Account',
        quantity: 30,
        pricePerUnit: 230.0,
        ccy: 'USD',
        stockCcy: 'USD',
    },
    {
        way: 'buy',
        date: '2022/09/01',
        ticker: 'NVDA',
        fullName: 'NVIDIA Corp.',
        broker: 'Charles Schwab',
        account: 'US Account',
        quantity: 20,
        pricePerUnit: 155.0,
        ccy: 'USD',
        stockCcy: 'USD',
    },

    // ── US ETF & mutual fund — Charles Schwab ─────────────────────
    {
        way: 'buy',
        date: '2021/06/01',
        ticker: 'SPY',
        fullName: 'SPDR S&P 500 ETF',
        broker: 'Charles Schwab',
        account: 'US Account',
        quantity: 15,
        pricePerUnit: 420.0,
        ccy: 'USD',
        stockCcy: 'USD',
    },
    {
        way: 'buy',
        date: '2020/05/01',
        ticker: 'VFIAX',
        fullName: 'Vanguard 500 Index Fund',
        broker: 'Charles Schwab',
        account: 'US Account',
        quantity: 20,
        pricePerUnit: 270.0,
        ccy: 'USD',
        stockCcy: 'USD',
    },

    // ── Japanese equities — Rakuten Securities ────────────────────
    {
        way: 'buy',
        date: '2019/06/01',
        ticker: '7203.T',
        fullName: 'Toyota Motor Corp.',
        broker: 'Rakuten Securities',
        account: 'Japan Account',
        quantity: 100,
        pricePerUnit: 6800,
        ccy: 'JPY',
        stockCcy: 'JPY',
    },
    {
        way: 'buy',
        date: '2020/07/20',
        ticker: '9984.T',
        fullName: 'SoftBank Group Corp.',
        broker: 'Rakuten Securities',
        account: 'Japan Account',
        quantity: 50,
        pricePerUnit: 5800,
        ccy: 'JPY',
        stockCcy: 'JPY',
    },

    // ── European equities — Boursorama ────────────────────────────
    {
        way: 'buy',
        date: '2021/09/01',
        ticker: 'ASML.AS',
        fullName: 'ASML Holding NV',
        broker: 'Boursorama',
        account: 'EU Account',
        quantity: 10,
        pricePerUnit: 700.0,
        ccy: 'EUR',
        stockCcy: 'EUR',
    },
    {
        way: 'buy',
        date: '2022/01/10',
        ticker: 'MC.PA',
        fullName: 'LVMH',
        broker: 'Boursorama',
        account: 'EU Account',
        quantity: 5,
        pricePerUnit: 700.0,
        ccy: 'EUR',
        stockCcy: 'EUR',
    },
    {
        way: 'buy',
        date: '2021/11/15',
        ticker: 'NESN.SW',
        fullName: 'Nestlé SA',
        broker: 'Boursorama',
        account: 'EU Account',
        quantity: 30,
        pricePerUnit: 123.0,
        ccy: 'CHF',
        stockCcy: 'CHF',
    },

    // ── Crypto — Interactive Brokers ──────────────────────────────
    {
        way: 'buy',
        date: '2021/11/01',
        ticker: 'BTC-USD',
        fullName: 'Bitcoin',
        broker: 'Interactive Brokers',
        account: 'Crypto Account',
        quantity: 0.15,
        pricePerUnit: 61000.0,
        ccy: 'USD',
        stockCcy: 'USD',
    },

    // ── A realised sale, to populate closed-lot / realised P&L ────
    {
        way: 'sell',
        date: '2024/02/15',
        ticker: 'NVDA',
        fullName: 'NVIDIA Corp.',
        broker: 'Charles Schwab',
        account: 'US Account',
        quantity: 10,
        pricePerUnit: 720.0,
        fees: 1.5,
        ccy: 'USD',
        stockCcy: 'USD',
    },
];

// Derived lot view kept for any legacy consumers.
export const DEMO_POSITIONS: RawPosition[] = deriveLotsFromTransactions(DEMO_TRANSACTIONS);

export const DEMO_SET_ID = 'demo';

export const DEMO_SET = {
    id: DEMO_SET_ID,
    name: 'demo-portfolio',
    display_name: 'Demo Portfolio',
    description: 'Viewing demo data — use Import set or Add position to start your own portfolio',
    info_type: 'warning',
    is_active: true,
    created_at: new Date('2024-01-01').toISOString(),
    updated_at: new Date('2024-01-01').toISOString(),
};
