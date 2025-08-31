/**
 * Test utilities for portfolio tracker testing
 */

import { render, RenderOptions } from '@testing-library/react'
import { ReactElement } from 'react'

// Custom render function that includes common providers
const customRender = (
  ui: ReactElement,
  options?: Omit<RenderOptions, 'wrapper'>
) => {
  // You can add providers here if needed (e.g., Context providers, Redux store, etc.)
  return render(ui, options)
}

// Re-export everything from testing-library
export * from '@testing-library/react'
export { customRender as render }

/**
 * Helper to wait for async operations in tests
 */
export const waitForAsyncOperation = () => new Promise(resolve => setTimeout(resolve, 0))

/**
 * Helper to mock console methods and restore them
 */
export const mockConsole = () => {
  const originalConsole = { ...console }
  
  beforeEach(() => {
    jest.spyOn(console, 'log').mockImplementation(() => {})
    jest.spyOn(console, 'warn').mockImplementation(() => {})
    jest.spyOn(console, 'error').mockImplementation(() => {})
  })
  
  afterEach(() => {
    Object.assign(console, originalConsole)
  })
}

/**
 * Helper to create mock functions with TypeScript support
 */
export const createMockFunction = <T extends (...args: any[]) => any>(): jest.MockedFunction<T> => {
  return jest.fn() as jest.MockedFunction<T>
}

/**
 * Helper to test async functions that might throw
 */
export const expectAsyncToThrow = async (asyncFn: () => Promise<any>, expectedError?: string | RegExp) => {
  await expect(asyncFn()).rejects.toThrow(expectedError)
}

/**
 * Helper to mock fetch with specific responses
 */
export const mockFetchOnce = (response: any, status = 200) => {
  const mockFetch = global.fetch as jest.MockedFunction<typeof fetch>
  mockFetch.mockResolvedValueOnce({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(response),
    text: () => Promise.resolve(JSON.stringify(response)),
  } as Response)
}

/**
 * Helper to mock fetch for multiple calls
 */
export const mockFetchSequence = (responses: Array<{ data: any; status?: number }>) => {
  const mockFetch = global.fetch as jest.MockedFunction<typeof fetch>
  
  responses.forEach(({ data, status = 200 }) => {
    mockFetch.mockResolvedValueOnce({
      ok: status >= 200 && status < 300,
      status,
      json: () => Promise.resolve(data),
      text: () => Promise.resolve(JSON.stringify(data)),
    } as Response)
  })
}

/**
 * Helper to verify fetch was called with correct parameters
 */
export const expectFetchToHaveBeenCalledWith = (url: string, options?: RequestInit) => {
  const mockFetch = global.fetch as jest.MockedFunction<typeof fetch>
  expect(mockFetch).toHaveBeenCalledWith(url, options)
}
