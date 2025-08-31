/**
 * Unit tests for positions utilities
 */

import { loadPositions, rawPositions } from '@/utils/positions'

// Mock global fetch
const mockFetch = global.fetch as jest.MockedFunction<typeof fetch>

describe('Positions Utils', () => {
  beforeEach(() => {
    mockFetch.mockClear()
  })

  describe('loadPositions', () => {
    it('should load positions successfully from API', async () => {
      const mockPositions = [
        {
          id: 'pos-1',
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
          id: 'pos-2',
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

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ positions: mockPositions })
      } as Response)

      const result = await loadPositions()

      expect(mockFetch).toHaveBeenCalledWith('/api/positions')
      expect(result).toEqual(mockPositions)
      expect(result).toHaveLength(2)
      expect(result[0]).toMatchObject({
        id: 'pos-1',
        ticker: 'AAPL',
        quantity: 100,
        costPerUnit: 150.0
      })
    })

    it('should handle API errors gracefully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error'
      } as Response)

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {})

      const result = await loadPositions()

      expect(result).toEqual([])
      expect(consoleSpy).toHaveBeenCalledWith('Error loading positions:', expect.any(Error))
      
      consoleSpy.mockRestore()
    })

    it('should handle network errors gracefully', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'))

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {})

      const result = await loadPositions()

      expect(result).toEqual([])
      expect(consoleSpy).toHaveBeenCalledWith('Error loading positions:', expect.any(Error))
      
      consoleSpy.mockRestore()
    })

    it('should handle malformed JSON gracefully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => { throw new Error('Invalid JSON') }
      } as unknown as Response)

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {})

      const result = await loadPositions()

      expect(result).toEqual([])
      expect(consoleSpy).toHaveBeenCalledWith('Error loading positions:', expect.any(Error))
      
      consoleSpy.mockRestore()
    })

    it('should handle empty response correctly', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ positions: [] })
      } as Response)

      const result = await loadPositions()

      expect(result).toEqual([])
      expect(result).toHaveLength(0)
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
