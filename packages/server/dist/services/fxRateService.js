// Avoid static imports of Node.js modules to keep React Native compatible
import { getFxRate, migrateFxRatesFromJson, storeFxRate } from '../database/operations/fxRateOperations';
import { getDataPath } from '@portfolio/utils';
let cachedFs;
const loadFs = () => {
    var _a;
    if (cachedFs !== undefined) {
        return cachedFs;
    }
    if (typeof process === 'undefined' || !((_a = process.versions) === null || _a === void 0 ? void 0 : _a.node)) {
        cachedFs = null;
        return cachedFs;
    }
    try {
        const req = Function('return require')();
        cachedFs = req('fs/promises');
        return cachedFs;
    }
    catch (_b) {
        cachedFs = null;
        return cachedFs;
    }
};
// Lazy evaluation to avoid calling getDataPath at module load time (React Native compatibility)
const getFxRatesFilePath = () => getDataPath('fxRates.json');
const readFxRatesFile = async () => {
    const fs = loadFs();
    if (!fs) {
        // In React Native environment, no file system access - return null to skip file fallback
        return null;
    }
    try {
        const data = await fs.readFile(getFxRatesFilePath(), 'utf-8');
        return JSON.parse(data);
    }
    catch (error) {
        if (error.code === 'ENOENT') {
            return null;
        }
        throw error;
    }
};
export const getFxRateWithFallback = async (pair, options = {}) => {
    const trimmedPair = pair.trim().toUpperCase();
    if (trimmedPair.length !== 6) {
        throw new Error('FX pair must be 6 characters (e.g., USDJPY)');
    }
    const initialResult = await getFxRate(trimmedPair, options.date);
    if (initialResult && initialResult.rate !== null) {
        return {
            pair: trimmedPair,
            rate: initialResult.rate,
            date: initialResult.date,
            requestedDate: initialResult.requestedDate,
            source: 'database',
        };
    }
    const fileData = await readFxRatesFile();
    if (fileData && fileData[trimmedPair]) {
        await migrateFxRatesFromJson({ [trimmedPair]: fileData[trimmedPair] });
        const cachedResult = await getFxRate(trimmedPair, options.date);
        if (cachedResult && cachedResult.rate !== null) {
            return {
                pair: trimmedPair,
                rate: cachedResult.rate,
                date: cachedResult.date,
                requestedDate: cachedResult.requestedDate,
                source: 'file',
            };
        }
    }
    return {
        pair: trimmedPair,
        rate: null,
        date: null,
        requestedDate: options.date,
        source: 'none',
    };
};
export const updateFxRate = async (pair, rate, date) => {
    const trimmedPair = pair.trim().toUpperCase();
    if (trimmedPair.length !== 6) {
        throw new Error('FX pair must be 6 characters (e.g., USDJPY)');
    }
    if (!Number.isFinite(rate)) {
        throw new Error('Rate must be a finite number');
    }
    await storeFxRate(trimmedPair, rate, date);
};
