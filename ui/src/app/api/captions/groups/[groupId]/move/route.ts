import { NextRequest, NextResponse } from 'next/server';
import { moveToDataset } from '@/server/captions';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ groupId: string }> },
) {
  try {
    const { groupId } = await params;
    const body = await request.json();
    const { datasetName, triggerWord = 'pixelart' } = body as {
      datasetName: string;
      triggerWord?: string;
    };
    if (!datasetName) {
      return NextResponse.json({ error: 'datasetName is required' }, { status: 400 });
    }
    await moveToDataset(groupId, datasetName, triggerWord);
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
