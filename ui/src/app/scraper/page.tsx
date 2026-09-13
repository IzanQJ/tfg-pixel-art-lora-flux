'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { FolderOpen, Loader2, Play, RefreshCw, Trash2 } from 'lucide-react';
import { TopBar, MainContent } from '@/components/layout';
import { PIXILART_TOPICS } from '@/utils/pixilartTopics';

interface ScraperFolder {
  id: string;
  label: string;
  isDefault: boolean;
  acceptedCount: number;
  manualAcceptedCount: number;
  rejectedCount: number;
  status?: 'idle' | 'running' | 'done' | 'error';
  createdAt?: string;
  progress?: {
    current: number;
    total: number;
    percent: number;
  };
}

const STATUS_LABEL: Record<NonNullable<ScraperFolder['status']>, string> = {
  idle: 'Pendiente',
  running: 'Ejecutando',
  done: 'Terminado',
  error: 'Error',
};

export default function ScraperPage() {
  const [folders, setFolders] = useState<ScraperFolder[]>([]);
  const [loading, setLoading] = useState(true);
  const [runName, setRunName] = useState('');
  const [runTopics, setRunTopics] = useState<Set<string>>(new Set(['animals']));
  const [itemsPerTopic, setItemsPerTopic] = useState(20);
  const [startingRun, setStartingRun] = useState(false);
  const [deletingFolderId, setDeletingFolderId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const runningFolders = useMemo(
    () => folders.filter(folder => folder.status === 'running'),
    [folders],
  );

  const showFeedback = useCallback((msg: string) => {
    setFeedback(msg);
    window.setTimeout(() => setFeedback(null), 3500);
  }, []);

  const loadFolders = useCallback(async () => {
    try {
      const res = await fetch('/api/scraper/folders');
      const data = await res.json();
      setFolders(data.folders ?? []);
    } catch {
      setFolders([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadFolders();
  }, [loadFolders]);

  useEffect(() => {
    if (runningFolders.length === 0 && !startingRun) return;
    const interval = window.setInterval(loadFolders, 4000);
    return () => window.clearInterval(interval);
  }, [loadFolders, runningFolders.length, startingRun]);

  const toggleTopic = (topic: string) => {
    setRunTopics(prev => {
      const next = new Set(prev);
      if (next.has(topic)) next.delete(topic);
      else next.add(topic);
      return next;
    });
  };

  const handleStartScraper = async () => {
    if (runTopics.size === 0 || startingRun) return;
    setStartingRun(true);
    try {
      const res = await fetch('/api/scraper/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          label: runName,
          topics: Array.from(runTopics),
          itemsPerTopic,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'No se pudo iniciar el scraper');
      setRunName('');
      showFeedback('Scraper iniciado. La carpeta aparecera abajo con su progreso.');
      await loadFolders();
    } catch (err: any) {
      showFeedback(`Error: ${err.message ?? 'No se pudo iniciar el scraper'}`);
    } finally {
      setStartingRun(false);
    }
  };

  const handleDeleteFolder = async (folder: ScraperFolder) => {
    if (folder.isDefault || deletingFolderId) return;
    const confirmed = window.confirm(
      `Eliminar la carpeta "${folder.label}"?\n\nSe borraran sus imagenes, metadatos y logs del scraper.`,
    );
    if (!confirmed) return;

    setDeletingFolderId(folder.id);
    try {
      const res = await fetch('/api/scraper/folders', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folderId: folder.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'No se pudo eliminar la carpeta');
      showFeedback('Carpeta eliminada.');
      await loadFolders();
    } catch (err: any) {
      showFeedback(`Error: ${err.message ?? 'No se pudo eliminar la carpeta'}`);
    } finally {
      setDeletingFolderId(null);
    }
  };

  return (
    <>
      <TopBar>
        <h1 className="text-lg text-gray-100">Scraper</h1>
        <span className="ml-3 text-xs text-gray-500">Pixilart dataset review</span>
        <div className="flex-1" />
        <button
          type="button"
          onClick={loadFolders}
          className="flex h-8 w-8 items-center justify-center rounded-md text-gray-400 hover:bg-gray-800 hover:text-gray-100"
          aria-label="Actualizar carpetas"
        >
          <RefreshCw className="h-4 w-4" />
        </button>
      </TopBar>

      <MainContent className="px-6">
        <section className="mb-6 rounded-lg border border-gray-800 bg-gray-900/70 p-4">
          <div className="mb-4 flex flex-wrap items-end gap-3">
            <div className="min-w-64 flex-1">
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500">
                Nombre de la nueva carpeta
              </label>
              <input
                value={runName}
                onChange={event => setRunName(event.target.value)}
                placeholder="ej. animales_dragones"
                className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-yellow-600/50"
              />
            </div>

            <label className="w-36">
              <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500">Cantidad</span>
              <input
                type="number"
                min={1}
                value={itemsPerTopic}
                onChange={event => setItemsPerTopic(Math.max(1, Number(event.target.value) || 1))}
                className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-200 focus:outline-none focus:ring-2 focus:ring-yellow-600/50"
              />
            </label>

            <button
              type="button"
              onClick={handleStartScraper}
              disabled={startingRun || runTopics.size === 0}
              className="flex items-center gap-2 rounded-lg bg-yellow-500 px-4 py-2 text-sm font-medium text-black transition-colors hover:bg-yellow-400 disabled:cursor-not-allowed disabled:bg-gray-700 disabled:text-gray-500"
            >
              {startingRun ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Play className="h-4 w-4" />
              )}
              {startingRun ? 'Iniciando...' : 'Iniciar scraper'}
            </button>
          </div>

          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-500">Topics Pixilart</p>
            <div className="flex flex-wrap gap-2">
              {PIXILART_TOPICS.map(topic => {
                const selectedTopic = runTopics.has(topic.value);
                return (
                  <button
                    key={topic.value}
                    type="button"
                    onClick={() => toggleTopic(topic.value)}
                    title={topic.url}
                    className={`rounded-md border px-2.5 py-1 text-xs transition-colors ${
                      selectedTopic
                        ? 'border-yellow-500 bg-yellow-500/15 text-yellow-300'
                        : 'border-gray-700 bg-gray-800 text-gray-400 hover:border-gray-500 hover:text-gray-200'
                    }`}
                  >
                    {topic.label}
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        <section>
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-100">Carpetas del scraper</h2>
              <p className="mt-1 text-sm text-gray-400">
                Abre una carpeta para revisar aceptadas, rechazadas y manual accepted.
              </p>
            </div>
            {runningFolders.length > 0 && (
              <span className="rounded-full border border-yellow-500/40 bg-yellow-500/10 px-3 py-1 text-xs text-yellow-300">
                {runningFolders.length} en ejecucion
              </span>
            )}
          </div>

          {loading ? (
            <div className="flex h-48 items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-gray-500" />
            </div>
          ) : folders.length === 0 ? (
            <div className="flex h-48 items-center justify-center rounded-lg border border-gray-800 text-sm text-gray-500">
              No se encontraron carpetas del scraper.
            </div>
          ) : (
            <div className="flex flex-nowrap gap-4 overflow-x-auto pb-3">
              {folders.map(folder => {
                const statusLabel = folder.status ? STATUS_LABEL[folder.status] : null;
                const remaining = folder.progress
                  ? Math.max(0, folder.progress.total - folder.progress.current)
                  : 0;
                return (
                  <div
                    key={folder.id}
                    className="relative flex w-96 flex-none rounded-lg border border-gray-700 bg-gray-800 px-5 py-4 transition-colors hover:border-yellow-600/60 hover:bg-gray-750"
                  >
                    <Link
                      href={`/scraper/${encodeURIComponent(folder.id)}`}
                      className="group flex min-w-0 flex-1 gap-4 pr-8"
                    >
                      <FolderOpen className="mt-1 h-8 w-8 flex-shrink-0 text-yellow-500 group-hover:text-yellow-400" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate font-medium text-gray-100">{folder.label}</p>
                            <p className="mt-0.5 truncate text-xs text-gray-400">Carpeta: {folder.id}</p>
                          </div>
                          {statusLabel && (
                            <span className={`rounded-full px-2 py-0.5 text-xs ${
                              folder.status === 'running'
                                ? 'bg-yellow-500/15 text-yellow-300'
                                : folder.status === 'error'
                                  ? 'bg-red-500/15 text-red-300'
                                  : 'bg-gray-700 text-gray-300'
                            }`}>
                              {statusLabel}
                            </span>
                          )}
                        </div>

                        <p className="mt-3 text-xs text-gray-400">
                          {folder.acceptedCount} aceptadas - {folder.manualAcceptedCount} curadas - {folder.rejectedCount} rechazadas
                        </p>

                        {folder.status === 'running' && folder.progress && (
                          <div className="mt-3">
                            <div className="h-2 overflow-hidden rounded-full bg-gray-900">
                              <div
                                className="h-full rounded-full bg-yellow-500 transition-all"
                                style={{ width: `${folder.progress.percent}%` }}
                              />
                            </div>
                            <p className="mt-1 text-xs text-gray-500">
                              {folder.progress.current}/{folder.progress.total} procesadas - faltan {remaining}
                            </p>
                          </div>
                        )}
                      </div>
                    </Link>

                    {!folder.isDefault && folder.status !== 'running' && (
                      <button
                        type="button"
                        onClick={() => handleDeleteFolder(folder)}
                        disabled={deletingFolderId !== null}
                        title="Eliminar carpeta"
                        aria-label={`Eliminar carpeta ${folder.label}`}
                        className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-md text-gray-500 transition-colors hover:bg-red-500/10 hover:text-red-300 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {deletingFolderId === folder.id ? (
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
          )}
        </section>
      </MainContent>

      {feedback && (
        <div className="pointer-events-none fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-lg bg-gray-700 px-4 py-2 text-sm text-gray-100 shadow-lg">
          {feedback}
        </div>
      )}
    </>
  );
}
