import { NextResponse } from 'next/server';

// Demo status is determined client-side via localStorage.
export async function GET() {
    return NextResponse.json({ isDemoData: false, isDemo: false, positionSet: null });
}
