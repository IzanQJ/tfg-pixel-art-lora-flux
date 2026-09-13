'use client';

import { useEffect, useState, useCallback } from 'react';
import { Modal } from '@/components/Modal';
import { formatDatasetLabel } from '@/utils/trainingCatalog';

interface MoveToDatasetModalProps {
  isOpen: boolean;
  onClose: () => void;
  onMove: (datasetName: string, triggerWord: string) => Promise<void>;
  defaultTriggerWord?: string;
}

export default function MoveToDatasetModal({
  isOpen,
  onClose,
  onMove,
  defaultTriggerWord = 'pixelart',
}: MoveToDatasetModalProps) {
  const [datasets, setDatasets] = useState<string[]>([]);
  const [selected, setSelected] = useState('');
  const [triggerWord, setTriggerWord] = useState(defaultTriggerWord);
  const [loading, setLoading] = useState(false);
  const [moving, setMoving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadDatasets = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/captions/datasets');
      const data = await res.json();
      const list: string[] = data.datasets ?? [];
      setDatasets(list);
      if (list.length > 0) setSelected(list[list.length - 1]);
    } catch {
      setDatasets([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      loadDatasets();
      setError(null);
      setTriggerWord(defaultTriggerWord);
    }
  }, [isOpen, loadDatasets, defaultTriggerWord]);

  const handleMove = async () => {
    if (!selected) { setError('Selecciona un dataset de destino.'); return; }
    setMoving(true);
    setError(null);
    try {
      await onMove(selected, triggerWord);
      onClose();
    } catch (e: any) {
      setError(e.message ?? 'Error al mover al dataset');
    } finally {
      setMoving(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Mover al dataset de entrenamiento" size="md">
      <div className="flex flex-col gap-5">
        <p className="text-sm text-gray-400">
          Las imágenes y sus captions se copiarán al dataset seleccionado. El grupo permanece con su historial.
        </p>

        {/* Trigger word */}
        <div>
          <label className="block text-sm text-gray-300 mb-1">Trigger word</label>
          <input
            type="text"
            value={triggerWord}
            onChange={e => setTriggerWord(e.target.value)}
            className="w-full bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:ring-2 focus:ring-yellow-600/50"
          />
          <p className="text-xs text-gray-500 mt-1">
            Se añadirá al inicio de los archivos .txt de caption.
          </p>
        </div>

        {/* Dataset selector */}
        <div>
          <label className="block text-sm text-gray-300 mb-1">Dataset de destino</label>
          {loading ? (
            <p className="text-sm text-gray-400">Cargando datasets...</p>
          ) : datasets.length === 0 ? (
            <p className="text-sm text-yellow-400">No hay datasets disponibles.</p>
          ) : (
            <select
              value={selected}
              onChange={e => setSelected(e.target.value)}
              className="w-full bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:ring-2 focus:ring-yellow-600/50"
            >
              {datasets.map(d => (
                <option key={d} value={d}>{formatDatasetLabel(d)}</option>
              ))}
            </select>
          )}
        </div>

        {/* Error */}
        {error && <p className="text-sm text-red-400">{error}</p>}

        {/* Actions */}
        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-300 hover:text-white bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleMove}
            disabled={moving || loading || datasets.length === 0}
            className="px-4 py-2 text-sm font-medium text-black bg-yellow-500 hover:bg-yellow-400 rounded-lg transition-colors disabled:opacity-60"
          >
            {moving ? 'Moviendo...' : 'Mover al dataset'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
