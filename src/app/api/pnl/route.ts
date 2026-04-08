import { NextResponse } from 'next/server';

// P&L is calculated client-side. This endpoint is kept for API compatibility.
export async function GET() {
    return NextResponse.json({ success: true, positions: [], count: 0 });
}
