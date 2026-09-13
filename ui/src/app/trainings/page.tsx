'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Loader2, FolderOpen, Trash2 } from 'lucide-react';
import {
  BASE_GENERATION_OUTPUT_ID,
  formatTrainingFullLabel,
  formatTrainingTitle,
  getTrainingByOutputId,
  sortTrainingOutputIds,
} from '@/utils/trainingCatalog';

export default function TrainingsPage() {
  const [iterations, setIterations] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingOutputId, setDeletingOutputId] = useState<string | null>(null);

  const loadIterations = useCallback((showLoading = false) => {
    if (showLoading) setLoading(true);

    fetch('/api/iterations')
      .then(r => r.json())
      .then(data => setIterations(data.iterations ?? []))
      .catch(() => setIterations([]))
      .finally(() => {
        if (showLoading) setLoading(false);
      });
  }, []);

  useEffect(() => {
    loadIterations(true);
  }, [loadIterations]);

  const handleDeleteTrainingOutput = async (outputId: string) => {
    const confirmed = window.confirm(
      `Vas a eliminar la carpeta "${outputId}" de outputs/ y sus datos locales del job si existen. Esta accion no se puede deshacer. Continuar?`
    );
    if (!confirmed) return;

    setDeletingOutputId(outputId);
    try {
      const response = await fetch('/api/iterations', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ outputId }),
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.error ?? 'No se pudo eliminar la carpeta');
      }

      setIterations(current => current.filter(iteration => iteration !== outputId));
      window.dispatchEvent(new Event('pipeline:iterations-changed'));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'No se pudo eliminar la carpeta';
      window.alert(message);
    } finally {
      setDeletingOutputId(null);
    }
  };

  const sortedTrainings = sortTrainingOutputIds(iterations);
  const groupedTrainings = [1, 2, 3].map(iteration => ({
    iteration,
    trainings: sortedTrainings.filter(outputId => getTrainingByOutputId(outputId)?.iteration === iteration),
  }));
  const uncataloguedTrainings = sortedTrainings.filter(outputId => !getTrainingByOutputId(outputId));

  return (
    <div className="flex flex-col h-full">
      <div className="border-b border-gray-800 px-6 py-4">
        <h1 className="text-xl font-semibold text-gray-100">Entrenamientos</h1>
        <p className="text-sm text-gray-400 mt-1">Muestras generadas durante cada entrenamiento, agrupadas por iteracion</p>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-6">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="w-8 h-8 animate-spin text-gray-500" />
          </div>
        ) : iterations.length === 0 ? (
          <div className="flex items-center justify-center h-full text-gray-500">
            <p>No se encontraron entrenamientos en outputs/</p>
          </div>
        ) : (
          <div className="space-y-8">
            {groupedTrainings.map(group => (
              group.trainings.length > 0 && (
                <section key={group.iteration}>
                  <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500 mb-3">
                    Iteracion {group.iteration}
                  </h2>
                  <div className="flex flex-nowrap gap-4 overflow-x-auto pb-3">
                    {group.trainings.map(outputId => {
                      const training = getTrainingByOutputId(outputId);
                      return (
                        <Link
                          key={outputId}
                          href={`/trainings/${outputId}`}
                          className="flex w-72 flex-none items-center gap-4 px-5 py-4 bg-gray-800 border border-gray-700 rounded-xl hover:border-yellow-600/60 hover:bg-gray-750 transition-colors group"
                        >
                          <FolderOpen className="w-8 h-8 text-yellow-500 group-hover:text-yellow-400 flex-shrink-0" />
                          <div className="min-w-0">
                            <p className="text-gray-100 font-medium truncate">{formatTrainingTitle(outputId)}</p>
                            <p className="text-xs text-gray-400 mt-0.5 truncate">
                              {training?.platform} · {training?.status}
                            </p>
                            <p className="text-xs text-gray-500 mt-0.5 truncate">{training?.loraName ?? outputId}</p>
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                </section>
              )
            ))}

            {uncataloguedTrainings.length > 0 && (
              <section>
                <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500 mb-3">
                  Otros entrenamientos
                </h2>
                <div className="flex flex-nowrap gap-4 overflow-x-auto pb-3">
                  {uncataloguedTrainings.map(outputId => {
                    const canDelete = outputId !== BASE_GENERATION_OUTPUT_ID;
                    const isDeleting = deletingOutputId === outputId;

                    return (
                      <div
                        key={outputId}
                        className="flex w-72 flex-none items-center bg-gray-800 border border-gray-700 rounded-xl hover:border-yellow-600/60 hover:bg-gray-750 transition-colors group"
                      >
                        <Link
                          href={`/trainings/${outputId}`}
                          className="flex min-w-0 flex-1 items-center gap-4 px-5 py-4"
                        >
                          <FolderOpen className="w-8 h-8 text-yellow-500 group-hover:text-yellow-400 flex-shrink-0" />
                          <div className="min-w-0">
                            <p className="text-gray-100 font-medium truncate">{formatTrainingFullLabel(outputId)}</p>
                            <p className="text-xs text-gray-400 mt-0.5">Ver muestras de entrenamiento</p>
                          </div>
                        </Link>

                        {canDelete && (
                          <button
                            type="button"
                            onClick={() => handleDeleteTrainingOutput(outputId)}
                            disabled={isDeleting}
                            title={`Eliminar ${outputId}`}
                            aria-label={`Eliminar carpeta ${outputId}`}
                            className="mr-3 flex h-9 w-9 flex-none items-center justify-center rounded-lg border border-gray-700 text-gray-400 transition-colors hover:border-red-500/70 hover:bg-red-500/10 hover:text-red-300 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {isDeleting ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Trash2 className="h-4 w-4" />
                            )}
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
