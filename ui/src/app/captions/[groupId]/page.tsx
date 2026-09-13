'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Zap, Save, ArrowRight, RefreshCw } from 'lucide-react';
import Link from 'next/link';
import { TopBar, MainContent } from '@/components/layout';
import CaptionImageCard from '@/components/captions/CaptionImageCard';
import GenerateCaptionsModal from '@/components/captions/GenerateCaptionsModal';
import MoveToDatasetModal from '@/components/captions/MoveToDatasetModal';
import { GroupManifest, GroupImage } from '@/server/captions';

// Types are imported from server — we declare a client-safe subset here
type GroupStatus = GroupManifest['status'];

interface GenerateProgress {
  status: 'idle' | 'running' | 'done' | 'error';
  total: number;
  completed: number;
  current_file: string;
  error?: string;
}

interface Props {
  params: Promise<{ groupId: string }>;
}

export default function CaptionGroupPage({ params }: Props) {
  const resolvedParams = React.use(params);
  const { groupId } = resolvedParams;
  const router = useRouter();

  const [group, setGroup] = useState<GroupManifest | null>(null);
  const [images, setImages] = useState<GroupImage[]>([]);
  const [captions, setCaptions] = useState<Map<string, string>>(new Map());
  const [savingFiles, setSavingFiles] = useState<Set<string>>(new Set());
  const [feedback, setFeedback] = useState<string | null>(null);

  const [isGenerateOpen, setIsGenerateOpen] = useState(false);
  const [isMoveOpen, setIsMoveOpen] = useState(false);

  const [progress, setProgress] = useState<GenerateProgress | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const showFeedback = (msg: string) => {
    setFeedback(msg);
    setTimeout(() => setFeedback(null), 3000);
  };

  // ------------------------------------------------------------------
  // Load group + images
  // ------------------------------------------------------------------
  const loadGroup = useCallback(async () => {
    const [gRes, iRes] = await Promise.all([
      fetch(`/api/captions/groups/${groupId}`),
      fetch(`/api/captions/groups/${groupId}/images`),
    ]);
    const gData = await gRes.json();
    const iData = await iRes.json();

    if (!gRes.ok) { router.push('/captions'); return; }

    const g: GroupManifest = gData.group;
    const imgs: GroupImage[] = iData.images ?? [];

    setGroup(g);
    setImages(imgs);
    setCaptions(new Map(imgs.map(img => [img.filename, img.caption])));

    return g;
  }, [groupId, router]);

  useEffect(() => {
    loadGroup().then(g => {
      if (g?.status === 'generating') startPolling();
    });
    return () => stopPolling();
  }, [loadGroup]);

  // ------------------------------------------------------------------
  // Progress polling
  // ------------------------------------------------------------------
  const startPolling = useCallback(() => {
    if (pollRef.current) return;
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/captions/groups/${groupId}/progress`);
        const data = await res.json();
        const p: GenerateProgress = data.progress;
        setProgress(p);
        if (p.status === 'done' || p.status === 'error') {
          stopPolling();
          await loadGroup();
          showFeedback(p.status === 'done' ? 'Generación completada.' : `Error: ${p.error}`);
        }
      } catch { /* ignore */ }
    }, 2000);
  }, [groupId, loadGroup]);

  const stopPolling = () => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  };

  // ------------------------------------------------------------------
  // Caption editing
  // ------------------------------------------------------------------
  const handleCaptionChange = (filename: string, caption: string) => {
    setCaptions(prev => new Map(prev).set(filename, caption));
  };

  const handleCaptionSave = async (filename: string, caption: string) => {
    setSavingFiles(prev => new Set(prev).add(filename));
    try {
      const currentCaptions = images.map(img => ({
        file: img.filename,
        caption: captions.get(img.filename) ?? img.caption,
      }));
      // Update the target file
      const updated = currentCaptions.map(r => r.file === filename ? { ...r, caption } : r);
      await fetch(`/api/captions/groups/${groupId}/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ captions: updated }),
      });
    } finally {
      setSavingFiles(prev => { const s = new Set(prev); s.delete(filename); return s; });
    }
  };

  const handleSaveAll = async () => {
    const rows = images.map(img => ({
      file: img.filename,
      caption: captions.get(img.filename) ?? img.caption,
    }));
    const res = await fetch(`/api/captions/groups/${groupId}/save`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ captions: rows }),
    });
    if (res.ok) {
      showFeedback('Captions guardados.');
      await loadGroup();
    }
  };

  // ------------------------------------------------------------------
  // Generate
  // ------------------------------------------------------------------
  const handleGenerate = async (opts: {
    triggerWord: string;
    detailLevel: 'short' | 'medium' | 'detailed';
    overwriteMode: 'empty_only' | 'overwrite_all';
  }) => {
    const res = await fetch(`/api/captions/groups/${groupId}/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(opts),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? 'Error al iniciar generación');
    setProgress({ status: 'running', total: images.length, completed: 0, current_file: '' });
    await loadGroup();
    startPolling();
  };

  // ------------------------------------------------------------------
  // Move to dataset
  // ------------------------------------------------------------------
  const handleMove = async (datasetName: string, triggerWord: string) => {
    const res = await fetch(`/api/captions/groups/${groupId}/move`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ datasetName, triggerWord }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? 'Error al mover');
    showFeedback(`Movido a ${datasetName}.`);
    await loadGroup();
  };

  // ------------------------------------------------------------------
  // Render
  // ------------------------------------------------------------------
  if (!group) {
    return (
      <>
        <TopBar>
          <div className="px-2 flex items-center gap-2">
            <Link href="/captions" className="text-gray-400 hover:text-white">
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <span className="text-sm text-gray-400">Cargando...</span>
          </div>
        </TopBar>
        <MainContent>
          <div className="flex items-center justify-center h-40 text-gray-400 text-sm">
            Cargando grupo...
          </div>
        </MainContent>
      </>
    );
  }

  const isGenerating = group.status === 'generating';
  const canGenerate = !isGenerating && group.status !== 'moved';
  const canMove = group.status !== 'draft' && group.status !== 'generating';

  return (
    <>
      <TopBar>
        <div className="flex items-center gap-2 px-2 w-full">
          <Link href="/captions" className="p-1 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition-colors">
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div className="flex-1 min-w-0">
            <span className="text-sm font-semibold text-gray-200 truncate">{group.name}</span>
            <span className="ml-2 text-xs text-gray-500">{images.length} imágenes</span>
            {group.moved_to && (
              <span className="ml-2 text-xs text-purple-400">→ {group.moved_to}</span>
            )}
          </div>

          <button
            onClick={loadGroup}
            title="Recargar captions del disco"
            className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
          </button>

          {/* Progress bar inline */}
          {isGenerating && progress && (
            <div className="flex items-center gap-2 text-xs text-yellow-400 shrink-0">
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              <span>
                {progress.completed}/{progress.total}
                {progress.current_file && ` — ${progress.current_file}`}
              </span>
            </div>
          )}

          {feedback && (
            <span className="text-xs text-green-400 px-2 shrink-0">{feedback}</span>
          )}

          {/* Toolbar buttons */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={handleSaveAll}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-gray-300 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors"
            >
              <Save className="w-3.5 h-3.5" />
              Guardar todo
            </button>
            {canGenerate && (
              <button
                onClick={() => setIsGenerateOpen(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-black bg-yellow-500 hover:bg-yellow-400 rounded-lg transition-colors"
              >
                <Zap className="w-3.5 h-3.5" />
                Generar captions
              </button>
            )}
            {canMove && (
              <button
                onClick={() => setIsMoveOpen(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-purple-600 hover:bg-purple-500 rounded-lg transition-colors"
              >
                <ArrowRight className="w-3.5 h-3.5" />
                Mover al dataset
              </button>
            )}
          </div>
        </div>
      </TopBar>

      <MainContent>
        {/* Progress bar */}
        {isGenerating && progress && progress.total > 0 && (
          <div className="mb-4 px-1">
            <div className="flex justify-between text-xs text-gray-400 mb-1">
              <span>Generando captions...</span>
              <span>{progress.completed}/{progress.total}</span>
            </div>
            <div className="w-full h-2 bg-gray-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-yellow-500 transition-all duration-500"
                style={{ width: `${Math.round((progress.completed / progress.total) * 100)}%` }}
              />
            </div>
          </div>
        )}

        {images.length === 0 ? (
          <div className="flex items-center justify-center h-40 text-gray-400 text-sm">
            Este grupo no tiene imágenes.
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 py-2">
            {images.map(img => (
              <CaptionImageCard
                key={img.filename}
                image={{ ...img, caption: captions.get(img.filename) ?? img.caption }}
                onChange={handleCaptionChange}
                onSave={handleCaptionSave}
                isSaving={savingFiles.has(img.filename)}
              />
            ))}
          </div>
        )}
      </MainContent>

      <GenerateCaptionsModal
        isOpen={isGenerateOpen}
        onClose={() => setIsGenerateOpen(false)}
        onGenerate={handleGenerate}
      />
      <MoveToDatasetModal
        isOpen={isMoveOpen}
        onClose={() => setIsMoveOpen(false)}
        onMove={handleMove}
      />
    </>
  );
}
