'use client';

import classNames from 'classnames';
import { Trash2, Scissors } from 'lucide-react';

export type ScraperView = 'accepted' | 'rejected' | 'manual_accepted';
export type SortOrder   = 'asc' | 'desc';

interface Props {
  view: ScraperView;
  sort: SortOrder;
  total: number;
  cleanMode: boolean;
  selectedCount: number;
  deleting: boolean;
  onViewChange: (v: ScraperView) => void;
  onSortChange: (s: SortOrder) => void;
  onEnterClean: () => void;
  onCancelClean: () => void;
  onDeleteSelected: () => void;
}

const VIEWS: { value: ScraperView; label: string }[] = [
  { value: 'rejected',        label: 'Rechazadas' },
  { value: 'accepted',        label: 'Aceptadas' },
  { value: 'manual_accepted', label: 'Manual accepted' },
];

export default function ScraperToolbar({
  view,
  sort,
  total,
  cleanMode,
  selectedCount,
  deleting,
  onViewChange,
  onSortChange,
  onEnterClean,
  onCancelClean,
  onDeleteSelected,
}: Props) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      {/* View tabs */}
      <div className="flex bg-gray-800 rounded-lg p-0.5 gap-0.5">
        {VIEWS.map(v => (
          <button
            key={v.value}
            onClick={() => onViewChange(v.value)}
            className={classNames(
              'px-3 py-1.5 rounded-md text-sm font-medium transition-colors',
              view === v.value
                ? 'bg-gray-600 text-white'
                : 'text-gray-400 hover:text-gray-200 hover:bg-gray-700',
            )}
          >
            {v.label}
          </button>
        ))}
      </div>

      {/* Sort */}
      <select
        value={sort}
        onChange={e => onSortChange(e.target.value as SortOrder)}
        className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-gray-300 focus:outline-none focus:ring-2 focus:ring-yellow-600/50"
      >
        <option value="asc">Tamaño: menor a mayor</option>
        <option value="desc">Tamaño: mayor a menor</option>
      </select>

      {/* Counter */}
      <span className="text-sm text-gray-500 ml-1">
        {total} imagen{total !== 1 ? 'es' : ''}
        {cleanMode && selectedCount > 0 && (
          <span className="ml-1 text-yellow-400">· {selectedCount} seleccionadas</span>
        )}
      </span>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Clean controls — only in manual_accepted */}
      {view === 'manual_accepted' && (
        <>
          {!cleanMode ? (
            <button
              onClick={onEnterClean}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-200 rounded-lg text-sm transition-colors"
            >
              <Scissors className="w-4 h-4" />
              Limpiar imágenes
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <button
                onClick={onCancelClean}
                className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg text-sm transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={onDeleteSelected}
                disabled={selectedCount === 0 || deleting}
                className={classNames(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors',
                  selectedCount > 0 && !deleting
                    ? 'bg-red-600 hover:bg-red-500 text-white'
                    : 'bg-gray-700 text-gray-500 cursor-not-allowed',
                )}
              >
                <Trash2 className="w-4 h-4" />
                {deleting
                  ? 'Eliminando…'
                  : `Eliminar definitivamente${selectedCount > 0 ? ` (${selectedCount})` : ''}`}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
