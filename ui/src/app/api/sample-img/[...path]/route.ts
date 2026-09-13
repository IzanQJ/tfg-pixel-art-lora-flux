import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const TOOLKIT_ROOT = path.resolve(process.cwd(), '..');
const OUTPUTS_DIR = path.resolve(TOOLKIT_ROOT, 'outputs');
const ALLOWED_EXTS = new Set(['.png', '.jpg', '.jpeg', '.webp']);

const MIME: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
};

export async function GET(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  try {
    const segments = (await params).path;
    if (!segments || segments.length === 0) {
      return new NextResponse('Not found', { status: 404 });
    }

    const decoded = segments.map(s => decodeURIComponent(s));

    // Must contain a 'samples' segment — this route is specifically for training samples
    if (!decoded.includes('samples')) {
      return new NextResponse('Access denied', { status: 403 });
    }

    const filePath = path.resolve(OUTPUTS_DIR, ...decoded);

    // Path traversal check
    if (!filePath.startsWith(OUTPUTS_DIR + path.sep)) {
      return new NextResponse('Access denied', { status: 403 });
    }

    const ext = path.extname(filePath).toLowerCase();
    if (!ALLOWED_EXTS.has(ext)) {
      return new NextResponse('File type not allowed', { status: 403 });
    }

    if (!fs.existsSync(filePath)) {
      return new NextResponse('File not found', { status: 404 });
    }

    const buffer = fs.readFileSync(filePath);
    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': MIME[ext] ?? 'image/jpeg',
        'Cache-Control': 'public, max-age=86400, immutable',
      },
    });
  } catch (err: any) {
    return new NextResponse('Internal error', { status: 500 });
  }
}
