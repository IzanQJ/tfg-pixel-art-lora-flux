'use client';

import React, { useEffect, useState } from 'react';
import { BarChart3, ChevronLeft, ChevronRight, Loader2, X } from 'lucide-react';
import { usePipeline } from './PipelineContext';
import ImageEvaluationPanel from './ImageEvaluationPanel';
import { formatTrainingFullLabel } from '@/utils/trainingCatalog';

interface GalleryImage {
  filename: string;
  path: string;
  url: string;
  createdAt: string;
}

export default function GalleryView() {
  const { selectedFolder } = usePipeline();
  const [images, setImages] = useState<GalleryImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);
  const [evaluationOpen, setEvaluationOpen] = useState(false);

  useEffect(() => {
    if (!selectedFolder) return;
    setLoading(true);
    fetch(`/api/iteration-images?iter=${selectedFolder}`)
      .then(response => response.json())
      .then(data => {
        setImages(data.images || []);
      })
      .catch(() => setImages([]))
      .finally(() => setLoading(false));
  }, [selectedFolder]);

  if (!selectedFolder) return null;

  const trainingLabel = formatTrainingFullLabel(selectedFolder);
  const lightboxImage = lightboxIdx !== null ? images[lightboxIdx] : null;

  const openLightbox = (index: number) => {
    setLightboxIdx(index);
    setEvaluationOpen(false);
  };

  const closeLightbox = () => {
    setLightboxIdx(null);
    setEvaluationOpen(false);
  };

  const goPrev = () => {
    if (lightboxIdx === null) return;
    setLightboxIdx(lightboxIdx > 0 ? lightboxIdx - 1 : images.length - 1);
  };

  const goNext = () => {
    if (lightboxIdx === null) return;
    setLightboxIdx(lightboxIdx < images.length - 1 ? lightboxIdx + 1 : 0);
  };

  useEffect(() => {
    if (lightboxIdx === null) return;
    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const editing = target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.tagName === 'SELECT';
      if (event.key === 'Escape') closeLightbox();
      if (!editing && event.key === 'ArrowLeft') goPrev();
      if (!editing && event.key === 'ArrowRight') goNext();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  });

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-gray-800 px-6 py-4">
        <h1 className="text-xl font-semibold text-gray-100">Galería - {trainingLabel}</h1>
        <p className="mt-1 text-sm text-gray-400">{images.length} imágenes encontradas</p>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-4">
        {loading ? (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-gray-500" />
          </div>
        ) : images.length === 0 ? (
          <div className="flex h-full items-center justify-center text-gray-500">
            <p>No hay imágenes en este entrenamiento</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {images.map((image, index) => (
              <button
                type="button"
                key={image.url}
                className="group relative aspect-square overflow-hidden rounded-lg border border-gray-700 bg-gray-800 text-left transition-colors hover:border-yellow-600/50"
                onClick={() => openLightbox(index)}
              >
                <img
                  src={image.url}
                  alt={image.filename}
                  className="h-full w-full object-cover"
                  style={{ imageRendering: 'pixelated' }}
                  loading="lazy"
                />
                <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-2 py-2 opacity-0 transition-opacity group-hover:opacity-100">
                  <span className="block truncate text-xs text-gray-300">{image.filename}</span>
                  <span className="block text-xs text-gray-500">
                    {new Date(image.createdAt).toLocaleDateString()}
                  </span>
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {lightboxImage && (
        <div
          className="fixed inset-0 z-50 bg-black/95 p-3 lg:p-6"
          onClick={closeLightbox}
          role="dialog"
          aria-modal="true"
          aria-label={`Imagen ${lightboxImage.filename}`}
        >
          <button
            type="button"
            title="Cerrar imagen"
            aria-label="Cerrar imagen"
            className="absolute right-3 top-3 z-20 p-2 text-white/70 hover:text-white lg:right-5 lg:top-5"
            onClick={closeLightbox}
          >
            <X className="h-6 w-6" />
          </button>

          <div
            className="mx-auto flex h-full max-w-[1440px] flex-col items-stretch justify-center gap-4 lg:flex-row"
            onClick={event => event.stopPropagation()}
          >
            <div className="relative flex min-h-0 min-w-0 flex-1 flex-col items-center justify-center gap-3 px-9">
              {images.length > 1 && (
                <>
                  <button
                    type="button"
                    title="Imagen anterior"
                    aria-label="Imagen anterior"
                    className="absolute left-0 top-1/2 z-10 -translate-y-1/2 p-2 text-white/70 hover:text-white"
                    onClick={goPrev}
                  >
                    <ChevronLeft className="h-8 w-8" />
                  </button>
                  <button
                    type="button"
                    title="Imagen siguiente"
                    aria-label="Imagen siguiente"
                    className="absolute right-0 top-1/2 z-10 -translate-y-1/2 p-2 text-white/70 hover:text-white"
                    onClick={goNext}
                  >
                    <ChevronRight className="h-8 w-8" />
                  </button>
                </>
              )}

              <img
                src={lightboxImage.url}
                alt={lightboxImage.filename}
                className="min-h-0 max-h-[calc(100%_-_6rem)] max-w-full object-contain"
                style={{ imageRendering: 'pixelated' }}
              />

              <div className="text-center">
                <p className="text-sm text-gray-300">{lightboxImage.filename}</p>
                <p className="text-xs text-gray-500">
                  {new Date(lightboxImage.createdAt).toLocaleDateString()}
                </p>
              </div>

              <button
                type="button"
                data-testid="toggle-image-evaluation"
                onClick={() => setEvaluationOpen(current => !current)}
                className={`inline-flex min-h-10 items-center gap-2 border px-4 text-sm font-medium ${
                  evaluationOpen
                    ? 'border-yellow-500 bg-yellow-500 text-gray-950'
                    : 'border-gray-700 bg-gray-800 text-gray-200 hover:border-yellow-600'
                }`}
              >
                <BarChart3 className="h-4 w-4" />
                {evaluationOpen ? 'Ocultar evaluación' : 'Evaluar imagen'}
              </button>
            </div>

            {evaluationOpen && (
              <div className="h-[52vh] min-h-0 lg:h-full">
                <ImageEvaluationPanel
                  key={lightboxImage.path}
                  imagePath={lightboxImage.path}
                  filename={lightboxImage.filename}
                  onClose={() => setEvaluationOpen(false)}
                />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
