'use client';

import ScraperImageCard, { ScraperImageData } from './ScraperImageCard';
import { Loader2 } from 'lucide-react';

interface Props {
  images: ScraperImageData[];
  loading: boolean;
  selectable?: boolean;
  selected?: Set<string>;
  onToggle?: (filename: string) => void;
}

export default function ScraperGallery({
  images,
  loading,
  selectable,
  selected,
  onToggle,
}: Props) {
  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-gray-500" />
      </div>
    );
  }

  if (images.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-500 text-sm">
        No hay imágenes en esta vista.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-3">
      {images.map(img => (
        <ScraperImageCard
          key={img.filename}
          image={img}
          selectable={selectable}
          selected={selected?.has(img.filename)}
          onToggle={onToggle}
        />
      ))}
    </div>
  );
}
