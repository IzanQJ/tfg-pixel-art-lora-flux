import { NextRequest, NextResponse } from 'next/server';
import { getProgress, finalizeGeneration, getGroup } from '@/server/captions';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ groupId: string }> },
) {
  try {
    const { groupId } = await params;
    const progress = await getProgress(groupId);

    // Auto-finalize when script reports done
    if (progress.status === 'done') {
      const group = await getGroup(groupId);
      if (group && group.status === 'generating') {
        await finalizeGeneration(groupId);
      }
    }

    return NextResponse.json({ progress });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
