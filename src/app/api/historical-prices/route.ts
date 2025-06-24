import { NextResponse } from 'next/server';

export async function GET() {
    // Placeholder for historical prices API endpoint
    // This will be implemented when we add historical price functionality
    return NextResponse.json({ 
        message: 'Historical prices endpoint - not yet implemented' 
    }, { status: 501 });
}