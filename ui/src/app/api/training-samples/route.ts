import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { parse as parseYaml } from 'yaml';

const TOOLKIT_ROOT = path.resolve(process.cwd(), '..');
const OUTPUTS_DIR = path.resolve(TOOLKIT_ROOT, 'outputs');
const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.webp']);

interface SampleImage {
  url: string;
  step: number;
  filename: string;
}

interface PromptGroup {
  index: number;
  text: string;
  images: SampleImage[];
}

interface TrainingData {
  trainingName: string;
  iter: string;
  prompts: PromptGroup[];
}

function parsePrompts(configYamlPath: string): string[] {
  try {
    const raw = fs.readFileSync(configYamlPath, 'utf-8');
    const config = parseYaml(raw);
    const processes = config?.config?.process;
    if (!Array.isArray(processes) || processes.length === 0) return [];
    const samplePrompts = processes[0]?.sample?.prompts;
    if (!Array.isArray(samplePrompts)) return [];
    return samplePrompts.map((p: unknown) => String(p));
  } catch {
    return [];
  }
}

// Filename format: {timestamp}__{step9digits}_{promptIdx}.ext
function parseSampleFilename(filename: string): { step: number; promptIdx: number } | null {
  const ext = path.extname(filename).toLowerCase();
  if (!IMAGE_EXTS.has(ext)) return null;
  const base = path.basename(filename, ext);
  const sepIdx = base.indexOf('__');
  if (sepIdx === -1) return null;
  const rest = base.slice(sepIdx + 2); // e.g. "000000100_0"
  const lastUnderscore = rest.lastIndexOf('_');
  if (lastUnderscore === -1) return null;
  const step = parseInt(rest.slice(0, lastUnderscore), 10);
  const promptIdx = parseInt(rest.slice(lastUnderscore + 1), 10);
  if (isNaN(step) || isNaN(promptIdx)) return null;
  return { step, promptIdx };
}

export async function GET(request: NextRequest) {
  try {
    const iter = request.nextUrl.searchParams.get('iter');
    if (!iter || iter.includes('/') || iter.includes('\\') || iter.includes('..')) {
      return NextResponse.json({ error: 'Parámetro iter inválido' }, { status: 400 });
    }

    const iterDir = path.resolve(OUTPUTS_DIR, iter);
    if (!iterDir.startsWith(OUTPUTS_DIR + path.sep)) {
      return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 });
    }
    if (!fs.existsSync(iterDir)) {
      return NextResponse.json({ error: 'Iteración no encontrada' }, { status: 404 });
    }

    // Find the training subdirectory (e.g. pixel_art_lora_v1)
    const subEntries = fs.readdirSync(iterDir, { withFileTypes: true });
    const trainingDir = subEntries.find(
      e => e.isDirectory() && fs.existsSync(path.join(iterDir, e.name, 'samples')),
    );
    if (!trainingDir) {
      return NextResponse.json({ trainingName: iter, iter, prompts: [] });
    }

    const trainingName = trainingDir.name;
    const trainingPath = path.join(iterDir, trainingName);
    const samplesDir = path.join(trainingPath, 'samples');
    const configPath = path.join(trainingPath, 'config.yaml');

    const prompts = parsePrompts(configPath);

    // Read all sample images
    const sampleFiles = fs.existsSync(samplesDir) ? fs.readdirSync(samplesDir) : [];

    // Group images by prompt index
    const groups = new Map<number, SampleImage[]>();
    for (const filename of sampleFiles) {
      const parsed = parseSampleFilename(filename);
      if (!parsed) continue;
      const { step, promptIdx } = parsed;
      const url = `/api/sample-img/${iter}/${trainingName}/samples/${encodeURIComponent(filename)}`;
      if (!groups.has(promptIdx)) groups.set(promptIdx, []);
      groups.get(promptIdx)!.push({ url, step, filename });
    }

    // Sort images within each group by step
    for (const imgs of groups.values()) {
      imgs.sort((a, b) => a.step - b.step);
    }

    // Build ordered prompt groups
    const allIndices = Array.from(groups.keys()).sort((a, b) => a - b);
    const promptGroups: PromptGroup[] = allIndices.map(idx => ({
      index: idx,
      text: prompts[idx] ?? `Prompt ${idx + 1}`,
      images: groups.get(idx) ?? [],
    }));

    const result: TrainingData = { trainingName, iter, prompts: promptGroups };
    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
