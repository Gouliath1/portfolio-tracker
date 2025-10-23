import { setupDatabase } from './schema';
import { initializeDemoPositions } from './operations/demoDataManagement';
import { getDbClient } from './config';
let isInitialized = false;
export async function initializeDatabaseOnStartup() {
    if (isInitialized) {
        return;
    }
    try {
        console.log('🚀 Initializing database on server startup...');
        // Setup database schema
        await setupDatabase();
        // Only load demo positions if this is a fresh database (no positions exist)
        const db = getDbClient();
        const existingPositions = await db.execute('SELECT COUNT(*) as count FROM positions');
        const positionCount = existingPositions.rows[0].count;
        if (positionCount === 0) {
            console.log('📋 Fresh database detected, loading demo positions...');
            await initializeDemoPositions();
        }
        else {
            console.log(`📋 Database has ${positionCount} existing positions, skipping demo data`);
        }
        console.log('✅ Database initialized successfully');
        isInitialized = true;
    }
    catch (error) {
        console.error('❌ Failed to initialize database on startup:', error);
        throw error;
    }
}
