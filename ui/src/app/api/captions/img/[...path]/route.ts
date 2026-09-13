import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { resolveGroupImagePath, resolveManualAcceptedImagePath, CAPTION_GROUPS_ROOT, MANUAL_ACCEPTED_DIR } from '@/server/captions';

const ALLOWED_EXTS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif']);

const MIME: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
};

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const segments = (await params).path;

  if (!segments || segments.length < 2) {
    return new NextResponse('Not found', { status: 404 });
  }

  const [first, ...rest] = segments;
  const filename = decodeURIComponent(rest[rest.length - 1]);

  // Validate extension
  const ext = path.extname(filename).toLowerCase();
  if (!ALLOWED_EXTS.has(ext)) {
    return new NextResponse('File type not allowed', { status: 403 });
  }

  // Prevent path traversal
  if (filename.includes('/') || filename.includes('\\') || filename.includes('..')) {
    return new NextResponse('Access denied', { status: 403 });
  }

  let filePath: string | null = null;

  if (first === 'manual_accepted') {
    // /api/captions/img/manual_accepted/<filename>
    filePath = resolveManualAcceptedImagePath(filename);
    if (filePath) {
      const resolved = path.resolve(filePath);
      const allowed = path.resolve(MANUAL_ACCEPTED_DIR);
      if (!resolved.startsWith(allowed + path.sep) && resolved !== allowed) {
        return new NextResponse('Access denied', { status: 403 });
      }
    }
  } else {
    // /api/captions/img/<groupId>/<filename>
    const groupId = decodeURIComponent(first);
    // Validate groupId — no path traversal
    if (groupId.includes('/') || groupId.includes('\\') || groupId.includes('..')) {
      return new NextResponse('Access denied', { status: 403 });
    }
    filePath = resolveGroupImagePath(groupId, filename);
    if (filePath) {
      const resolved = path.resolve(filePath);
      const allowed = path.resolve(CAPTION_GROUPS_ROOT);
      if (!resolved.startsWith(allowed + path.sep)) {
        return new NextResponse('Access denied', { status: 403 });
      }
    }
  }

  if (!filePath || !fs.existsSync(filePath)) {
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
