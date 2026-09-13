import { NextRequest, NextResponse } from 'next/server';
import { deleteFromManualAccepted } from '@/server/scraper';

export async function DELETE(request: NextRequest) {
  let body: { filenames?: unknown; folder?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const filenames = body.filenames;
  if (
    !Array.isArray(filenames) ||
    filenames.length === 0 ||
    filenames.some(f => typeof f !== 'string')
  ) {
    return NextResponse.json(
      { error: 'Body must contain a non-empty "filenames" string array' },
      { status: 400 },
    );
  }

  try {
    const result = await deleteFromManualAccepted(
      filenames as string[],
      typeof body.folder === 'string' ? body.folder : undefined,
    );
    return NextResponse.json({ ok: true, ...result });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
