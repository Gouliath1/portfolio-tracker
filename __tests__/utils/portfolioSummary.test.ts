/**
 * Unit tests for portfolio summary calculations
 * Tests the core portfolio logic without external dependencies
 */

import { PortfolioSummary, Position } from '@portfolio/types'

// Mock a simple portfolio summary calculation function
const calculatePortfolioSummary = (positions: Position[]): PortfolioSummary => {
  const totalCostJPY = positions.reduce((sum, pos) => sum + pos.costInJPY, 0)
  const totalValueJPY = positions.reduce((sum, pos) => sum + pos.currentValueJPY, 0)
  const totalPnlJPY = totalValueJPY - totalCostJPY
  const totalPnlPercentage = totalCostJPY > 0 ? (totalPnlJPY / totalCostJPY) * 100 : 0

  return {
    totalCostJPY,
    totalValueJPY,
    totalPnlJPY,
    totalPnlPercentage,
    positions,
  }
}

describe('Portfolio Summary Calculations', () => {
  const mockPositions: Position[] = [
    {
      transactionDate: '2023-01-01',
      ticker: 'AAPL',
      fullName: 'Apple Inc.',
      broker: 'Test Broker',
      account: 'Test Account',
      quantity: 100,
      costPerUnit: 150,
      transactionCcy: 'USD',
      stockCcy: 'USD',
      currentPrice: 160,
      costInJPY: 1950000, // 150 * 100 * 130 (USD/JPY)
      currentValueJPY: 2080000, // 160 * 100 * 130
      pnlJPY: 130000,
      pnlPercentage: 6.67,
      transactionFxRate: 130,
      currentFxRate: 130,
    },
    {
      transactionDate: '2023-02-01',
      ticker: '7203.T',
      fullName: 'Toyota Motor Corp',
      broker: 'Japanese Broker',
      account: 'JP Account',
      quantity: 1000,
      costPerUnit: 1700,
      transactionCcy: 'JPY',
      stockCcy: 'JPY',
      currentPrice: 1800,
      costInJPY: 1700000, // 1700 * 1000
      currentValueJPY: 1800000, // 1800 * 1000
      pnlJPY: 100000,
      pnlPercentage: 5.88,
      transactionFxRate: 1,
      currentFxRate: 1,
    },
  ]

  describe('calculatePortfolioSummary', () => {
    it('should calculate total portfolio values correctly', () => {
      const summary = calculatePortfolioSummary(mockPositions)

      expect(summary.totalCostJPY).toBe(3650000) // 1,950,000 + 1,700,000
      expect(summary.totalValueJPY).toBe(3880000) // 2,080,000 + 1,800,000
      expect(summary.totalPnlJPY).toBe(230000) // 130,000 + 100,000
      expect(summary.totalPnlPercentage).toBeCloseTo(6.30, 1) // 230,000 / 3,650,000 * 100
      expect(summary.positions).toHaveLength(2)
    })

    it('should handle empty positions array', () => {
      const summary = calculatePortfolioSummary([])

      expect(summary.totalCostJPY).toBe(0)
      expect(summary.totalValueJPY).toBe(0)
      expect(summary.totalPnlJPY).toBe(0)
      expect(summary.totalPnlPercentage).toBe(0)
      expect(summary.positions).toHaveLength(0)
    })

    it('should handle positions with zero cost', () => {
      const positionsWithZeroCost: Position[] = [
        {
          ...mockPositions[0],
          costInJPY: 0,
          pnlJPY: 2080000, // All current value is profit
        },
      ]

      const summary = calculatePortfolioSummary(positionsWithZeroCost)

      expect(summary.totalCostJPY).toBe(0)
      expect(summary.totalPnlPercentage).toBe(0) // Avoid division by zero
    })

    it('should handle negative P&L correctly', () => {
      const positionsWithLoss: Position[] = [
        {
          ...mockPositions[0],
          currentValueJPY: 1500000, // Less than cost
          pnlJPY: -450000, // Loss
          pnlPercentage: -23.08,
        },
      ]

      const summary = calculatePortfolioSummary(positionsWithLoss)

      expect(summary.totalPnlJPY).toBe(-450000)
      expect(summary.totalPnlPercentage).toBeCloseTo(-23.08, 1)
    })
  })

  describe('Edge Cases', () => {
    it('should handle very large numbers', () => {
      const largePositions: Position[] = [
        {
          ...mockPositions[0],
          costInJPY: 999999999999, // ~1 trillion JPY
          currentValueJPY: 1099999999999, // 10% gain
          pnlJPY: 100000000000, // 100 billion JPY profit
        },
      ]

      const summary = calculatePortfolioSummary(largePositions)

      expect(summary.totalPnlPercentage).toBeCloseTo(10, 1)
    })

    it('should handle decimal precision correctly', () => {
      const precisionPositions: Position[] = [
        {
          ...mockPositions[0],
          costInJPY: 100000.33,
          currentValueJPY: 100000.67,
          pnlJPY: 0.34,
        },
      ]

      const summary = calculatePortfolioSummary(precisionPositions)

      expect(summary.totalPnlJPY).toBeCloseTo(0.34, 2)
    })
  })
})
