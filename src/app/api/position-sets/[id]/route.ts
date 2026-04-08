import { NextResponse } from 'next/server';

export async function DELETE() {
    return NextResponse.json({ message: 'Position sets managed client-side' });
}
