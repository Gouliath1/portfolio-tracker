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
export declare function getAllPositionSets(): Promise<PositionSet[]>;
/**
 * Get the currently active position set
 */
export declare function getActivePositionSet(): Promise<PositionSet | null>;
/**
 * Create a new position set
 */
export declare function createPositionSet(data: CreatePositionSetData): Promise<number>;
/**
 * Set a position set as active (deactivates all others)
 */
export declare function setActivePositionSet(positionSetId: number): Promise<void>;
/**
 * Check if we're currently using demo data
 */
export declare function isUsingDemoData(): Promise<boolean>;
/**
 * Get position count for a specific position set
 */
export declare function getPositionSetPositionCount(positionSetId: number): Promise<number>;
/**
 * Delete a position set and all its positions (with safety check)
 */
export declare function deletePositionSet(positionSetId: number): Promise<void>;
