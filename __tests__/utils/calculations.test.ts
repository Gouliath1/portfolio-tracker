/**
 * Unit tests for calculation utilities
 */

import { calculatePosition } from '@/utils/calculations'
import { mockApiResponse, mockPositions } from '../__mocks__/mockData'
import { mockFetchOnce } from '../__mocks__/testUtils'

// Mock the yahooFinanceApi module
jest.mock('@/utils/yahooFinanceApi', () => ({
  fetchStockPrice: jest.fn(),
  updateAllPositions: jest.fn(),
  fetchCurrentFxRate: jest.fn(),
  fetchHistoricalFxRates: jest.fn(),
  BASE_CURRENCY_CONSTANT: 'JPY',
}))

describe('Calculations Utils', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    // Reset fetch mock
    const mockFetch = global.fetch as jest.MockedFunction<typeof fetch>
    mockFetch.mockClear()
    
    // Mock console to avoid noise in test output
    jest.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  describe('calculatePosition', () => {
    it('should calculate position correctly for USD stock', async () => {
      const rawPosition = {
        id: 'test-1',
        ticker: 'AAPL',
        transactionDate: '2023-01-01',
        quantity: 100,
        costPerUnit: 150.0,
        transactionCcy: 'USD',
        fullName: 'Apple Inc.',
        stockCcy: 'USD',
        account: 'Test Account',
        broker: 'Test Broker',
      }

      // Mock the yahooFinanceApi functions
      const { fetchCurrentFxRate } = require('@/utils/yahooFinanceApi')
      fetchCurrentFxRate.mockResolvedValue(130.0) // USD/JPY rate

      const result = await calculatePosition(rawPosition, 160.0) // Current price $160

      expect(result).toMatchObject({
        ticker: 'AAPL',
        quantity: 100,
        account: 'Test Account',
        broker: 'Test Broker',
        fullName: 'Apple Inc.',
      })

      expect(result.currentValueJPY).toBeGreaterThan(0)
      expect(result.pnlJPY).toBeDefined()
      expect(result.pnlPercentage).toBeDefined()
    })

    it('should calculate position correctly for JPY stock', async () => {
      const rawPosition = {
        id: 'test-2',
        ticker: '7203.T',
        transactionDate: '2023-01-01',
        quantity: 1000,
        costPerUnit: 1700,
        transactionCcy: 'JPY',
        fullName: 'Toyota Motor Corp',
        stockCcy: 'JPY',
        account: 'JP Account',
        broker: 'Japanese Broker',
      }

      const result = await calculatePosition(rawPosition, 1800) // Current price ¥1800

      expect(result).toMatchObject({
        ticker: '7203.T',
        quantity: 1000,
        account: 'JP Account',
        broker: 'Japanese Broker',
        fullName: 'Toyota Motor Corp',
      })

      // For JPY stock, no FX conversion should be needed
      expect(result.costInJPY).toBe(1700 * 1000) // 1,700,000 JPY
      expect(result.currentValueJPY).toBe(1800 * 1000) // 1,800,000 JPY
      expect(result.pnlJPY).toBe(100 * 1000) // 100,000 JPY profit
      expect(result.pnlPercentage).toBeCloseTo(5.88, 1) // ~5.88% gain
    })

    it('should handle null current price gracefully', async () => {
      const rawPosition = {
        id: 'test-3',
        ticker: 'UNKNOWN',
        transactionDate: '2023-01-01',
        quantity: 100,
        costPerUnit: 100,
        transactionCcy: 'USD',
        fullName: 'Unknown Stock',
        stockCcy: 'USD',
        account: 'Test Account',
        broker: 'Test Broker',
      }

      const { fetchCurrentFxRate } = require('@/utils/yahooFinanceApi')
      fetchCurrentFxRate.mockResolvedValue(130.0)

      const result = await calculatePosition(rawPosition, null)

      expect(result.currentPrice).toBeNull()
      expect(result.currentValueJPY).toBe(0)
      expect(result.pnlJPY).toBeLessThanOrEqual(0) // Should show loss or zero since current value is 0
    })

    it('should handle FX rate fetching errors', async () => {
      const rawPosition = {
        id: 'test-4',
        ticker: 'AAPL',
        transactionDate: '2023-01-01',
        quantity: 100,
        costPerUnit: 150.0,
        transactionCcy: 'USD',
        fullName: 'Apple Inc.',
        stockCcy: 'USD',
        account: 'Test Account',
        broker: 'Test Broker',
      }

      const { fetchCurrentFxRate, fetchHistoricalFxRates } = require('@/utils/yahooFinanceApi')
      fetchHistoricalFxRates.mockResolvedValue({}) // No historical data
      fetchCurrentFxRate.mockResolvedValue(130.0) // Fallback rate

      // Should still calculate the position using fallback rate
      const result = await calculatePosition(rawPosition, 160.0)

      expect(result).toBeDefined()
      expect(result.ticker).toBe('AAPL')
      expect(result.currentValueJPY).toBeGreaterThan(0)
    })
  })

  describe('Currency Conversion', () => {
    it('should handle same currency conversion', async () => {
      // This test would require exposing the convertCurrency function
      // For now, we test it indirectly through calculatePosition
      const rawPosition = {
        id: 'test-5',
        ticker: '7203.T',
        transactionDate: '2023-01-01',
        quantity: 100,
        costPerUnit: 1700,
        transactionCcy: 'JPY', // Same as base currency
        fullName: 'Toyota Motor Corp',
        stockCcy: 'JPY',
        account: 'JP Account',
        broker: 'Japanese Broker',
      }

      const result = await calculatePosition(rawPosition, 1800)

      // No FX conversion should occur for JPY to JPY
      expect(result.costInJPY).toBe(1700 * 100)
      expect(result.currentValueJPY).toBe(1800 * 100)
    })
  })
})
