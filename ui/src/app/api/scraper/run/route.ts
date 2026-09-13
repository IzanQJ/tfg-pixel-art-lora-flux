import { NextRequest, NextResponse } from 'next/server';
import { DEFAULT_SCRAPER_FOLDER_ID, getScraperRunStatus, startScraperRun } from '@/server/scraper';

export async function GET(request: NextRequest) {
  try {
    const folderId = request.nextUrl.searchParams.get('folder') ?? DEFAULT_SCRAPER_FOLDER_ID;
    const status = await getScraperRunStatus(folderId);
    return NextResponse.json(status);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const run = await startScraperRun({
      label: typeof body.label === 'string' ? body.label : undefined,
      topics: Array.isArray(body.topics) ? body.topics : [],
      itemsPerTopic: Number(body.itemsPerTopic ?? 20),
      maxItems: 0,
      minLikes: 10,
      overwrite: Boolean(body.overwrite),
      noCache: Boolean(body.noCache),
    });
    return NextResponse.json({ run }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}
