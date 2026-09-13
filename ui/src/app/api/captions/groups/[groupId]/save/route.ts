import { NextRequest, NextResponse } from 'next/server';
import { saveCaptions, CaptionRow } from '@/server/captions';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ groupId: string }> },
) {
  try {
    const { groupId } = await params;
    const body = await request.json();
    const { captions } = body as { captions: CaptionRow[] };
    if (!Array.isArray(captions)) {
      return NextResponse.json({ error: 'captions array is required' }, { status: 400 });
    }
    await saveCaptions(groupId, captions);
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
