import { NextRequest, NextResponse } from 'next/server';
import { listManualAcceptedImages } from '@/server/captions';

export async function GET(_request: NextRequest) {
  try {
    const folder = _request.nextUrl.searchParams.get('folder') ?? undefined;
    const images = await listManualAcceptedImages(folder);
    return NextResponse.json({ images });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
