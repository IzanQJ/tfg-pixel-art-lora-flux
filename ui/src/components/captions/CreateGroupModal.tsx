'use client';

import { useEffect, useState, useCallback } from 'react';
import { CheckSquare, Square, X } from 'lucide-react';

interface ManualImage {
  filename: string;
  url: string;
  canvas_pixel_count: number | null;
}

interface ScraperFolder {
  id: string;
  label: string;
  isDefault: boolean;
  manualAcceptedCount: number;
}

type SortOrder = 'size_asc' | 'size_desc';

interface CreateGroupModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (name: string, filenames: string[], scraperFolder: string) => Promise<void>;
}

export default function CreateGroupModal({ isOpen, onClose, onCreate }: CreateGroupModalProps) {
  const [images, setImages] = useState<ManualImage[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sort, setSort] = useState<SortOrder>('size_asc');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [folders, setFolders] = useState<ScraperFolder[]>([]);
  const [scraperFolder, setScraperFolder] = useState('default');

  const loadFolders = useCallback(async () => {
    try {
      const res = await fetch('/api/scraper/folders');
      const data = await res.json();
      setFolders(data.folders ?? []);
    } catch {
      setFolders([]);
    }
  }, []);

  const loadImages = useCallback(async (folder: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/captions/manual-accepted?folder=${encodeURIComponent(folder)}`);
      const data = await res.json();
      setImages(data.images ?? []);
    } catch {
      setImages([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      setScraperFolder('default');
      loadFolders();
      loadImages('default');
      setSelected(new Set());
      setName('');
      setError(null);
    }
  }, [isOpen, loadFolders, loadImages]);

  const handleFolderChange = (folder: string) => {
    setScraperFolder(folder);
    setSelected(new Set());
    loadImages(folder);
  };

  const filtered = [...images].sort((a, b) => {
    const pa = a.canvas_pixel_count ?? 0;
    const pb = b.canvas_pixel_count ?? 0;
    return sort === 'size_asc' ? pa - pb : pb - pa;
  });

  const toggleSelect = (filename: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(filename)) next.delete(filename);
      else next.add(filename);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === filtered.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filtered.map(img => img.filename)));
    }
  };

  const handleCreate = async () => {
    if (!name.trim()) { setError('El nombre del grupo es obligatorio.'); return; }
    if (selected.size === 0) { setError('Selecciona al menos una imagen.'); return; }
    setCreating(true);
    setError(null);
    try {
      await onCreate(name.trim(), Array.from(selected), scraperFolder);
      onClose();
    } catch (e: any) {
      setError(e.message ?? 'Error al crear el grupo');
    } finally {
      setCreating(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/75 backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="relative flex flex-col bg-gray-800 border border-gray-700 rounded-xl shadow-xl overflow-hidden"
        style={{ width: '70vw', height: '60vh' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700 shrink-0">
          <h3 className="text-lg font-semibold text-gray-100">Crear grupo de captions</h3>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-gray-700 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex flex-col gap-4 px-6 py-4 flex-1 min-h-0">
          {/* Scraper folder */}
          <div className="shrink-0">
            <label className="block text-sm text-gray-300 mb-1">Carpeta del scraper</label>
            <select
              value={scraperFolder}
              onChange={e => handleFolderChange(e.target.value)}
              className="w-full bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:ring-2 focus:ring-yellow-600/50"
            >
              {folders.length === 0 ? (
                <option value="default">Pixilart principal</option>
              ) : (
                folders.map(folder => (
                  <option key={folder.id} value={folder.id}>
                    {folder.label} ({folder.manualAcceptedCount} imagenes)
                  </option>
                ))
              )}
            </select>
          </div>

          {/* Group name */}
          <div className="shrink-0">
            <label className="block text-sm text-gray-300 mb-1">Nombre del grupo</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="ej. pixel_art_batch_01"
              className="w-full bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:ring-2 focus:ring-yellow-600/50"
            />
          </div>

          {/* Sort + select-all + count */}
          <div className="flex items-center gap-2 shrink-0">
            <select
              value={sort}
              onChange={e => setSort(e.target.value as SortOrder)}
              className="bg-gray-900 border border-gray-600 rounded-lg px-2 py-1.5 text-xs text-gray-300 focus:outline-none focus:ring-1 focus:ring-yellow-600/50"
            >
              <option value="size_asc">Tamaño: menor a mayor</option>
              <option value="size_desc">Tamaño: mayor a menor</option>
            </select>
            <p className="text-xs text-gray-400 flex-1">
              {selected.size} de {filtered.length} seleccionadas
            </p>
            <button
              onClick={toggleAll}
              className="flex items-center gap-1.5 text-sm text-gray-300 hover:text-white px-3 py-1.5 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors"
            >
              {selected.size === filtered.length && filtered.length > 0
                ? <CheckSquare className="w-4 h-4" />
                : <Square className="w-4 h-4" />}
              {selected.size === filtered.length && filtered.length > 0
                ? 'Deseleccionar todas'
                : 'Seleccionar todas'}
            </button>
          </div>

          {/* Grid — fills remaining height */}
          <div className="flex-1 overflow-y-auto min-h-0">
            {loading ? (
              <div className="flex items-center justify-center h-full text-gray-400 text-sm">
                Cargando imágenes...
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex items-center justify-center h-full text-gray-400 text-sm">
                No hay imagenes en manual_accepted para esta carpeta.
              </div>
            ) : (
              <div className="grid grid-cols-[repeat(auto-fill,minmax(100px,1fr))] gap-2 pr-1">
                {filtered.map(img => {
                  const isSel = selected.has(img.filename);
                  return (
                    <button
                      key={img.filename}
                      onClick={() => toggleSelect(img.filename)}
                      className={`relative aspect-square rounded-lg overflow-hidden border-2 transition-all ${
                        isSel
                          ? 'border-yellow-500 ring-1 ring-yellow-500/40'
                          : 'border-gray-600 hover:border-gray-400'
                      }`}
                      title={img.filename}
                    >
                      <img
                        src={img.url}
                        alt={img.filename}
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                      {isSel && (
                        <div className="absolute inset-0 bg-yellow-500/20 flex items-center justify-center">
                          <CheckSquare className="w-5 h-5 text-yellow-400 drop-shadow" />
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Error */}
          {error && <p className="text-sm text-red-400 shrink-0">{error}</p>}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-6 py-4 border-t border-gray-700 shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-300 hover:text-white bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleCreate}
            disabled={creating}
            className="px-4 py-2 text-sm font-medium text-black bg-yellow-500 hover:bg-yellow-400 rounded-lg transition-colors disabled:opacity-60"
          >
            {creating ? 'Creando...' : `Crear grupo (${selected.size})`}
          </button>
        </div>
      </div>
    </div>
  );
}
