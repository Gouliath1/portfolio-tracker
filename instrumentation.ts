export async function register() {
    if (process.env.NEXT_RUNTIME === 'nodejs') { // Only run in Node.js runtime
        const { initializeDatabaseOnStartup } = await import('@portfolio/server');
        await initializeDatabaseOnStartup();
    }
}
