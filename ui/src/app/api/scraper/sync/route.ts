import { NextResponse } from 'next/server';
import { syncManualAccepted } from '@/server/scraper';

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const result = await syncManualAccepted(typeof body.folder === 'string' ? body.folder : undefined);
    return NextResponse.json({ ok: true, ...result });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
