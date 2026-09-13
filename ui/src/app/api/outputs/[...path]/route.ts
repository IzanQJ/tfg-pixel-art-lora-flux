import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const TOOLKIT_ROOT = path.resolve(process.cwd(), '..');
const OUTPUTS_DIR = path.resolve(TOOLKIT_ROOT, 'outputs');
const ALLOWED_EXTS = new Set(['.png', '.jpg', '.jpeg', '.webp']);

export async function GET(request: NextRequest, { params }: { params: { path: string[] } }) {
  try {
    const segments = (await params).path;
    if (!segments || segments.length === 0) {
      return new NextResponse('Not found', { status: 404 });
    }

    // Rechazar cualquier segmento "samples"
    if (segments.some(s => s.toLowerCase() === 'samples')) {
      return new NextResponse('Access denied', { status: 403 });
    }

    // Decodificar segmentos
    const decoded = segments.map(s => decodeURIComponent(s));

    // Construir ruta absoluta y verificar que esté dentro de outputs/
    const filePath = path.resolve(OUTPUTS_DIR, ...decoded);
    if (!filePath.startsWith(OUTPUTS_DIR + path.sep) && filePath !== OUTPUTS_DIR) {
      return new NextResponse('Access denied', { status: 403 });
    }

    // Verificar extensión
    const ext = path.extname(filePath).toLowerCase();
    if (!ALLOWED_EXTS.has(ext)) {
      return new NextResponse('File type not allowed', { status: 403 });
    }

    if (!fs.existsSync(filePath)) {
      return new NextResponse('File not found', { status: 404 });
    }

    const stat = fs.statSync(filePath);
    if (!stat.isFile()) {
      return new NextResponse('Not a file', { status: 400 });
    }

    const contentTypes: Record<string, string> = {
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.webp': 'image/webp',
    };

    const buffer = fs.readFileSync(filePath);
    return new NextResponse(buffer, {
      headers: {
        'Content-Type': contentTypes[ext] || 'application/octet-stream',
        'Content-Length': String(stat.size),
        'Cache-Control': 'public, max-age=86400',
      },
    });
  } catch (err) {
    console.error('Error serving output file:', err);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}
