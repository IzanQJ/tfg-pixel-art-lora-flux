'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import ScraperToolbar, { ScraperView, SortOrder } from '@/components/scraper/ScraperToolbar';
import ScraperGallery from '@/components/scraper/ScraperGallery';
import { ScraperImageData } from '@/components/scraper/ScraperImageCard';
import { TopBar, MainContent } from '@/components/layout';
import { openConfirm } from '@/components/ConfirmModal';

interface ScraperFolder {
  id: string;
  label: string;
  isDefault: boolean;
  acceptedCount: number;
  manualAcceptedCount: number;
  rejectedCount: number;
  status?: 'idle' | 'running' | 'done' | 'error';
}

interface Props {
  folderId: string;
}

export default function ScraperFolderView({ folderId }: Props) {
  const [view, setView] = useState<ScraperView>('accepted');
  const [sort, setSort] = useState<SortOrder>('asc');
  const [images, setImages] = useState<ScraperImageData[]>([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [cleanMode, setCleanMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [folders, setFolders] = useState<ScraperFolder[]>([]);

  const folderInfo = useMemo(
    () => folders.find(folder => folder.id === folderId),
    [folders, folderId],
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
    }
  }, []);

  const loadImages = useCallback(
    async (v: ScraperView, s: SortOrder) => {
      setLoading(true);
      setImages([]);
      try {
        const params = new URLSearchParams({ view: v, sort: s, folder: folderId });
        const res = await fetch(`/api/scraper/images?${params.toString()}`);
        const data = await res.json();
        setImages(data.images ?? []);
      } catch {
        setImages([]);
      } finally {
        setLoading(false);
      }
    },
    [folderId],
  );

  const syncAndLoad = useCallback(
    async (s: SortOrder) => {
      setSyncing(true);
      try {
        const res = await fetch('/api/scraper/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ folder: folderId }),
        });
        const data = await res.json();
        if (data.copied > 0) {
          showFeedback(`Sincronizadas ${data.copied} imagenes nuevas.`);
        }
      } catch {
        // Loading the folder is still useful even if sync fails.
      } finally {
        setSyncing(false);
      }
      await loadImages('manual_accepted', s);
      await loadFolders();
    },
    [folderId, loadFolders, loadImages, showFeedback],
  );

  useEffect(() => {
    loadFolders();
    loadImages('accepted', 'asc');
  }, [loadFolders, loadImages]);

  const handleViewChange = (v: ScraperView) => {
    setView(v);
    setCleanMode(false);
    setSelected(new Set());
    if (v === 'manual_accepted') {
      syncAndLoad(sort);
    } else {
      loadImages(v, sort);
    }
  };

  const handleSortChange = (s: SortOrder) => {
    setSort(s);
    loadImages(view, s);
  };

  const toggleImage = (filename: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(filename)) next.delete(filename);
      else next.add(filename);
      return next;
    });
  };

  const handleDeleteSelected = () => {
    if (selected.size === 0) return;
    openConfirm({
      title: 'Eliminar definitivamente',
      message: `Seguro que quieres eliminar ${selected.size} imagen${selected.size !== 1 ? 'es' : ''} de manual accepted?\n\nNo se eliminaran de la carpeta accepted original. Esta accion no se puede deshacer desde la UI.`,
      type: 'danger',
      confirmText: 'Eliminar',
      onConfirm: async () => {
        setDeleting(true);
        try {
          const res = await fetch('/api/scraper/delete', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ filenames: Array.from(selected), folder: folderId }),
          });
          const data = await res.json();
          showFeedback(
            data.errors?.length
              ? `Eliminadas ${data.deleted}. Errores: ${data.errors.join(', ')}`
              : `${data.deleted} imagen${data.deleted !== 1 ? 'es' : ''} eliminada${data.deleted !== 1 ? 's' : ''}.`,
          );
          setCleanMode(false);
          setSelected(new Set());
          await loadImages('manual_accepted', sort);
          await loadFolders();
        } catch {
          showFeedback('Error al eliminar imagenes.');
        } finally {
          setDeleting(false);
        }
      },
    });
  };

  const folderLabel = folderInfo?.label ?? folderId;

  return (
    <>
      <TopBar>
        <Link
          href="/scraper"
          className="mr-3 flex h-8 w-8 items-center justify-center rounded-md text-gray-400 hover:bg-gray-800 hover:text-gray-100"
          aria-label="Volver a carpetas"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <h1 className="text-lg text-gray-100">Scraper</h1>
        <span className="ml-3 truncate text-xs text-gray-500">{folderLabel}</span>
        <div className="flex-1" />
        {syncing && (
          <span className="mr-3 text-xs text-yellow-400">Sincronizando...</span>
        )}
      </TopBar>

      <MainContent>
        <div className="mb-4 rounded-lg border border-gray-800 bg-gray-900/70 px-4 py-3">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
            <div>
              <p className="text-xs uppercase tracking-wide text-gray-500">Carpeta</p>
              <p className="font-medium text-gray-100">{folderLabel}</p>
            </div>
            <div className="text-gray-400">
              {folderInfo ? (
                <>
                  {folderInfo.acceptedCount} aceptadas - {folderInfo.manualAcceptedCount} curadas - {folderInfo.rejectedCount} rechazadas
                </>
              ) : (
                'Cargando resumen...'
              )}
            </div>
          </div>
        </div>

        <div className="mb-4">
          <ScraperToolbar
            view={view}
            sort={sort}
            total={images.length}
            cleanMode={cleanMode}
            selectedCount={selected.size}
            deleting={deleting}
            onViewChange={handleViewChange}
            onSortChange={handleSortChange}
            onEnterClean={() => {
              setCleanMode(true);
              setSelected(new Set());
            }}
            onCancelClean={() => {
              setCleanMode(false);
              setSelected(new Set());
            }}
            onDeleteSelected={handleDeleteSelected}
          />
        </div>

        {view === 'accepted' && (
          <p className="mb-4 text-xs text-gray-500">
            Resultado bruto aceptado por el scraper. Solo lectura: esta carpeta no se modifica desde la UI.
          </p>
        )}
        {view === 'rejected' && (
          <p className="mb-4 text-xs text-gray-500">
            Imagenes rechazadas automaticamente por el scraper.
          </p>
        )}
        {view === 'manual_accepted' && (
          <p className="mb-4 text-xs text-gray-500">
            Copia curada de las aceptadas. Puedes eliminar imagenes manualmente; no volveran a aparecer al sincronizar.
          </p>
        )}

        <ScraperGallery
          images={images}
          loading={loading || syncing}
          selectable={cleanMode && view === 'manual_accepted'}
          selected={selected}
          onToggle={toggleImage}
        />
      </MainContent>

      {feedback && (
        <div className="pointer-events-none fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-lg bg-gray-700 px-4 py-2 text-sm text-gray-100 shadow-lg">
          {feedback}
        </div>
      )}
    </>
  );
}
