'use client';

import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  CircleX,
  Info,
  Loader2,
  RefreshCw,
  X,
} from 'lucide-react';
import {
  type EvaluationSection,
  type EvaluationStatus,
  type ImageEvaluation,
  type PipelineCriterion,
} from '@/types/imageEvaluation';

interface ImageEvaluationPanelProps {
  imagePath: string;
  filename: string;
  onClose: () => void;
}

async function responseJson(response: Response) {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(response.ok ? 'La respuesta del servidor no es válida' : text || 'Error interno del servidor');
  }
}

function statusStyles(status: EvaluationStatus) {
  if (status === 'good') {
    return {
      Icon: CheckCircle2,
      icon: 'text-emerald-400',
      score: 'text-emerald-300',
      bar: 'bg-emerald-500',
    };
  }
  if (status === 'warn') {
    return {
      Icon: AlertTriangle,
      icon: 'text-yellow-400',
      score: 'text-yellow-300',
      bar: 'bg-yellow-500',
    };
  }
  return {
    Icon: CircleX,
    icon: 'text-red-400',
    score: 'text-red-300',
    bar: 'bg-red-500',
  };
}

function scoreColor(score: number) {
  if (score >= 7.5) return 'text-emerald-300';
  if (score >= 5) return 'text-yellow-300';
  return 'text-red-300';
}

function Criterion({ item }: { item: PipelineCriterion }) {
  const styles = statusStyles(item.status);
  const Icon = styles.Icon;

  return (
    <div className="py-4">
      <div className="flex items-center gap-2">
        <Icon className={`h-4 w-4 shrink-0 ${styles.icon}`} />
        <p className="min-w-0 flex-1 text-sm font-medium text-gray-200">{item.label}</p>
        <p className={`text-sm font-semibold ${styles.score}`}>{item.score}/10</p>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden bg-gray-800">
        <div className={`h-full ${styles.bar}`} style={{ width: `${item.score * 10}%` }} />
      </div>
      <p className="mt-2 text-xs leading-5 text-gray-400">{item.description}</p>
      <p className="mt-1 text-xs leading-5 text-gray-600">{item.measures}</p>
      <p className="text-xs leading-5 text-gray-600">Resultado: {item.value}</p>
    </div>
  );
}

function ScoreSection({
  title,
  eyebrow,
  section,
}: {
  title: string;
  eyebrow: string;
  section: EvaluationSection;
}) {
  return (
    <section className="border-b border-gray-800 py-5 first:pt-0">
      <p className="text-xs font-medium uppercase text-gray-500">{eyebrow}</p>
      <div className="mt-2 flex items-end justify-between gap-3">
        <div>
          <p className={`text-3xl font-semibold ${scoreColor(section.score)}`}>
            {section.score}/10
          </p>
          <p className="mt-1 text-sm font-medium text-gray-200">{section.label}</p>
        </div>
        <p className="max-w-[220px] text-right text-xs leading-5 text-gray-500">
          {section.summary}
        </p>
      </div>
      <h3 className="mt-5 text-sm font-semibold text-gray-100">{title}</h3>
      <div className="mt-1 divide-y divide-gray-800 border-y border-gray-800">
        {section.criteria.map(item => <Criterion key={item.id} item={item} />)}
      </div>
    </section>
  );
}

