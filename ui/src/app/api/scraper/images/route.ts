import { NextRequest, NextResponse } from 'next/server';
import { getImagesForView, ScraperView, SortOrder } from '@/server/scraper';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const view  = (searchParams.get('view')  ?? 'accepted') as ScraperView;
  const sort  = (searchParams.get('sort')  ?? 'asc')      as SortOrder;
  const folder = searchParams.get('folder') ?? undefined;

  const validViews: ScraperView[] = ['accepted', 'rejected', 'manual_accepted'];
  if (!validViews.includes(view)) {
    return NextResponse.json({ error: 'Invalid view' }, { status: 400 });
  }

  try {
    const images = await getImagesForView(view, sort, folder);
    return NextResponse.json({ images, total: images.length });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
