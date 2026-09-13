import { NextRequest, NextResponse } from 'next/server';
import { startGeneration } from '@/server/captions';

const DEFAULT_MODEL = process.env.QWEN_CAPTION_MODEL ?? 'Qwen/Qwen2.5-VL-7B-Instruct';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ groupId: string }> },
) {
  try {
    const { groupId } = await params;
    const body = await request.json();
    const {
      triggerWord = 'pixelart',
      detailLevel = 'medium',
      overwriteMode = 'empty_only',
    } = body as {
      triggerWord?: string;
      detailLevel?: 'short' | 'medium' | 'detailed';
      overwriteMode?: 'empty_only' | 'overwrite_all';
    };

    await startGeneration(groupId, {
      triggerWord,
      detailLevel,
      modelName: DEFAULT_MODEL,
      overwriteMode,
    });

    return NextResponse.json({ ok: true, model: DEFAULT_MODEL });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
