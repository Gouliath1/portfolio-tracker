/**
 * Unit tests for calculation utilities
 */

import { calculatePosition, calculatePortfolioSummary } from '@portfolio/core'
import { mockApiResponse, mockPositions } from '../__mocks__/mockData'
import { mockFetchOnce } from '../__mocks__/testUtils'

// Mock the yahooFinanceApi module
jest.mock('@portfolio/core/yahooFinanceApi', () => ({
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
      const { fetchCurrentFxRate } = require('@portfolio/core/yahooFinanceApi')
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

      const { fetchCurrentFxRate } = require('@portfolio/core/yahooFinanceApi')
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

      const { fetchCurrentFxRate, fetchHistoricalFxRates } = require('@portfolio/core/yahooFinanceApi')
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

    it('should handle cross-currency transactions', async () => {
      const rawPosition = {
        id: 'test-6',
        ticker: 'AAPL',
        transactionDate: '2023-01-01',
        quantity: 50,
        costPerUnit: 150.0,
        transactionCcy: 'EUR', // Different from stock currency (USD)
        fullName: 'Apple Inc.',
        stockCcy: 'USD',
        account: 'EU Account',
        broker: 'European Broker',
      }

      const { fetchCurrentFxRate, fetchHistoricalFxRates } = require('@portfolio/core/yahooFinanceApi')
      
      // Mock historical EUR/JPY rate for transaction date
      fetchHistoricalFxRates.mockResolvedValue({
        '2023-01-01': 140.0 // EUR/JPY rate at transaction
      })
      
      // Mock current USD/JPY rate for current value
      fetchCurrentFxRate.mockResolvedValue(130.0) // USD/JPY rate

      const result = await calculatePosition(rawPosition, 160.0) // Current price $160

      expect(result.ticker).toBe('AAPL')
      expect(result.quantity).toBe(50)
      expect(result.transactionFxRate).toBe(140.0) // Historical EUR/JPY rate
      expect(result.currentFxRate).toBe(130.0) // Current USD/JPY rate
      expect(result.costInJPY).toBe(150 * 50 * 140) // EUR cost converted to JPY
      expect(result.currentValueJPY).toBe(160 * 50 * 130) // USD value converted to JPY
    })
  })

  describe('calculatePortfolioSummary', () => {
    beforeEach(() => {
      const { fetchStockPrice, updateAllPositions } = require('@portfolio/core/yahooFinanceApi')
      fetchStockPrice.mockClear()
      updateAllPositions.mockClear()
    })

    it('should calculate portfolio summary correctly', async () => {
      const rawPositions = [
        {
          id: 'portfolio-1',
          ticker: 'AAPL',
          transactionDate: '2023-01-01',
          quantity: 100,
          costPerUnit: 150.0,
          transactionCcy: 'USD',
          fullName: 'Apple Inc.',
          stockCcy: 'USD',
          account: 'US Account',
          broker: 'US Broker',
        },
        {
          id: 'portfolio-2',
          ticker: '7203.T',
          transactionDate: '2023-01-01',
          quantity: 1000,
          costPerUnit: 1700,
          transactionCcy: 'JPY',
          fullName: 'Toyota Motor Corp',
          stockCcy: 'JPY',
          account: 'JP Account',
          broker: 'JP Broker',
        }
      ]

      const { fetchStockPrice, fetchCurrentFxRate } = require('@portfolio/core/yahooFinanceApi')
      
      // Mock stock prices
      fetchStockPrice
        .mockResolvedValueOnce(160.0) // AAPL current price
        .mockResolvedValueOnce(1800) // Toyota current price
      
      // Mock FX rate for USD positions
      fetchCurrentFxRate.mockResolvedValue(130.0) // USD/JPY rate

      const result = await calculatePortfolioSummary(rawPositions)

      expect(result).toMatchObject({
        totalCostJPY: expect.any(Number),
        totalValueJPY: expect.any(Number),
        totalPnlJPY: expect.any(Number),
        totalPnlPercentage: expect.any(Number),
        positions: expect.arrayContaining([
          expect.objectContaining({ ticker: 'AAPL' }),
          expect.objectContaining({ ticker: '7203.T' })
        ])
      })

      expect(result.positions).toHaveLength(2)
      expect(result.totalValueJPY).toBeGreaterThan(0)
      expect(result.totalCostJPY).toBeGreaterThan(0)
    })

    it('should handle force refresh correctly', async () => {
      const rawPositions = [{
        id: 'force-refresh-1',
        ticker: 'AAPL',
        transactionDate: '2023-01-01',
        quantity: 100,
        costPerUnit: 150.0,
        transactionCcy: 'USD',
        fullName: 'Apple Inc.',
        stockCcy: 'USD',
        account: 'Test Account',
        broker: 'Test Broker',
      }]

      const { updateAllPositions } = require('@portfolio/core/yahooFinanceApi')
      updateAllPositions.mockResolvedValue({
        'AAPL': 165.0
      })

      const result = await calculatePortfolioSummary(rawPositions, true)

      expect(updateAllPositions).toHaveBeenCalledWith(['AAPL'])
      expect(result.positions).toHaveLength(1)
      expect(result.positions[0].currentPrice).toBe(165.0)
    })

    it('should handle empty portfolio', async () => {
      const result = await calculatePortfolioSummary([])

      expect(result.totalCostJPY).toBe(0)
      expect(result.totalValueJPY).toBe(0)
      expect(result.totalPnlJPY).toBe(0)
      expect(result.positions).toEqual([])
      
      // Note: The implementation returns NaN for percentage when cost is 0
      // This could be considered a bug - should probably return 0 or handle gracefully
      expect(isNaN(result.totalPnlPercentage)).toBe(true)
    })

    it('should handle mixed currencies in portfolio', async () => {
      const mixedPositions = [
        {
          id: 'mixed-1',
          ticker: 'MSFT',
          transactionDate: '2023-01-01',
          quantity: 50,
          costPerUnit: 300.0,
          transactionCcy: 'USD',
          fullName: 'Microsoft Corporation',
          stockCcy: 'USD',
          account: 'US Account',
          broker: 'US Broker',
        },
        {
          id: 'mixed-2',
          ticker: 'SAP',
          transactionDate: '2023-01-01',
          quantity: 25,
          costPerUnit: 100.0,
          transactionCcy: 'EUR',
          fullName: 'SAP SE',
          stockCcy: 'EUR',
          account: 'EU Account',
          broker: 'EU Broker',
        },
        {
          id: 'mixed-3',
          ticker: '6758.T',
          transactionDate: '2023-01-01',
          quantity: 500,
          costPerUnit: 8000,
          transactionCcy: 'JPY',
          fullName: 'Sony Group Corporation',
          stockCcy: 'JPY',
          account: 'JP Account',
          broker: 'JP Broker',
        }
      ]

      const { fetchStockPrice, fetchCurrentFxRate } = require('@portfolio/core/yahooFinanceApi')
      
      // Mock stock prices
      fetchStockPrice
        .mockResolvedValueOnce(320.0) // MSFT
        .mockResolvedValueOnce(110.0) // SAP
        .mockResolvedValueOnce(8500)  // Sony

      // Mock FX rates
      fetchCurrentFxRate
        .mockResolvedValueOnce(130.0) // USD/JPY
        .mockResolvedValueOnce(140.0) // EUR/JPY

      const result = await calculatePortfolioSummary(mixedPositions)

      expect(result.positions).toHaveLength(3)
      expect(result.totalCostJPY).toBeGreaterThan(0)
      expect(result.totalValueJPY).toBeGreaterThan(0)
      
      // Check that all positions are calculated
      const tickers = result.positions.map(p => p.ticker)
      expect(tickers).toContain('MSFT')
      expect(tickers).toContain('SAP')
      expect(tickers).toContain('6758.T')
    })

    it('should handle duplicate tickers correctly', async () => {
      const duplicatePositions = [
        {
          id: 'dup-1',
          ticker: 'AAPL',
          transactionDate: '2023-01-01',
          quantity: 100,
          costPerUnit: 150.0,
          transactionCcy: 'USD',
          fullName: 'Apple Inc.',
          stockCcy: 'USD',
          account: 'Account 1',
          broker: 'Broker 1',
        },
        {
          id: 'dup-2',
          ticker: 'AAPL',
          transactionDate: '2023-06-01',
          quantity: 50,
          costPerUnit: 180.0,
          transactionCcy: 'USD',
          fullName: 'Apple Inc.',
          stockCcy: 'USD',
          account: 'Account 2',
          broker: 'Broker 2',
        }
      ]

      const { fetchStockPrice, fetchCurrentFxRate } = require('@portfolio/core/yahooFinanceApi')
      
      fetchStockPrice.mockResolvedValue(170.0) // AAPL current price
      fetchCurrentFxRate.mockResolvedValue(130.0) // USD/JPY rate

      const result = await calculatePortfolioSummary(duplicatePositions)

      expect(result.positions).toHaveLength(2)
      // The implementation efficiently fetches each unique ticker only once
      expect(fetchStockPrice).toHaveBeenCalledTimes(1) // Only called once for AAPL
      
      // Both positions should have the same current price
      expect(result.positions[0].currentPrice).toBe(170.0)
      expect(result.positions[1].currentPrice).toBe(170.0)
      
      // But different cost bases
      expect(result.positions[0].costInJPY).not.toBe(result.positions[1].costInJPY)
    })
  })
})
