import { Position } from '../types/portfolio';

export const mockPositions: Position[] = [
    {
        date: '2015/03/12',
        ticker: 'AAPL',
        fullName: 'Apple',
        account: 'General',
        quantity: 8,
        costPerUnit: 4730.77,
        totalCost: 37846.16,
        currency: 'USD',
        fxRate: 121.61,
        unitValue: 211.26,
        totalValue: 206405,
        localCCY: 'JPY',
        pnlJPY: 168559,
        pnlPercentage: 43.48,
        annualizedPnl: 0.12
    },
    {
        date: '2015/03/12',
        ticker: 'GOOG',
        fullName: 'Alphabet Class C',
        account: 'General',
        quantity: 40,
        costPerUnit: 3741.96,
        totalCost: 149679,
        currency: 'USD',
        fxRate: 121.61,
        unitValue: 167.43,
        totalValue: 814446,
        localCCY: 'JPY',
        pnlJPY: 667569,
        pnlPercentage: 43.55,
        annualizedPnl: 0.47
    }
    // Add more positions as needed
];
