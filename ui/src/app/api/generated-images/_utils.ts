import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';

export const TOOLKIT_ROOT = path.resolve(process.cwd(), '..');
export const OUTPUTS_DIR = path.resolve(TOOLKIT_ROOT, 'outputs');
export const ALLOWED_IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.webp']);

export type PythonCommand = {
  command: string;
  args: string[];
};

let cachedPython: PythonCommand | null = null;

function canRunPython(candidate: PythonCommand): boolean {
  if (path.isAbsolute(candidate.command) && !fs.existsSync(candidate.command)) return false;

  const result = spawnSync(
    candidate.command,
    [...candidate.args, '--version'],
    { encoding: 'utf-8', windowsHide: true, timeout: 5000 },
  );

  return !result.error && result.status === 0;
}

export function getPythonCommand(): PythonCommand {
  if (cachedPython) return cachedPython;

  const homeDir = process.env.USERPROFILE || process.env.HOME || '';
  const candidates: PythonCommand[] = [
    process.env.PYTHON ? { command: process.env.PYTHON, args: [] } : null,
    { command: path.join(TOOLKIT_ROOT, 'venv', 'Scripts', 'python.exe'), args: [] },
    homeDir
      ? {
          command: path.join(
            homeDir,
            '.cache',
            'codex-runtimes',
            'codex-primary-runtime',
            'dependencies',
            'python',
            'python.exe',
          ),
          args: [],
        }
      : null,
    { command: 'py', args: ['-3'] },
    { command: 'python', args: [] },
  ].filter((candidate): candidate is PythonCommand => Boolean(candidate?.command));

  const runnable = candidates.find(canRunPython);
  if (!runnable) {
    throw new Error('No se encontro un interprete de Python utilizable para ejecutar los scripts');
  }

  cachedPython = runnable;
  return runnable;
}

export function resolveOutputImage(relativePath: unknown): { filePath: string; relativePath: string } {
  if (typeof relativePath !== 'string' || relativePath.trim().length === 0) {
    throw new Error('Ruta de imagen invalida');
  }

  const normalized = relativePath.replace(/\\/g, '/');
  const segments = normalized.split('/').filter(Boolean).map(decodeURIComponent);
  if (segments.length === 0 || segments.some(segment => segment === '..' || segment.includes('\\'))) {
    throw new Error('Ruta de imagen invalida');
  }
  if (segments.some(segment => segment.toLowerCase() === 'samples')) {
    throw new Error('Solo se pueden procesar imagenes generadas, no samples de entrenamiento');
  }

  const filePath = path.resolve(OUTPUTS_DIR, ...segments);
  if (!filePath.startsWith(OUTPUTS_DIR + path.sep)) {
    throw new Error('Acceso denegado');
  }

  const ext = path.extname(filePath).toLowerCase();
  if (!ALLOWED_IMAGE_EXTS.has(ext)) {
    throw new Error('Tipo de imagen no permitido');
  }
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    throw new Error('Imagen no encontrada');
  }

  return {
    filePath,
    relativePath: path.relative(OUTPUTS_DIR, filePath).replace(/\\/g, '/'),
  };
}

export function outputUrlFor(filePath: string): string {
  const relative = path.relative(OUTPUTS_DIR, filePath).replace(/\\/g, '/');
  return `/api/outputs/${relative.split('/').map(encodeURIComponent).join('/')}`;
}
