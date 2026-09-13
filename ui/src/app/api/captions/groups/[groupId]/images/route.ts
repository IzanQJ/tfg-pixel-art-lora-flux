import { NextRequest, NextResponse } from 'next/server';
import { getGroupImages } from '@/server/captions';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ groupId: string }> },
) {
  try {
    const { groupId } = await params;
    const images = await getGroupImages(groupId);
    return NextResponse.json({ images });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
