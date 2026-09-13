'use client';

import { useRef, useEffect, useState } from 'react';
import { GroupImage } from '@/server/captions';

interface CaptionImageCardProps {
  image: GroupImage;
  onChange: (filename: string, caption: string) => void;
  onSave: (filename: string, caption: string) => void;
  isSaving?: boolean;
}

export default function CaptionImageCard({
  image,
  onChange,
  onSave,
  isSaving = false,
}: CaptionImageCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [inViewport, setInViewport] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      entries => {
        if (entries[0].isIntersecting) setInViewport(true);
      },
      { threshold: 0.05, rootMargin: '200px' },
    );
    if (cardRef.current) observer.observe(cardRef.current);
    return () => observer.disconnect();
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSave(image.filename, image.caption);
      textareaRef.current?.blur();
    }
  };

  return (
    <div
      ref={cardRef}
      className="bg-gray-800 border border-gray-700 rounded-xl overflow-hidden flex flex-col"
    >
      {/* Image */}
      <div className="relative w-full aspect-square bg-gray-900 flex items-center justify-center">
        {inViewport ? (
          <>
            {!loaded && (
              <div className="absolute inset-0 animate-pulse bg-gray-700 rounded-t-xl" />
            )}
            <img
              src={image.url}
              alt={image.filename}
              className={`w-full h-full object-contain transition-opacity duration-200 ${loaded ? 'opacity-100' : 'opacity-0'}`}
              onLoad={() => setLoaded(true)}
              loading="lazy"
            />
          </>
        ) : (
          <div className="w-full h-full bg-gray-700 animate-pulse" />
        )}
      </div>

      {/* Caption */}
      <div className="p-2 flex flex-col gap-1">
        <p className="text-xs text-gray-500 truncate" title={image.filename}>
          {image.filename}
        </p>
        <textarea
          ref={textareaRef}
          value={image.caption}
          onChange={e => onChange(image.filename, e.target.value)}
          onBlur={() => onSave(image.filename, image.caption)}
          onKeyDown={handleKeyDown}
          rows={6}
          placeholder="Caption vacío..."
          className={`w-full bg-gray-900 border rounded-lg px-2 py-1.5 text-sm text-gray-200 resize-y focus:outline-none focus:ring-1 focus:ring-yellow-600/60 transition-colors ${
            isSaving ? 'border-yellow-600/50' : 'border-gray-600'
          }`}
        />
      </div>
    </div>
  );
}
