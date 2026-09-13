'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Loader2, ChevronLeft, X, ChevronRight } from 'lucide-react';
import { formatTrainingFullLabel } from '@/utils/trainingCatalog';

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

export default function TrainingIterPage() {
  const { iter } = useParams<{ iter: string }>();
  const [data, setData] = useState<TrainingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [lightbox, setLightbox] = useState<{ promptIdx: number; imageIdx: number } | null>(null);

  useEffect(() => {
    if (!iter) return;
    setLoading(true);
    fetch(`/api/training-samples?iter=${encodeURIComponent(iter)}`)
      .then(r => r.json())
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [iter]);

  const closeLightbox = () => setLightbox(null);

  const moveLightbox = (direction: 1 | -1) => {
    if (!lightbox || !data) return;
    const prompt = data.prompts[lightbox.promptIdx];
    if (!prompt) return;
    const newIdx = lightbox.imageIdx + direction;
    if (newIdx >= 0 && newIdx < prompt.images.length) {
      setLightbox({ promptIdx: lightbox.promptIdx, imageIdx: newIdx });
    }
  };

  useEffect(() => {
    if (!lightbox) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeLightbox();
      if (e.key === 'ArrowLeft') moveLightbox(-1);
      if (e.key === 'ArrowRight') moveLightbox(1);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  });

  const trainingLabel = iter ? formatTrainingFullLabel(iter) : '';

  const lightboxImage =
    lightbox && data
      ? data.prompts[lightbox.promptIdx]?.images[lightbox.imageIdx]
      : null;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="border-b border-gray-800 px-6 py-4 flex items-center gap-3">
        <Link href="/trainings" className="text-gray-400 hover:text-gray-200 transition-colors">
          <ChevronLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-xl font-semibold text-gray-100">Entrenamiento - {trainingLabel}</h1>
          {data && data.prompts && (
            <p className="text-sm text-gray-400 mt-0.5">
              {data.trainingName} · {data.prompts.length} prompts
            </p>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-6 py-6">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="w-8 h-8 animate-spin text-gray-500" />
          </div>
        ) : !data || !data.prompts || data.prompts.length === 0 ? (
          <div className="flex items-center justify-center h-full text-gray-500">
            <p>No se encontraron muestras para este entrenamiento</p>
          </div>
        ) : (
          <div className="space-y-10">
            {data.prompts.map(prompt => (
              <div key={prompt.index}>
                {/* Prompt header */}
                <div className="mb-3">
                  <span className="inline-block bg-yellow-600/15 border border-yellow-700/30 text-yellow-300 text-xs font-medium px-2 py-0.5 rounded mb-1">
                    Prompt {prompt.index + 1}
                  </span>
                  <p className="text-sm text-gray-300 font-mono">{prompt.text}</p>
                </div>

                {/* Images: horizontal scroll row sorted by step */}
                {prompt.images.length === 0 ? (
                  <p className="text-xs text-gray-500 italic">Sin imágenes</p>
                ) : (
                  <div className="flex gap-3 overflow-x-auto pb-2">
                    {prompt.images.map((img, imgIdx) => (
                      <div
                        key={img.filename}
                        className="flex-shrink-0 cursor-pointer group"
                        onClick={() => setLightbox({ promptIdx: prompt.index, imageIdx: imgIdx })}
                      >
                        <div className="w-40 h-40 bg-gray-800 rounded-lg overflow-hidden border border-gray-700 hover:border-yellow-600/50 transition-colors">
                          <img
                            src={img.url}
                            alt={`Step ${img.step}`}
                            className="w-full h-full object-cover"
                            style={{ imageRendering: 'pixelated' }}
                            loading="lazy"
                          />
                        </div>
                        <p className="text-center text-xs text-gray-500 mt-1">Step {img.step}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Lightbox */}
      {lightbox && lightboxImage && data && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90"
          onClick={closeLightbox}
        >
          <button
            className="absolute top-4 right-4 text-gray-400 hover:text-white transition-colors"
            onClick={closeLightbox}
          >
            <X className="w-7 h-7" />
          </button>

          {/* Prev */}
          {lightbox.imageIdx > 0 && (
            <button
              className="absolute left-4 text-gray-400 hover:text-white transition-colors"
              onClick={e => { e.stopPropagation(); moveLightbox(-1); }}
            >
              <ChevronLeft className="w-10 h-10" />
            </button>
          )}

          {/* Image */}
          <div className="flex flex-col items-center gap-3" onClick={e => e.stopPropagation()}>
            <img
              src={lightboxImage.url}
              alt={`Step ${lightboxImage.step}`}
              className="max-h-[80vh] max-w-[80vw] object-contain rounded-lg"
              style={{ imageRendering: 'pixelated' }}
            />
            <div className="text-center">
              <p className="text-gray-200 text-sm font-mono">
                {data.prompts[lightbox.promptIdx]?.text}
              </p>
              <p className="text-gray-400 text-xs mt-1">Step {lightboxImage.step}</p>
            </div>
          </div>

          {/* Next */}
          {lightbox.imageIdx < (data.prompts[lightbox.promptIdx]?.images.length ?? 0) - 1 && (
            <button
              className="absolute right-4 text-gray-400 hover:text-white transition-colors"
              onClick={e => { e.stopPropagation(); moveLightbox(1); }}
            >
              <ChevronRight className="w-10 h-10" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
