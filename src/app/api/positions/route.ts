import { NextResponse } from 'next/server';

// Positions are stored client-side in localStorage.
// These endpoints are no-ops kept for API compatibility.

export async function GET() {
    return NextResponse.json({ positions: [] });
}

export async function POST() {
    return NextResponse.json({ message: 'Positions managed client-side', count: 0 });
}
