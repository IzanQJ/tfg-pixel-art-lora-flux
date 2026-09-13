'use client';

import { useState } from 'react';
import { Modal } from '@/components/Modal';

const DEFAULT_MODEL = 'Qwen/Qwen2.5-VL-7B-Instruct';

interface GenerateCaptionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onGenerate: (opts: {
    triggerWord: string;
    detailLevel: 'short' | 'medium' | 'detailed';
    overwriteMode: 'empty_only' | 'overwrite_all';
  }) => Promise<void>;
}

export default function GenerateCaptionsModal({
  isOpen,
  onClose,
  onGenerate,
}: GenerateCaptionsModalProps) {
  const [triggerWord, setTriggerWord] = useState('pixelart');
  const [detailLevel, setDetailLevel] = useState<'short' | 'medium' | 'detailed'>('short');
  const [overwriteMode, setOverwriteMode] = useState<'empty_only' | 'overwrite_all'>('empty_only');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    setLoading(true);
    setError(null);
    try {
      await onGenerate({ triggerWord, detailLevel, overwriteMode });
      onClose();
    } catch (e: any) {
      setError(e.message ?? 'Error al iniciar la generación');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Generar captions automáticos" size="md">
      <div className="flex flex-col gap-5">
        {/* Modelo (readonly) */}
        <div>
          <label className="block text-sm text-gray-300 mb-1">Modelo de visión</label>
          <input
            type="text"
            value={DEFAULT_MODEL}
            readOnly
            className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-400 cursor-default"
          />
          <p className="text-xs text-gray-500 mt-1">
            Usa cuantización 4-bit (bitsandbytes). Requiere ~10 GB VRAM.
          </p>
        </div>

        {/* Trigger word */}
        <div>
          <label className="block text-sm text-gray-300 mb-1">Trigger word</label>
          <input
            type="text"
            value={triggerWord}
            onChange={e => setTriggerWord(e.target.value)}
            className="w-full bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:ring-2 focus:ring-yellow-600/50"
            placeholder="pixelart"
          />
          <p className="text-xs text-gray-500 mt-1">
            Se añadirá al principio de cada caption.
          </p>
        </div>

        {/* Nivel de detalle */}
        <div>
          <label className="block text-sm text-gray-300 mb-2">Nivel de detalle</label>
          <div className="flex gap-2">
            {(['short', 'medium', 'detailed'] as const).map(lvl => {
              const labels = { short: 'Corto', medium: 'Medio', detailed: 'Detallado' };
              return (
                <button
                  key={lvl}
                  onClick={() => setDetailLevel(lvl)}
                  className={`flex-1 py-2 rounded-lg text-sm border transition-colors ${
                    detailLevel === lvl
                      ? 'bg-yellow-500 border-yellow-500 text-black font-medium'
                      : 'bg-gray-800 border-gray-600 text-gray-300 hover:border-gray-400'
                  }`}
                >
                  {labels[lvl]}
                </button>
              );
            })}
          </div>
        </div>

        {/* Modo de sobrescritura */}
        <div>
          <label className="block text-sm text-gray-300 mb-2">Modo de sobrescritura</label>
          <div className="flex gap-2">
            {[
              { value: 'empty_only', label: 'Solo vacíos' },
              { value: 'overwrite_all', label: 'Sobrescribir todos' },
            ].map(opt => (
              <button
                key={opt.value}
                onClick={() => setOverwriteMode(opt.value as any)}
                className={`flex-1 py-2 rounded-lg text-sm border transition-colors ${
                  overwriteMode === opt.value
                    ? 'bg-yellow-500 border-yellow-500 text-black font-medium'
                    : 'bg-gray-800 border-gray-600 text-gray-300 hover:border-gray-400'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
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
            onClick={handleSubmit}
            disabled={loading}
            className="px-4 py-2 text-sm font-medium text-black bg-yellow-500 hover:bg-yellow-400 rounded-lg transition-colors disabled:opacity-60"
          >
            {loading ? 'Iniciando...' : 'Generar captions'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
