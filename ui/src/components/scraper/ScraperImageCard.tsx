'use client';

import Image from 'next/image';
import classNames from 'classnames';

export interface ScraperImageData {
  filename: string;
  url: string;
  canvas_width_px: number | null;
  canvas_height_px: number | null;
  canvas_size_label: string | null;
  canvas_pixel_count: number | null;
  title?: string;
  source_tag?: string;
  art_url?: string;
  reject_reason?: string | null;
}

interface Props {
  image: ScraperImageData;
  selectable?: boolean;
  selected?: boolean;
  onToggle?: (filename: string) => void;
}

export default function ScraperImageCard({ image, selectable, selected, onToggle }: Props) {
  const dims =
    image.canvas_width_px && image.canvas_height_px
      ? `${image.canvas_width_px}×${image.canvas_height_px}`
      : image.canvas_size_label ?? '—';

  const pc = image.canvas_pixel_count != null
    ? `${image.canvas_pixel_count.toLocaleString()} px²`
    : null;

  // Show reject reason badge for rejected items
  const badge = image.reject_reason
    ? image.reject_reason.replace(/_/g, ' ')
    : null;

  const handleClick = () => {
    if (selectable && onToggle) onToggle(image.filename);
  };

  return (
    <div
      onClick={handleClick}
      className={classNames(
        'relative flex flex-col bg-gray-800 rounded-lg overflow-hidden border transition-all',
        selectable ? 'cursor-pointer' : '',
        selected
          ? 'border-yellow-400 ring-2 ring-yellow-400'
          : 'border-gray-700 hover:border-gray-500',
      )}
    >
      {/* Selection overlay */}
      {selectable && (
        <div
          className={classNames(
            'absolute top-2 left-2 z-10 w-5 h-5 rounded border-2 flex items-center justify-center transition-colors',
            selected
              ? 'bg-yellow-400 border-yellow-400'
              : 'bg-gray-900/70 border-gray-400',
          )}
        >
          {selected && (
            <svg className="w-3 h-3 text-gray-900" viewBox="0 0 12 12" fill="currentColor">
              <path d="M1 6l3.5 3.5L11 2" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </div>
      )}

      {/* Image */}
      <div className="relative w-full aspect-square bg-gray-900 flex items-center justify-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={image.url}
          alt={image.title ?? image.filename}
          className="max-w-full max-h-full object-contain"
          style={{ imageRendering: 'pixelated' }}
          loading="lazy"
        />
      </div>

      {/* Info */}
      <div className="px-2 py-2 text-xs text-gray-400 space-y-0.5">
        {image.title && (
          <div className="font-semibold text-gray-200 truncate" title={image.title}>{image.title}</div>
        )}
        <div className="font-medium text-gray-300 truncate">{dims}</div>
        {pc && <div className="text-gray-500">{pc}</div>}
        {badge && (
          <div className="text-red-400/80 truncate">{badge}</div>
        )}
        {image.source_tag && (
          <div className="text-gray-600 truncate">#{image.source_tag}</div>
        )}
      </div>
    </div>
  );
}