export default function ImageEvaluationPanel({
  imagePath,
  filename,
  onClose,
}: ImageEvaluationPanelProps) {
  const [evaluation, setEvaluation] = useState<ImageEvaluation | null>(null);
  const [loading, setLoading] = useState(true);
  const [evaluating, setEvaluating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runPipeline = async () => {
    setEvaluating(true);
    setError(null);
    try {
      const response = await fetch('/api/generated-images/evaluate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: imagePath }),
      });
      const data = await responseJson(response);
      if (!response.ok || !data.success) throw new Error(data.error || 'No se pudo analizar la imagen');
      setEvaluation(data.evaluation);
    } catch (runError: any) {
      setError(runError.message || 'No se pudo analizar la imagen');
    } finally {
      setEvaluating(false);
    }
  };

  useEffect(() => {
    let active = true;

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(`/api/generated-images/evaluate?path=${encodeURIComponent(imagePath)}`);
        const data = await responseJson(response);
        if (!response.ok || !data.success) throw new Error(data.error || 'No se pudo cargar la evaluación');
        if (!active) return;

        const cached = data.evaluation as ImageEvaluation | null;
        setEvaluation(cached);
        if (cached?.pipeline?.scoringVersion !== 3) await runPipeline();
      } catch (loadError: any) {
        if (active) setError(loadError.message || 'No se pudo cargar la evaluación');
      } finally {
        if (active) setLoading(false);
      }
    };

    load();
    return () => {
      active = false;
    };
  }, [imagePath]);

  const pipeline = evaluation?.pipeline;

  return (
    <aside className="flex h-full min-h-0 w-full flex-col overflow-hidden border border-gray-700 bg-gray-900 lg:w-[480px] lg:shrink-0">
      <div className="flex items-start justify-between gap-3 border-b border-gray-800 px-4 py-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4 shrink-0 text-yellow-400" />
            <h2 className="font-semibold text-gray-100">Evaluación de imagen</h2>
          </div>
          <p className="mt-1 truncate text-xs text-gray-500">{filename}</p>
        </div>
        <button
          type="button"
          title="Cerrar evaluación"
          aria-label="Cerrar evaluación"
          onClick={onClose}
          className="shrink-0 p-1 text-gray-500 hover:text-white"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-medium uppercase text-gray-500">Iteración 3 · análisis del pipeline</p>
            <p className="mt-1 text-xs text-gray-400">Estructura del píxel y lectura de la figura por separado.</p>
          </div>
          <button
            type="button"
            title="Repetir análisis"
            aria-label="Repetir análisis"
            onClick={runPipeline}
            disabled={evaluating || loading}
            className="shrink-0 border border-gray-700 bg-gray-800 p-2 text-gray-300 hover:border-gray-600 hover:text-white disabled:opacity-50"
          >
            {evaluating ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          </button>
        </div>

        <div className="mt-4 flex items-start gap-2 border border-gray-700 bg-gray-800/60 px-3 py-2">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-sky-400" />
          <p className="text-xs leading-5 text-gray-400">
            La lectura visual es experimental: mide si existe una figura principal continua y
            cuánto ruido compite con ella. No identifica por sí sola qué objeto representa.
          </p>
        </div>

        {(loading || evaluating) && !pipeline ? (
          <div className="flex items-center gap-3 py-8 text-sm text-gray-400">
            <Loader2 className="h-5 w-5 animate-spin text-yellow-400" />
            Analizando cuadrícula, curvas y figura principal...
          </div>
        ) : pipeline ? (
          <>
            <div className="mt-5">
              <ScoreSection
                eyebrow="Construcción pixel art"
                title="Qué se analiza"
                section={pipeline.pixelStructure}
              />
              <ScoreSection
                eyebrow="Lectura visual experimental"
                title="Qué facilita o dificulta reconocer la figura"
                section={pipeline.visualReadability}
              />
            </div>

            <section className="py-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-medium uppercase text-gray-500">Dato adicional</p>
                  <p className="mt-1 text-sm font-semibold text-gray-100">{pipeline.palette.label}</p>
                </div>
                <p className={`text-lg font-semibold ${scoreColor(pipeline.palette.score)}`}>
                  {pipeline.palette.score}/10
                </p>
              </div>
              <p className="mt-2 text-xs leading-5 text-gray-400">{pipeline.palette.description}</p>
              <p className="mt-1 text-xs leading-5 text-gray-600">{pipeline.palette.measures}</p>
              <p className="text-xs leading-5 text-gray-600">Resultado: {pipeline.palette.value}</p>
            </section>
          </>
        ) : null}

        {error && (
          <div className="mt-4 flex items-start gap-2 border border-red-900 bg-red-950/30 px-3 py-2 text-xs text-red-300">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <p>{error}</p>
          </div>
        )}
      </div>
    </aside>
  );
}
