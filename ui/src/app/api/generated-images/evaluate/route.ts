import { NextRequest, NextResponse } from 'next/server';
import { execFile } from 'child_process';
import fs from 'fs';
import path from 'path';
import { getImageEvaluation, savePipelineEvaluation } from '@/server/imageEvaluations';
import {
  type EvaluationSection,
  type EvaluationStatus,
  type PipelineCriterion,
  type PipelineEvaluation,
  type PipelineMetrics,
} from '@/types/imageEvaluation';
import { getPythonCommand, resolveOutputImage, TOOLKIT_ROOT } from '../_utils';

function clamp(value: number, min = 0, max = 10): number {
  return Math.max(min, Math.min(max, value));
}

function roundScore(value: number): number {
  return Math.round(clamp(value) * 10) / 10;
}

function normalizedScore(value: number, low: number, high: number): number {
  return roundScore(((value - low) / (high - low)) * 10);
}

function inverseNormalizedScore(value: number, low: number, high: number): number {
  return roundScore((1 - ((value - low) / (high - low))) * 10);
}

function scoreStatus(score: number): EvaluationStatus {
  if (score >= 7.5) return 'good';
  if (score >= 5) return 'warn';
  return 'bad';
}

function colorCountAdjustment(colors: number): number {
  if (colors <= 128) return 0.5;
  if (colors <= 512) return 0.2;
  if (colors <= 1024) return 0;
  if (colors <= 2048) return -0.3;
  return -0.7;
}

function criterion(
  id: string,
  label: string,
  score: number,
  value: string,
  measures: string,
  goodDescription: string,
  warnDescription: string,
  badDescription: string,
): PipelineCriterion {
  const normalized = roundScore(score);
  const status = scoreStatus(normalized);
  const description = status === 'good'
    ? goodDescription
    : status === 'warn'
      ? warnDescription
      : badDescription;

  return { id, label, score: normalized, status, value, measures, description };
}

function sectionLabel(
  score: number,
  labels: [string, string, string, string],
): string {
  if (score >= 8.5) return labels[0];
  if (score >= 7) return labels[1];
  if (score >= 5) return labels[2];
  return labels[3];
}

function buildPixelStructure(metrics: PipelineMetrics): EvaluationSection {
  const grid = normalizedScore(metrics.pixel_grid, 0.02, 0.4);
  const hardEdges = normalizedScore(metrics.edge_hardness, 0.05, 0.5);
  const stableAreas = normalizedScore(metrics.flatness, 0.55, 0.92);
  const stairSteps = roundScore(grid * 0.55 + hardEdges * 0.3 + stableAreas * 0.15);
  const score = roundScore(grid * 0.45 + stairSteps * 0.35 + hardEdges * 0.2);

  const gridValue = grid >= 4
    ? `Píxel base estimado: ${metrics.pixel_size}×${metrics.pixel_size} px`
    : 'No se detecta un tamaño base fiable';

  return {
    score,
    label: sectionLabel(score, [
      'Estructura de píxel muy consistente',
      'Buena estructura de píxel',
      'Estructura parcialmente consistente',
      'Estructura de píxel irregular',
    ]),
    summary: score >= 7
      ? 'La imagen mantiene una cuadrícula y escalones propios del pixel art.'
      : 'El tamaño aparente del píxel cambia o los contornos pierden la cuadrícula.',
    criteria: [
      criterion(
        'pixelGrid',
        'Tamaño y cuadrícula',
        grid,
        gridValue,
        'Busca un bloque base repetido y comprueba que los cambios de color coincidan con esa cuadrícula.',
        'Los píxeles aparentes comparten un tamaño base y están bien alineados.',
        'Se aprecia cierta cuadrícula, pero no se mantiene en toda la imagen.',
        'Los bloques cambian de tamaño o no siguen una cuadrícula común.',
      ),
      criterion(
        'stairSteps',
        'Curvas escalonadas',
        stairSteps,
        `${Math.round(metrics.pixel_grid * 100)}% de alineación con la cuadrícula`,
        'Comprueba si curvas y diagonales están formadas por escalones regulares, combinando cuadrícula, bordes y zonas estables.',
        'Las curvas se construyen con escalones limpios y regulares.',
        'Hay escalones reconocibles, aunque algunas zonas se suavizan o deforman.',
        'Las curvas se ven suaves, fragmentadas o formadas por bloques irregulares.',
      ),
      criterion(
        'hardEdges',
        'Bordes sin suavizado',
        hardEdges,
        `${Math.round(metrics.edge_hardness * 100)}% de transiciones fuertes`,
        'Mide únicamente si los cambios de color son bruscos. No determina el tamaño ni la forma del píxel.',
        'Los cambios de color son nítidos y tienen poco antialias.',
        'Conviven bordes nítidos con transiciones suavizadas.',
        'Predominan el suavizado, el antialias o las transiciones graduales.',
      ),
    ],
  };
}

