import { setupDatabase } from './schema';
import { initializeDemoPositions } from './operations/demoDataManagement';
import { promises as fs } from 'fs';
import path from 'path';

const POSITIONS_JSON_PATH = path.join(process.cwd(), 'data/positions.json');

let isInitialized = false;

export async function initializeDatabaseOnStartup(): Promise<void> {
    if (isInitialized) {
        return;
    }
    
    try {
        console.log('🚀 Initializing database on server startup...');
        await setupDatabase();
        
        // Only load template positions if actual positions.json doesn't exist
        try {
            await fs.access(POSITIONS_JSON_PATH);
            console.log('📋 positions.json exists, will be loaded on-demand by API');
        } catch {
            // positions.json doesn't exist, load template data
            console.log('📋 No positions.json found, loading template positions...');
            await initializeDemoPositions();
        }
        
        console.log('✅ Database initialized successfully');
        isInitialized = true;
    } catch (error) {
        console.error('❌ Failed to initialize database on startup:', error);
        throw error;
    }
}
