import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { DEFAULT_SCRAPER_FOLDER_ID, resolveScraperImagePath } from '@/server/scraper';
import type { ScraperView } from '@/server/scraper';

const ALLOWED_EXTS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif']);

const MIME: Record<string, string> = {
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif':  'image/gif',
};

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const segments = (await params).path;

  if (!segments || segments.length < 2) {
    return new NextResponse('Not found', { status: 404 });
  }

  const decoded = segments.map(s => decodeURIComponent(s));
  const validViews: ScraperView[] = ['accepted', 'rejected', 'manual_accepted'];
  let folderId = DEFAULT_SCRAPER_FOLDER_ID;
  let view: ScraperView;
  let filename: string;

  if (validViews.includes(decoded[0] as ScraperView)) {
    [view] = decoded as [ScraperView, ...string[]];
    filename = decoded.slice(1).join('/');
  } else if (decoded.length >= 3 && validViews.includes(decoded[1] as ScraperView)) {
    folderId = decoded[0];
    view = decoded[1] as ScraperView;
    filename = decoded.slice(2).join('/');
  } else {
    return new NextResponse('Invalid view', { status: 400 });
  }


  // Validate extension
  const ext = path.extname(filename).toLowerCase();
  if (!ALLOWED_EXTS.has(ext)) {
    return new NextResponse('File type not allowed', { status: 403 });
  }

  // Validate filename — no path traversal
  if (filename.includes('/') || filename.includes('\\') || filename.includes('..')) {
    return new NextResponse('Access denied', { status: 403 });
  }

  const resolved = resolveScraperImagePath(folderId, view, filename);
  if (!resolved) {
    return new NextResponse('Access denied', { status: 403 });
  }

  const { filePath } = resolved;
  if (!fs.existsSync(filePath)) {
    return new NextResponse('File not found', { status: 404 });
  }

  const buffer = fs.readFileSync(filePath);
  return new NextResponse(buffer, {
    status: 200,
    headers: {
      'Content-Type': MIME[ext] ?? 'image/png',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