function buildVisualReadability(metrics: PipelineMetrics): EvaluationSection {
  const silhouette = normalizedScore(metrics.subject_coherence, 0.25, 0.95);
  const lowClutter = inverseNormalizedScore(metrics.local_variation, 0.12, 0.42);
  const score = roundScore(silhouette * 0.7 + lowClutter * 0.3);

  return {
    score,
    label: sectionLabel(score, [
      'Figura inmediatamente legible',
      'Figura clara',
      'Figura reconocible con esfuerzo',
      'Figura difícil de interpretar',
    ]),
    summary: score >= 7
      ? 'La forma principal está unida, destaca del fondo y se lee con rapidez.'
      : 'La forma principal se fragmenta o compite con demasiados cambios visuales.',
    criteria: [
      criterion(
        'silhouette',
        'Coherencia de la figura',
        silhouette,
        `${Math.round(metrics.subject_coherence * 100)}% del primer plano conectado`,
        'Separa aproximadamente fondo y primer plano, y mide si la mayor parte pertenece a una única forma conectada.',
        'La figura principal forma una silueta continua y fácil de seguir.',
        'La figura se entiende, pero algunas partes quedan separadas o mezcladas.',
        'El primer plano aparece fragmentado y cuesta localizar una forma principal.',
      ),
      criterion(
        'visualClutter',
        'Ruido que dificulta la lectura',
        lowClutter,
        `${Math.round(metrics.local_variation * 100)}% de cambios locales de color`,
        'Mide cuántos píxeles cambian respecto a sus vecinos. Muchos cambios repartidos generan textura y ruido visual.',
        'Hay poco ruido compitiendo con la forma principal.',
        'Existe bastante detalle local, aunque la figura todavía se puede seguir.',
        'Los cambios de color están muy dispersos y dificultan entender la figura.',
      ),
    ],
  };
}

function buildPipelineEvaluation(metrics: PipelineMetrics | null): PipelineEvaluation | null {
  if (!metrics) return null;

  const paletteBase = normalizedScore(metrics.palette_score_16, 17, 32);
  const paletteScore = roundScore(paletteBase + colorCountAdjustment(metrics.unique_colors));
  const palette = criterion(
    'palette',
    'Paleta compacta',
    paletteScore,
    `${Math.round(paletteBase * 10)}% de fidelidad con 16 colores`,
    'Indica cuánto detalle conserva la imagen al reducirla a 16 colores. Es informativa y no modifica las otras dos notas.',
    'La imagen conserva bien su información con pocos colores.',
    'La reducción funciona, aunque se pierden algunas variaciones.',
    'La imagen pierde bastante información al reducir la paleta.',
  );

  return {
    scoringVersion: 3,
    pixelStructure: buildPixelStructure(metrics),
    visualReadability: buildVisualReadability(metrics),
    palette,
    metrics,
    evaluatedAt: new Date().toISOString(),
  };
}

export async function GET(request: NextRequest) {
  try {
    const { relativePath } = resolveOutputImage(request.nextUrl.searchParams.get('path'));
    return NextResponse.json({
      success: true,
      evaluation: getImageEvaluation(relativePath),
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'No se pudo cargar la evaluación' },
      { status: 400 },
    );
  }
}

export async function POST(request: NextRequest) {
  let tempOutput = '';
  try {
    const body = await request.json();
    const { filePath, relativePath } = resolveOutputImage(body.path);
    const scriptPath = path.join(TOOLKIT_ROOT, 'scripts', 'tfg', 'evaluate_style.py');
    if (!fs.existsSync(scriptPath)) {
      return NextResponse.json(
        { success: false, error: 'Script evaluate_style.py no encontrado' },
        { status: 500 },
      );
    }

    const tempDir = path.join(TOOLKIT_ROOT, 'tmp', 'ui-evaluations');
    fs.mkdirSync(tempDir, { recursive: true });
    tempOutput = path.join(tempDir, `evaluation-${Date.now()}.json`);

    const python = getPythonCommand();
    await new Promise<void>((resolve, reject) => {
      execFile(
        python.command,
        [...python.args, scriptPath, '--images', filePath, '--labels', 'imagen', '--output', tempOutput, '--detail'],
        {
          cwd: TOOLKIT_ROOT,
          timeout: 2 * 60 * 1000,
          maxBuffer: 10 * 1024 * 1024,
          env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1' },
        },
        (error, _stdout, stderr) => {
          if (error) reject(new Error(stderr || error.message));
          else resolve();
        },
      );
    });

    const parsed = JSON.parse(fs.readFileSync(tempOutput, 'utf-8'));
    const metrics = (parsed?.imagen?.per_image?.[0] ?? null) as PipelineMetrics | null;
    const pipeline = buildPipelineEvaluation(metrics);
    if (!pipeline) throw new Error('El script no devolvió métricas para esta imagen');

    const evaluation = savePipelineEvaluation(relativePath, pipeline);
    return NextResponse.json({ success: true, evaluation });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Error evaluando imagen' },
      { status: 500 },
    );
  } finally {
    if (tempOutput && fs.existsSync(tempOutput)) {
      try {
        fs.unlinkSync(tempOutput);
      } catch {
        // El temporal se limpiará en una ejecución posterior.
      }
    }
  }
}
