'use client';

import { GroupManifest } from '@/server/captions';
import { FolderOpen, Tag, CheckCircle, Clock, Zap, ArrowRight, Trash2 } from 'lucide-react';
import Link from 'next/link';

interface CaptionGroupCardProps {
  group: GroupManifest;
  onDelete?: (groupId: string) => void;
}

const STATUS_LABELS: Record<string, { label: string; color: string; Icon: any }> = {
  draft:          { label: 'Borrador',       color: 'text-gray-400',  Icon: Clock       },
  generating:     { label: 'Generando...',   color: 'text-yellow-400', Icon: Zap        },
  review:         { label: 'En revisión',    color: 'text-blue-400',  Icon: Tag         },
  ready_to_move:  { label: 'Listo',          color: 'text-green-400', Icon: CheckCircle },
  moved:          { label: 'Exportado',      color: 'text-purple-400', Icon: ArrowRight },
};

export default function CaptionGroupCard({ group, onDelete }: CaptionGroupCardProps) {
  const st = STATUS_LABELS[group.status] ?? STATUS_LABELS.draft;
  const StatusIcon = st.Icon;
  const date = new Date(group.created_at).toLocaleDateString('es-ES', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });

  const handleDelete = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (confirm(`¿Eliminar el grupo "${group.name}"? Se borrará la carpeta completa y no se podrá recuperar.`)) {
      onDelete?.(group.id);
    }
  };

  return (
    <div className="relative group/card">
      <Link
        href={`/captions/${group.id}`}
        className="block bg-gray-800 border border-gray-700 rounded-xl p-4 hover:border-gray-500 hover:bg-gray-750 transition-colors group"
      >
        <div className="flex items-start gap-3">
          <div className="bg-gray-700 rounded-lg p-2 mt-0.5">
            <FolderOpen className="w-5 h-5 text-gray-300" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-gray-100 truncate group-hover:text-white">
              {group.name}
            </h3>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-xs text-gray-400">{group.image_count} imágenes</span>
              <span className="text-gray-600">·</span>
              <span className="text-xs text-gray-400">{date}</span>
            </div>
            {group.moved_to && (
              <p className="text-xs text-purple-400 mt-1 truncate">→ {group.moved_to}</p>
            )}
            {group.scraper_folder_label && (
              <p className="text-xs text-gray-500 mt-1 truncate">{group.scraper_folder_label}</p>
            )}
          </div>
          <div className={`flex items-center gap-1 text-xs ${st.color} shrink-0`}>
            <StatusIcon className="w-3.5 h-3.5" />
            <span>{st.label}</span>
          </div>
        </div>
      </Link>
      {onDelete && (
        <button
          onClick={handleDelete}
          title="Eliminar grupo"
          className="absolute top-2 right-2 p-1.5 rounded-lg text-gray-500 hover:text-red-400 hover:bg-gray-700 transition-colors opacity-0 group-hover/card:opacity-100"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}
