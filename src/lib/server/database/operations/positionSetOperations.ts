// Position Set Operations - manages different data sets (demo, user data, scenarios)
import { getDbClient } from '../config';

export interface PositionSet {
    id: number;
    name: string;
    display_name: string;
    description: string | null;
    info_type: string;
    is_active: boolean;
    created_at: string;
    updated_at: string;
}

export interface CreatePositionSetData {
    name: string;
    display_name: string;
    description?: string;
    info_type?: string;
    is_active?: boolean;
}

/**
 * Get all position sets
 */
export async function getAllPositionSets(): Promise<PositionSet[]> {
    const client = getDbClient();
    
    const result = await client.execute(`
        SELECT * FROM position_sets 
        ORDER BY is_active DESC, created_at ASC
    `);
    
    return result.rows.map(row => ({
        id: Number(row.id),
        name: String(row.name),
        display_name: String(row.display_name),
        description: row.description ? String(row.description) : null,
        info_type: String(row.info_type || 'info'),
        is_active: Boolean(row.is_active),
        created_at: String(row.created_at),
        updated_at: String(row.updated_at)
    }));
}

/**
 * Get the currently active position set
 */
export async function getActivePositionSet(): Promise<PositionSet | null> {
    const client = getDbClient();
    
    const result = await client.execute(`
        SELECT * FROM position_sets 
        WHERE is_active = TRUE 
        LIMIT 1
    `);
    
    if (result.rows.length === 0) {
        return null;
    }
    
    const row = result.rows[0];
    return {
        id: Number(row.id),
        name: String(row.name),
        display_name: String(row.display_name),
        description: row.description ? String(row.description) : null,
        info_type: String(row.info_type || 'info'),
        is_active: Boolean(row.is_active),
        created_at: String(row.created_at),
        updated_at: String(row.updated_at)
    };
}

/**
 * Create a new position set
 */
export async function createPositionSet(data: CreatePositionSetData): Promise<number> {
    const client = getDbClient();
    
    // If this is being set as active, deactivate all others first
    if (data.is_active) {
        await client.execute('UPDATE position_sets SET is_active = FALSE');
    }
    
    const result = await client.execute({
        sql: `INSERT INTO position_sets 
              (name, display_name, description, info_type, is_active) 
              VALUES (?, ?, ?, ?, ?)`,
        args: [
            data.name,
            data.display_name,
            data.description || null,
            data.info_type || 'info',
            data.is_active || false
        ]
    });
    
    return Number(result.lastInsertRowid);
}

/**
 * Set a position set as active (deactivates all others)
 */
export async function setActivePositionSet(positionSetId: number): Promise<void> {
    const client = getDbClient();
    
    // First, deactivate all position sets
    await client.execute('UPDATE position_sets SET is_active = FALSE');
    
    // Then activate the specified one
    await client.execute({
        sql: 'UPDATE position_sets SET is_active = TRUE WHERE id = ?',
        args: [positionSetId]
    });
}

/**
 * Check if we're currently using demo data
 */
export async function isUsingDemoData(): Promise<boolean> {
    const activeSet = await getActivePositionSet();
    return activeSet?.info_type === 'warning';
}

/**
 * Get position count for a specific position set
 */
export async function getPositionSetPositionCount(positionSetId: number): Promise<number> {
    const client = getDbClient();
    
    const result = await client.execute({
        sql: 'SELECT COUNT(*) as count FROM positions WHERE position_set_id = ?',
        args: [positionSetId]
    });
    
    return Number(result.rows[0].count);
}

/**
 * Delete a position set and all its positions (with safety check)
 */
export async function deletePositionSet(positionSetId: number): Promise<void> {
    const client = getDbClient();
    
    // Safety check - don't delete if it's the only position set
    const allSets = await getAllPositionSets();
    if (allSets.length <= 1) {
        throw new Error('Cannot delete the only remaining position set');
    }
    
    // If deleting the active set, make another one active
    const positionSet = allSets.find(s => s.id === positionSetId);
    if (positionSet?.is_active) {
        const otherSet = allSets.find(s => s.id !== positionSetId);
        if (otherSet) {
            await setActivePositionSet(otherSet.id);
        }
    }
    
    // Delete positions first (foreign key constraint)
    await client.execute({
        sql: 'DELETE FROM positions WHERE position_set_id = ?',
        args: [positionSetId]
    });
    
    // Then delete the position set
    await client.execute({
        sql: 'DELETE FROM position_sets WHERE id = ?',
        args: [positionSetId]
    });
}
