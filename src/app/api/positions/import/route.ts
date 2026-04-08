import { NextResponse } from 'next/server';

export async function POST() {
    return NextResponse.json({ message: 'Positions managed client-side', count: 0 });
}

export async function GET() {
    return NextResponse.json({ exists: false });
}
