/**
 * Mock data for testing portfolio functionality
 */

export const mockPosition = {
  id: 'test-1',
  ticker: 'AAPL',
  transactionDate: '2023-01-01',
  quantity: 100,
  transactionValue: 15000,
  transactionCcy: 'USD',
  transactionFxRate: 130.0,
  account: 'Test Account',
  broker: 'Test Broker',
}

export const mockPositions = [
  mockPosition,
  {
    id: 'test-2',
    ticker: 'GOOGL',
    transactionDate: '2023-02-01',
    quantity: 50,
    transactionValue: 5000,
    transactionCcy: 'USD',
    transactionFxRate: 128.0,
    account: 'Test Account',
    broker: 'Test Broker',
  },
  {
    id: 'test-3',
    ticker: '7203.T', // Toyota - Japanese stock
    transactionDate: '2023-03-01',
    quantity: 1000,
    transactionValue: 180000,
    transactionCcy: 'JPY',
    transactionFxRate: 1.0,
    account: 'JP Account',
    broker: 'Japanese Broker',
  },
]

export const mockPriceData = {
  'AAPL': 150.0,
  'GOOGL': 120.0,
  '7203.T': 1800,
}

export const mockHistoricalPrices = {
  'AAPL': {
    '2023-01-01': 150.0,
    '2023-02-01': 155.0,
    '2023-03-01': 160.0,
  },
  'GOOGL': {
    '2023-01-01': 100.0,
    '2023-02-01': 110.0,
    '2023-03-01': 120.0,
  },
  '7203.T': {
    '2023-01-01': 1700,
    '2023-02-01': 1750,
    '2023-03-01': 1800,
  },
}

export const mockFxRates = {
  'USD-JPY': 130.0,
  'EUR-JPY': 140.0,
}

export const mockPortfolioSummary = {
  totalValue: 50000000, // 50M JPY
  totalCost: 45000000,  // 45M JPY
  totalPnL: 5000000,    // 5M JPY profit
  totalPnLPercent: 11.11,
  positions: mockPositions.length,
}

/**
 * Mock fetch responses
 */
export const createMockFetchResponse = (data: any, status = 200) => {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(data),
    text: () => Promise.resolve(JSON.stringify(data)),
  } as Response)
}

/**
 * Helper to create mock API responses
 */
export const mockApiResponse = {
  positions: () => createMockFetchResponse(mockPositions),
  prices: (ticker: string) => createMockFetchResponse({ 
    ticker, 
    price: mockPriceData[ticker as keyof typeof mockPriceData] || 100 
  }),
  historicalPrices: () => createMockFetchResponse(mockHistoricalPrices),
  fxRates: () => createMockFetchResponse(mockFxRates),
}
