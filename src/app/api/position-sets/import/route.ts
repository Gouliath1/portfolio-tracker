import { NextResponse } from 'next/server';

export async function POST() {
    return NextResponse.json({ message: 'Position sets managed client-side', positions_imported: 0 });
}
