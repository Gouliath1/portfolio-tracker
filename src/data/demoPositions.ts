import { RawPosition, Transaction } from '@portfolio/types';
import { deriveLotsFromTransactions } from '../lib/core/fifo';

export const DEMO_TRANSACTIONS: Transaction[] = [
    {
        way: 'buy',
        date: '2020/01/15',
        ticker: 'AAPL',
        fullName: 'Apple Inc.',
        broker: 'Demo Broker',
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
        broker: 'Demo Broker',
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
        broker: 'Demo Broker',
        account: 'US Account',
        quantity: 20,
        pricePerUnit: 155.0,
        ccy: 'USD',
        stockCcy: 'USD',
    },
    {
        way: 'buy',
        date: '2019/06/01',
        ticker: '7203.T',
        fullName: 'Toyota Motor Corp.',
        broker: 'Demo Broker',
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
        broker: 'Demo Broker',
        account: 'Japan Account',
        quantity: 50,
        pricePerUnit: 5800,
        ccy: 'JPY',
        stockCcy: 'JPY',
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
