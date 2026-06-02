/**
 * Unit tests for positions utilities
 */

import type { RawPosition } from '@portfolio/types'
import { loadPositions, rawPositions } from '@/utils/positions'
import { getActivePositions } from '@/utils/localPositions'
import { DEMO_POSITIONS } from '@/data/demoPositions'

// loadPositions reads the active set from local storage (getActivePositions)
// and falls back to the demo portfolio if that read fails.
jest.mock('@/utils/localPositions', () => ({
  getActivePositions: jest.fn(),
}))

const mockGetActivePositions = getActivePositions as jest.MockedFunction<typeof getActivePositions>

describe('Positions Utils', () => {
  beforeEach(() => {
    mockGetActivePositions.mockReset()
  })

  describe('loadPositions', () => {
    it('should return the active positions from local storage', async () => {
      const active: RawPosition[] = [
        {
          ticker: 'AAPL',
          transactionDate: '2023-01-01',
          quantity: 100,
          costPerUnit: 150.0,
          transactionCcy: 'USD',
          fullName: 'Apple Inc.',
          stockCcy: 'USD',
          account: 'Test Account',
          broker: 'Test Broker',
        },
        {
          ticker: '7203.T',
          transactionDate: '2023-01-01',
          quantity: 1000,
          costPerUnit: 1700,
          transactionCcy: 'JPY',
          fullName: 'Toyota Motor Corp',
          stockCcy: 'JPY',
          account: 'JP Account',
          broker: 'JP Broker',
        },
      ]
      mockGetActivePositions.mockReturnValue(active)

      const result = await loadPositions()

      expect(mockGetActivePositions).toHaveBeenCalled()
      expect(result).toEqual(active)
      expect(result).toHaveLength(2)
    })

    it('should return an empty array when local storage has no active set', async () => {
      mockGetActivePositions.mockReturnValue([])

      const result = await loadPositions()

      expect(result).toEqual([])
      expect(result).toHaveLength(0)
    })

    it('should fall back to the demo portfolio when the local read fails', async () => {
      mockGetActivePositions.mockImplementation(() => {
        throw new Error('local storage unavailable')
      })

      const result = await loadPositions()

      expect(result).toEqual(DEMO_POSITIONS)
    })
  })

  describe('rawPositions', () => {
    it('should export an empty array by default', () => {
      expect(rawPositions).toEqual([])
      expect(Array.isArray(rawPositions)).toBe(true)
      expect(rawPositions).toHaveLength(0)
    })
  })
})
