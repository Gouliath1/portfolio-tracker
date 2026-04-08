import { NextResponse } from 'next/server';

export async function GET() {
    return NextResponse.json({ message: 'Export is handled client-side' }, { status: 410 });
}
