import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { BASE_GENERATION_OUTPUT_ID, getTrainingByOutputId } from '@/utils/trainingCatalog';

const TOOLKIT_ROOT = path.resolve(process.cwd(), '..');
const OUTPUTS_DIR = path.join(TOOLKIT_ROOT, 'outputs');
const JOB_OUTPUT_DIR = path.join(TOOLKIT_ROOT, 'output');

function validateOutputId(outputId: unknown): string {
  if (typeof outputId !== 'string') {
    throw new Error('La carpeta indicada no es valida');
  }

  const cleanOutputId = outputId.trim();
  if (
    !cleanOutputId ||
    cleanOutputId === '.' ||
    cleanOutputId === '..' ||
    cleanOutputId.includes('/') ||
    cleanOutputId.includes('\\')
  ) {
    throw new Error('La carpeta indicada no es valida');
  }

  return cleanOutputId;
}

function resolveSafeOutputPath(root: string, outputId: string): string {
  const rootPath = path.resolve(root);
  const targetPath = path.resolve(rootPath, outputId);

  if (!targetPath.startsWith(`${rootPath}${path.sep}`)) {
    throw new Error('La ruta de salida no es segura');
  }

  return targetPath;
}

export async function GET() {
  try {
    if (!fs.existsSync(OUTPUTS_DIR)) {
      return NextResponse.json({ iterations: [] });
    }

    const entries = fs.readdirSync(OUTPUTS_DIR, { withFileTypes: true });
    const iterationNames = new Set(entries
      .filter(e => e.isDirectory())
      .map(e => e.name));
    iterationNames.add(BASE_GENERATION_OUTPUT_ID);

    const iterations = [...iterationNames].sort();

    return NextResponse.json({ iterations });
  } catch (err: any) {
    return NextResponse.json({ iterations: [], error: err.message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const outputId = validateOutputId(body.outputId);

    if (outputId === BASE_GENERATION_OUTPUT_ID || getTrainingByOutputId(outputId)) {
      return NextResponse.json(
        { error: 'Esta carpeta esta protegida y no se puede eliminar desde aqui' },
        { status: 400 }
      );
    }

    const deleted: string[] = [];
    for (const root of [OUTPUTS_DIR, JOB_OUTPUT_DIR]) {
      const targetPath = resolveSafeOutputPath(root, outputId);
      if (!fs.existsSync(targetPath)) continue;

      const stat = fs.statSync(targetPath);
      if (!stat.isDirectory()) {
        return NextResponse.json({ error: 'La ruta indicada no es una carpeta' }, { status: 400 });
      }

      await fs.promises.rm(targetPath, { recursive: true, force: true });
      deleted.push(path.relative(TOOLKIT_ROOT, targetPath));
    }

    return NextResponse.json({ ok: true, deleted });
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? 'No se pudo eliminar la carpeta' }, { status: 500 });
  }
}
