import { RawPosition } from '@portfolio/types';

export const DEMO_POSITIONS: RawPosition[] = [
    {
        transactionDate: '2020/01/15',
        ticker: 'AAPL',
        fullName: 'Apple Inc.',
        broker: 'Demo Broker',
        account: 'US Account',
        quantity: 50,
        costPerUnit: 75.5,
        transactionCcy: 'USD',
        stockCcy: 'USD',
    },
    {
        transactionDate: '2021/03/10',
        ticker: 'MSFT',
        fullName: 'Microsoft Corp.',
        broker: 'Demo Broker',
        account: 'US Account',
        quantity: 30,
        costPerUnit: 230.0,
        transactionCcy: 'USD',
        stockCcy: 'USD',
    },
    {
        transactionDate: '2022/09/01',
        ticker: 'NVDA',
        fullName: 'NVIDIA Corp.',
        broker: 'Demo Broker',
        account: 'US Account',
        quantity: 20,
        costPerUnit: 155.0,
        transactionCcy: 'USD',
        stockCcy: 'USD',
    },
    {
        transactionDate: '2019/06/01',
        ticker: '7203.T',
        fullName: 'Toyota Motor Corp.',
        broker: 'Demo Broker',
        account: 'Japan Account',
        quantity: 100,
        costPerUnit: 6800,
        transactionCcy: 'JPY',
        stockCcy: 'JPY',
    },
    {
        transactionDate: '2020/07/20',
        ticker: '9984.T',
        fullName: 'SoftBank Group Corp.',
        broker: 'Demo Broker',
        account: 'Japan Account',
        quantity: 50,
        costPerUnit: 5800,
        transactionCcy: 'JPY',
        stockCcy: 'JPY',
    },
];

export const DEMO_SET_ID = 'demo';

export const DEMO_SET = {
    id: DEMO_SET_ID,
    name: 'demo-portfolio',
    display_name: 'Demo Portfolio',
    description: 'Sample data — open Settings to import your own positions',
    info_type: 'warning',
    is_active: true,
    created_at: new Date(0).toISOString(),
    updated_at: new Date(0).toISOString(),
};
