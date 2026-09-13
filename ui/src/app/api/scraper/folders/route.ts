import { NextResponse } from 'next/server';
import { NextRequest } from 'next/server';
import { deleteScraperFolder, listScraperFolders } from '@/server/scraper';

export async function GET() {
  try {
    const folders = await listScraperFolders();
    return NextResponse.json({ folders });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  let body: { folderId?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (typeof body.folderId !== 'string' || body.folderId.trim().length === 0) {
    return NextResponse.json({ error: 'Body must contain a "folderId" string' }, { status: 400 });
  }

  try {
    const result = await deleteScraperFolder(body.folderId);
    return NextResponse.json({ ok: true, ...result });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 400 });
  }
}
