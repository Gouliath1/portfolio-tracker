import { NextResponse } from 'next/server';
import { getDbClient } from '@portfolio/server';

export async function GET(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const positionSetId = parseInt(id);
        
        if (isNaN(positionSetId)) {
            return NextResponse.json({
                error: 'Invalid position set ID'
            }, { status: 400 });
        }
        
        const client = getDbClient();
        
        // Get position set info
        const setResult = await client.execute({
            sql: 'SELECT * FROM position_sets WHERE id = ?',
            args: [positionSetId]
        });
        
        if (setResult.rows.length === 0) {
            return NextResponse.json({
                error: 'Position set not found'
            }, { status: 404 });
        }
        
        const positionSet = setResult.rows[0];
        
        // Get positions with full details
        const positionsResult = await client.execute({
            sql: `
                SELECT 
                    p.quantity,
                    p.average_cost,
                    p.position_currency as transactionCcy,
                    s.ticker,
                    s.name as fullName,
                    s.currency as stockCcy,
                    a.name as account,
                    b.name as broker,
                    p.transaction_date,
                    p.created_at
                FROM positions p
                JOIN securities s ON p.security_id = s.id
                JOIN accounts a ON p.account_id = a.id
                JOIN brokers b ON a.broker_id = b.id
                WHERE p.position_set_id = ?
                ORDER BY p.created_at ASC
            `,
            args: [positionSetId]
        });
        
        console.log(`📤 Found ${positionsResult.rows.length} positions for position set ${positionSetId}`);
        
        const positions = positionsResult.rows.map(row => {
            // Use transaction_date if available, otherwise fall back to created_at
            const transactionDate = row.transaction_date 
                ? String(row.transaction_date)
                : String(row.created_at);
                
            // Convert to YYYY/MM/DD format (matching the original format)
            const formattedDate = new Date(transactionDate).toLocaleDateString('en-CA').replace(/-/g, '/');
                
            return {
                transactionDate: formattedDate,
                ticker: String(row.ticker),
                fullName: String(row.fullName),
                broker: String(row.broker),
                account: String(row.account),
                quantity: Number(row.quantity),
                costPerUnit: Number(row.average_cost),
                transactionCcy: String(row.transactionCcy),
                stockCcy: String(row.stockCcy || row.transactionCcy) // Fallback to transactionCcy if stockCcy is null
            };
        });
        
        const exportData = {
            position_set: {
                name: String(positionSet.name),
                display_name: String(positionSet.display_name),
                description: positionSet.description ? String(positionSet.description) : null,
                created_at: String(positionSet.created_at)
            },
            positions
        };
        
        // Set headers for file download
        const headers = new Headers();
        headers.set('Content-Type', 'application/json');
        headers.set('Content-Disposition', `attachment; filename="${positionSet.name}-positions.json"`);
        
        return new NextResponse(JSON.stringify(exportData, null, 2), {
            status: 200,
            headers
        });
        
    } catch (error) {
        console.error('❌ Error exporting position set:', error);
        return NextResponse.json({
            error: 'Failed to export position set',
            details: error instanceof Error ? error.message : 'Unknown error'
        }, { status: 500 });
    }
}
