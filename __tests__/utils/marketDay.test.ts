import { marketDay, isPriceStale } from '../../src/utils/marketDay';

describe('marketDay', () => {
    it('uses the New York date', () => {
        expect(marketDay('2026-10-13T02:00:00Z')).toBe('2026-10-12'); // Monday evening in NY
    });
    it('rolls weekends back to Friday', () => {
        expect(marketDay('2026-10-10T15:00:00Z')).toBe('2026-10-09');
        expect(marketDay('2026-10-11T15:00:00Z')).toBe('2026-10-09');
    });
});

describe('isPriceStale', () => {
    const monday = new Date('2026-10-12T18:00:00Z');
    it('is current for the whole market day it was fetched on', () => {
        expect(isPriceStale('2026-10-12T13:31:00Z', monday)).toBe(false);
    });
    it('is stale the next market day', () => {
        expect(isPriceStale('2026-10-09T20:00:00Z', monday)).toBe(true);
    });
    it('a Friday price is still current on Saturday and Sunday', () => {
        expect(isPriceStale('2026-10-09T20:00:00Z', new Date('2026-10-10T12:00:00Z'))).toBe(false);
        expect(isPriceStale('2026-10-09T20:00:00Z', new Date('2026-10-11T12:00:00Z'))).toBe(false);
    });
    it('missing timestamp counts as stale', () => {
        expect(isPriceStale(null, monday)).toBe(true);
    });
});
