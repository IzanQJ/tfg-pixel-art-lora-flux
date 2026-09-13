import 'server-only';

import fs from 'fs';
import path from 'path';
import type { ImageEvaluation, PipelineEvaluation } from '@/types/imageEvaluation';

type EvaluationStore = {
  version: 3;
  evaluations: Record<string, ImageEvaluation>;
};

const TOOLKIT_ROOT = path.resolve(process.cwd(), '..');
const STORE_PATH = path.join(TOOLKIT_ROOT, 'outputs', '.image-evaluations.json');

function emptyStore(): EvaluationStore {
  return { version: 3, evaluations: {} };
}

function readStore(): EvaluationStore {
  if (!fs.existsSync(STORE_PATH)) return emptyStore();

  try {
    const parsed = JSON.parse(fs.readFileSync(STORE_PATH, 'utf-8'));
    if (parsed?.version !== 3 || typeof parsed.evaluations !== 'object') return emptyStore();
    return parsed as EvaluationStore;
  } catch {
    return emptyStore();
  }
}

function writeStore(store: EvaluationStore): void {
  fs.mkdirSync(path.dirname(STORE_PATH), { recursive: true });
  const tempPath = `${STORE_PATH}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify(store, null, 2), 'utf-8');
  fs.renameSync(tempPath, STORE_PATH);
}

export function getImageEvaluation(imagePath: string): ImageEvaluation | null {
  return readStore().evaluations[imagePath] ?? null;
}

export function savePipelineEvaluation(
  imagePath: string,
  pipeline: PipelineEvaluation,
): ImageEvaluation {
  const store = readStore();
  const evaluation: ImageEvaluation = {
    path: imagePath,
    pipeline,
    updatedAt: new Date().toISOString(),
  };

  store.evaluations[imagePath] = evaluation;
  writeStore(store);
  return evaluation;
}
