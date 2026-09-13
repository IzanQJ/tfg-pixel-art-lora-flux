import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const TOOLKIT_ROOT = path.resolve(process.cwd(), '..');
const OUTPUTS_DIR = path.join(TOOLKIT_ROOT, 'outputs');
const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.webp']);

function collectImages(dir: string, basePath: string): { filename: string; relativePath: string; mtime: number }[] {
  const results: { filename: string; relativePath: string; mtime: number }[] = [];
  if (!fs.existsSync(dir)) return results;

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const relPath = path.join(basePath, entry.name);

    // Excluir siempre samples/
    if (entry.isDirectory()) {
      const directoryName = entry.name.toLowerCase();
      if (directoryName === 'samples' || directoryName === '_pixelated') continue;
      results.push(...collectImages(fullPath, relPath));
    } else if (entry.isFile() && IMAGE_EXTS.has(path.extname(entry.name).toLowerCase())) {
      const stat = fs.statSync(fullPath);
      results.push({
        filename: entry.name,
        relativePath: relPath.replace(/\\/g, '/'),
        mtime: stat.mtimeMs,
      });
    }
  }
  return results;
}

export async function GET(request: NextRequest) {
  try {
    const iter = request.nextUrl.searchParams.get('iter');
    if (!iter || iter.includes('/') || iter.includes('\\') || iter.includes('..')) {
      return NextResponse.json({ error: 'Parámetro iter inválido' }, { status: 400 });
    }

    const iterDir = path.join(OUTPUTS_DIR, iter);
    const resolved = path.resolve(iterDir);

    // Seguridad: path traversal
    if (!resolved.startsWith(path.resolve(OUTPUTS_DIR))) {
      return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 });
    }

    if (!fs.existsSync(iterDir)) {
      return NextResponse.json({ images: [] });
    }

    const images = collectImages(iterDir, '');
    // Ordenar más recientes primero
    images.sort((a, b) => b.mtime - a.mtime);

    const result = images.map(img => ({
      filename: img.filename,
      path: `${iter}/${img.relativePath}`,
      url: `/api/outputs/${iter}/${img.relativePath}`,
      createdAt: new Date(img.mtime).toISOString(),
    }));

    return NextResponse.json({ iter, images: result });
  } catch (err: any) {
    return NextResponse.json({ images: [], error: err.message }, { status: 500 });
  }
}
