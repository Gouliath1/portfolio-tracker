import { checkHistoricalDataStatus, autoRefreshHistoricalDataIfNeeded } from '../../apps/web/src/utils/historicalDataChecker';

// Mock fetch globally
const mockFetch = jest.fn();
global.fetch = mockFetch;

// Mock console methods to prevent test output clutter
const originalConsoleLog = console.log;
const originalConsoleError = console.error;

beforeAll(() => {
    console.log = jest.fn();
    console.error = jest.fn();
});

afterAll(() => {
    console.log = originalConsoleLog;
    console.error = originalConsoleError;
});

beforeEach(() => {
    mockFetch.mockClear();
    (console.log as jest.Mock).mockClear();
    (console.error as jest.Mock).mockClear();
});

describe('historicalDataChecker', () => {
    describe('checkHistoricalDataStatus', () => {
        it('should return status when API call is successful', async () => {
            const expectedStatus = {
                needsRefresh: true,
                missingDays: 2,
                lastDataDate: '2025-09-07',
                reason: 'Missing 2 days (0 unexpected)'
            };

            mockFetch.mockResolvedValue({
                ok: true,
                json: () => Promise.resolve(expectedStatus)
            });

            const result = await checkHistoricalDataStatus();

            expect(mockFetch).toHaveBeenCalledWith('/api/historical-data/status');
            expect(result).toEqual(expectedStatus);
        });

        it('should return error status when API call fails', async () => {
            mockFetch.mockResolvedValue({
                ok: false,
                status: 500
            });

            const result = await checkHistoricalDataStatus();

            expect(mockFetch).toHaveBeenCalledWith('/api/historical-data/status');
            expect(result).toEqual({
                needsRefresh: true,
                missingDays: 0,
                lastDataDate: null,
                reason: 'Error checking data status'
            });
            expect(console.error).toHaveBeenCalled();
        });

        it('should return error status when fetch throws an exception', async () => {
            mockFetch.mockRejectedValue(new Error('Network error'));

            const result = await checkHistoricalDataStatus();

            expect(mockFetch).toHaveBeenCalledWith('/api/historical-data/status');
            expect(result).toEqual({
                needsRefresh: true,
                missingDays: 0,
                lastDataDate: null,
                reason: 'Error checking data status'
            });
            expect(console.error).toHaveBeenCalled();
        });
    });

    describe('autoRefreshHistoricalDataIfNeeded', () => {
        it('should not refresh when data is current', async () => {
            const statusResponse = {
                needsRefresh: false,
                missingDays: 0,
                lastDataDate: '2025-09-09',
                reason: 'Data is up to date (last: 2025-09-09)'
            };

            mockFetch
                .mockResolvedValueOnce({
                    ok: true,
                    json: () => Promise.resolve(statusResponse)
                });

            const result = await autoRefreshHistoricalDataIfNeeded();

            expect(mockFetch).toHaveBeenCalledTimes(1);
            expect(mockFetch).toHaveBeenCalledWith('/api/historical-data/status');
            expect(result).toBe(false);
            expect(console.log).toHaveBeenCalledWith('🔍 Historical data status: Data is up to date (last: 2025-09-09)');
            expect(console.log).toHaveBeenCalledWith('✅ Historical data is current');
        });

        it('should refresh when data is outdated', async () => {
            const statusResponse = {
                needsRefresh: true,
                missingDays: 3,
                lastDataDate: '2025-09-06',
                reason: 'Missing 3 days (1 unexpected)'
            };

            const refreshResponse = {
                message: 'Historical data refresh completed',
                historicalResults: { 'AAPL': { '2025-09-09': 150.00 } },
                positionsProcessed: 1
            };

            mockFetch
                .mockResolvedValueOnce({
                    ok: true,
                    json: () => Promise.resolve(statusResponse)
                })
                .mockResolvedValueOnce({
                    ok: true,
                    json: () => Promise.resolve(refreshResponse)
                });

            const result = await autoRefreshHistoricalDataIfNeeded();

            expect(mockFetch).toHaveBeenCalledTimes(2);
            expect(mockFetch).toHaveBeenNthCalledWith(1, '/api/historical-data/status');
            expect(mockFetch).toHaveBeenNthCalledWith(2, '/api/historical-data', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
            });
            expect(result).toBe(true);
            expect(console.log).toHaveBeenCalledWith('🔍 Historical data status: Missing 3 days (1 unexpected)');
            expect(console.log).toHaveBeenCalledWith('🔄 Auto-refreshing historical data (missing 3 days)');
            expect(console.log).toHaveBeenCalledWith('✅ Auto-refresh completed:', refreshResponse);
        });

        it('should handle refresh API failure gracefully', async () => {
            const statusResponse = {
                needsRefresh: true,
                missingDays: 2,
                lastDataDate: '2025-09-07',
                reason: 'Missing 2 days (0 unexpected)'
            };

            mockFetch
                .mockResolvedValueOnce({
                    ok: true,
                    json: () => Promise.resolve(statusResponse)
                })
                .mockResolvedValueOnce({
                    ok: false,
                    status: 500
                });

            const result = await autoRefreshHistoricalDataIfNeeded();

            expect(mockFetch).toHaveBeenCalledTimes(2);
            expect(result).toBe(false);
            expect(console.log).toHaveBeenCalledWith('🔍 Historical data status: Missing 2 days (0 unexpected)');
            expect(console.log).toHaveBeenCalledWith('🔄 Auto-refreshing historical data (missing 2 days)');
            expect(console.error).toHaveBeenCalledWith('❌ Auto-refresh failed:', expect.any(Error));
        });

        it('should handle network errors during refresh', async () => {
            const statusResponse = {
                needsRefresh: true,
                missingDays: 1,
                lastDataDate: '2025-09-08',
                reason: 'Missing 1 days (1 unexpected)'
            };

            mockFetch
                .mockResolvedValueOnce({
                    ok: true,
                    json: () => Promise.resolve(statusResponse)
                })
                .mockRejectedValueOnce(new Error('Network timeout'));

            const result = await autoRefreshHistoricalDataIfNeeded();

            expect(mockFetch).toHaveBeenCalledTimes(2);
            expect(result).toBe(false);
            expect(console.error).toHaveBeenCalledWith('❌ Auto-refresh failed:', expect.any(Error));
        });

        it('should handle status check failure and still attempt refresh', async () => {
            const errorStatus = {
                needsRefresh: true,
                missingDays: 0,
                lastDataDate: null,
                reason: 'Error checking data status'
            };

            const refreshResponse = {
                message: 'Historical data refresh completed',
                historicalResults: {},
                positionsProcessed: 0
            };

            // Mock checkHistoricalDataStatus to return error, but then auto-refresh should still try
            mockFetch
                .mockRejectedValueOnce(new Error('Status API down'))
                .mockResolvedValueOnce({
                    ok: true,
                    json: () => Promise.resolve(refreshResponse)
                });

            const result = await autoRefreshHistoricalDataIfNeeded();

            expect(mockFetch).toHaveBeenCalledTimes(2);
            expect(result).toBe(true);
            expect(console.log).toHaveBeenCalledWith('🔍 Historical data status: Error checking data status');
            expect(console.log).toHaveBeenCalledWith('🔄 Auto-refreshing historical data (missing 0 days)');
        });
    });
});
