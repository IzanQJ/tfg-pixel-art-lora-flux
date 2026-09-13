import { NextRequest, NextResponse } from 'next/server';
import { execFile } from 'child_process';
import path from 'path';
import fs from 'fs';
import { VALID_GENERATION_MODEL_IDS } from '@/utils/trainingCatalog';

const TOOLKIT_ROOT = path.resolve(process.cwd(), '..');
const OUTPUTS_DIR = path.join(TOOLKIT_ROOT, 'outputs');
const STATIC_MODEL_IDS = new Set(VALID_GENERATION_MODEL_IDS);
const GENERATION_TIMEOUT_MS = 30 * 60 * 1000;

function getVenvPython(): string {
  const venvPy = path.join(TOOLKIT_ROOT, 'venv', 'Scripts', 'python.exe');
  if (fs.existsSync(venvPy)) return venvPy;
  return 'python';
}

let generating = false;

function isSafeModelId(modelId: unknown): modelId is string {
  return (
    typeof modelId === 'string' &&
    modelId.trim().length > 0 &&
    modelId === modelId.trim() &&
    modelId !== '.' &&
    modelId !== '..' &&
    !modelId.includes('/') &&
    !modelId.includes('\\')
  );
}

function hasDynamicLoRA(modelId: string): boolean {
  const outputsRoot = path.resolve(OUTPUTS_DIR);
  const modelRoot = path.resolve(outputsRoot, modelId);

  if (!modelRoot.startsWith(`${outputsRoot}${path.sep}`) || !fs.existsSync(modelRoot)) {
    return false;
  }

  const stack = [modelRoot];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) continue;

    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
      } else if (
        entry.isFile() &&
        entry.name.endsWith('.safetensors') &&
        !/_\d{9}\.safetensors$/.test(entry.name)
      ) {
        return true;
      }
    }
  }

  return false;
}

function parseScriptJson(stdout: string): { status?: string; error?: string; saved?: boolean; path?: string | null; seed?: number } | null {
  const lines = stdout.trim().split('\n');
  const jsonLine = [...lines].reverse().find(line => line.trim().startsWith('{')) ?? '';
  if (!jsonLine) return null;

  try {
    return JSON.parse(jsonLine.trim());
  } catch {
    return null;
  }
}

function formatScriptError(error: any, stdout: string, stderr: string): string {
  const parsed = parseScriptJson(stdout);
  if (parsed?.error) return parsed.error;

  const timedOut =
    error?.killed ||
    error?.signal === 'SIGTERM' ||
    String(error?.message ?? '').toLowerCase().includes('timed out');

  if (timedOut) {
    return `La generacion ha tardado mas de ${Math.round(GENERATION_TIMEOUT_MS / 60000)} minutos y se ha cancelado. En CPU FLUX puede tardar bastante; prueba de nuevo o reduce los pasos si ejecutas el script manualmente.`;
  }

  const relevantLines = stderr
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
    .filter(line => !line.startsWith('WARNING:') && !line.startsWith('W0'))
    .filter(line => !line.includes('Loading pipeline components'))
    .filter(line => !line.includes('Loading checkpoint shards'))
    .filter(line => !line.includes('it/s'))
    .filter(line => !line.startsWith('Cargando FLUX.1-dev'))
    .filter(line => !line.startsWith('Generando (seed='))
    .slice(-8);

  return relevantLines.join('\n') || 'El proceso de generacion se ha detenido antes de terminar. Si vuelve a pasar, probablemente sea por memoria o por carga lenta de FLUX en CPU.';
}

export async function POST(request: NextRequest) {
  if (generating) {
    return NextResponse.json({ success: false, error: 'Ya hay una generacion en curso. Espera a que termine.' }, { status: 429 });
  }

  try {
    const body = await request.json();
    const { prompt, model, seed } = body as { prompt?: string; model?: string; seed?: number };

    if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
      return NextResponse.json({ success: false, error: 'Prompt vacio' }, { status: 400 });
    }
    if (prompt.length > 500) {
      return NextResponse.json({ success: false, error: 'Prompt demasiado largo (max 500 chars)' }, { status: 400 });
    }
    if (!isSafeModelId(model) || (!STATIC_MODEL_IDS.has(model) && !hasDynamicLoRA(model))) {
      return NextResponse.json({ success: false, error: 'Modelo invalido o LoRA no encontrado' }, { status: 400 });
    }

    const sanitizedPrompt = prompt.trim().replace(/[\x00-\x1f]/g, '');
    const pythonExe = getVenvPython();
    const scriptPath = path.join(TOOLKIT_ROOT, 'scripts', 'tfg', 'generate_api.py');

    if (!fs.existsSync(scriptPath)) {
      return NextResponse.json({ success: false, error: 'Script generate_api.py no encontrado' }, { status: 500 });
    }

    const args: string[] = [scriptPath, '--prompt', sanitizedPrompt, '--model', model];
    if (seed !== undefined && seed !== null) {
      args.push('--seed', String(Math.floor(Number(seed))));
    }

    generating = true;

    const result = await new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
      execFile(
        pythonExe,
        args,
        {
          cwd: TOOLKIT_ROOT,
          timeout: GENERATION_TIMEOUT_MS,
          maxBuffer: 10 * 1024 * 1024,
          env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1' },
        },
        (error, stdout, stderr) => {
          if (error) {
            reject(new Error(formatScriptError(error, stdout || '', stderr || '')));
          } else {
            resolve({ stdout: stdout || '', stderr: stderr || '' });
          }
        }
      );
    });

    generating = false;

    const parsed = parseScriptJson(result.stdout);
    if (!parsed) {
      return NextResponse.json({ success: false, error: `No se pudo parsear la salida del script. stdout: ${result.stdout.slice(-300)}` }, { status: 500 });
    }

    if (parsed.status !== 'ok') {
      return NextResponse.json({ success: false, error: (parsed as any).error || 'Error desconocido' }, { status: 500 });
    }

    let imageUrl: string | null = null;
    if (parsed.saved && parsed.path) {
      const relativePath = parsed.path.replace(/\\/g, '/');
      const outputsPrefix = 'outputs/';
      const idx = relativePath.indexOf(outputsPrefix);
      if (idx >= 0) {
        const subPath = relativePath.substring(idx + outputsPrefix.length);
        imageUrl = `/api/outputs/${subPath}`;
      }
    }

    return NextResponse.json({
      success: true,
      imageUrl,
      saved: parsed.saved,
      seed: parsed.seed,
      model,
    });
  } catch (err: any) {
    generating = false;
    return NextResponse.json({ success: false, error: err.message || 'Error interno' }, { status: 500 });
  }
}
