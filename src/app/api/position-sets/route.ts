import { NextResponse } from 'next/server';

// Position sets are managed client-side in localStorage.
export async function GET() {
    return NextResponse.json({ position_sets: [], active_set: null });
}
