import { getDbClient } from '../database/config';
import { createPositionSet, deletePositionSet, getActivePositionSet, getAllPositionSets, setActivePositionSet, } from '../database/operations/positionSetOperations';
import { upsertPositionsForSet } from './positionsAdminService';
const formatDateForExport = (value) => {
    if (!value) {
        return new Date().toLocaleDateString('en-CA').replace(/-/g, '/');
    }
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
        return value;
    }
    return parsed.toLocaleDateString('en-CA').replace(/-/g, '/');
};
export const getPositionSetsOverview = async () => {
    const [positionSets, activeSet] = await Promise.all([
        getAllPositionSets(),
        getActivePositionSet(),
    ]);
    return {
        positionSets,
        activeSet,
    };
};
export const activatePositionSetById = async (positionSetId) => {
    await setActivePositionSet(positionSetId);
};
export const deletePositionSetById = async (positionSetId) => {
    await deletePositionSet(positionSetId);
};
export const exportPositionSetById = async (positionSetId) => {
    const client = getDbClient();
    const setResult = await client.execute({
        sql: 'SELECT * FROM position_sets WHERE id = ? LIMIT 1',
        args: [positionSetId],
    });
    if (setResult.rows.length === 0) {
        throw new Error('Position set not found');
    }
    const setRow = setResult.rows[0];
    const positionsResult = await client.execute({
        sql: `
      SELECT 
        p.quantity,
        p.average_cost,
        p.position_currency as transactionCcy,
        p.transaction_date,
        p.created_at,
        s.ticker,
        s.name as fullName,
        s.currency as stockCcy,
        a.name as account,
        b.display_name as broker
      FROM positions p
      JOIN securities s ON p.security_id = s.id
      JOIN accounts a ON p.account_id = a.id
      JOIN brokers b ON a.broker_id = b.id
      WHERE p.position_set_id = ?
      ORDER BY p.created_at ASC
    `,
        args: [positionSetId],
    });
    const positions = positionsResult.rows.map(row => {
        var _a, _b, _c, _d, _e, _f, _g, _h;
        return ({
            transactionDate: formatDateForExport((_a = row.transaction_date) !== null && _a !== void 0 ? _a : row.created_at),
            ticker: String(row.ticker),
            fullName: String((_b = row.fullName) !== null && _b !== void 0 ? _b : row.ticker),
            broker: row.broker ? String(row.broker) : undefined,
            account: String((_c = row.account) !== null && _c !== void 0 ? _c : 'General'),
            quantity: Number((_d = row.quantity) !== null && _d !== void 0 ? _d : 0),
            costPerUnit: Number((_e = row.average_cost) !== null && _e !== void 0 ? _e : 0),
            transactionCcy: String((_f = row.transactionCcy) !== null && _f !== void 0 ? _f : 'USD'),
            stockCcy: String((_h = (_g = row.stockCcy) !== null && _g !== void 0 ? _g : row.transactionCcy) !== null && _h !== void 0 ? _h : 'USD'),
        });
    });
    return {
        positionSet: {
            name: String(setRow.name),
            display_name: String(setRow.display_name),
            description: setRow.description ? String(setRow.description) : null,
            created_at: String(setRow.created_at),
        },
        positions,
    };
};
export const importPositionSetData = async (payload) => {
    const { name, description, positions, setAsActive } = payload;
    if (!name || !Array.isArray(positions) || positions.length === 0) {
        throw new Error('Import payload requires a name and at least one position');
    }
    const positionSetId = await createPositionSet({
        name,
        display_name: name,
        description,
        info_type: 'info',
        is_active: Boolean(setAsActive),
    });
    const importedCount = await upsertPositionsForSet(positionSetId, positions, {
        replaceExisting: true,
    });
    if (setAsActive) {
        await setActivePositionSet(positionSetId);
    }
    return {
        positionSetId,
        positionsImported: importedCount,
    };
};
