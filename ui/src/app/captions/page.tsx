'use client';

import { useCallback, useEffect, useState } from 'react';
import { Plus, RefreshCw } from 'lucide-react';
import { TopBar, MainContent } from '@/components/layout';
import CaptionGroupCard from '@/components/captions/CaptionGroupCard';
import CreateGroupModal from '@/components/captions/CreateGroupModal';
import { GroupManifest } from '@/server/captions';

export default function CaptionsPage() {
  const [groups, setGroups] = useState<GroupManifest[]>([]);
  const [loading, setLoading] = useState(false);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const showFeedback = (msg: string) => {
    setFeedback(msg);
    setTimeout(() => setFeedback(null), 3000);
  };

  const loadGroups = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/captions/groups');
      const data = await res.json();
      setGroups(data.groups ?? []);
    } catch {
      setGroups([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadGroups();
  }, [loadGroups]);

  const handleCreate = async (name: string, filenames: string[], scraperFolder: string) => {
    const res = await fetch('/api/captions/groups', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, filenames, scraperFolder }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? 'Error al crear grupo');
    showFeedback(`Grupo "${name}" creado con ${filenames.length} imágenes.`);
    await loadGroups();
  };

  const handleDelete = async (groupId: string) => {
    const res = await fetch(`/api/captions/groups/${groupId}`, { method: 'DELETE' });
    if (res.ok) {
      showFeedback('Grupo eliminado.');
      await loadGroups();
    } else {
      const data = await res.json();
      showFeedback(`Error: ${data.error ?? 'No se pudo eliminar'}`);
    }
  };

  return (
    <>
      <TopBar>
        <div className="flex items-center gap-2 px-2 w-full">
          <h2 className="text-sm font-semibold text-gray-200 flex-1">Captions</h2>
          {feedback && (
            <span className="text-xs text-green-400 px-2">{feedback}</span>
          )}
          <button
            onClick={loadGroups}
            disabled={loading}
            className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
            title="Recargar"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={() => setIsCreateOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-black bg-yellow-500 hover:bg-yellow-400 rounded-lg transition-colors"
          >
            <Plus className="w-4 h-4" />
            Crear grupo
          </button>
        </div>
      </TopBar>

      <MainContent>
        {loading && groups.length === 0 ? (
          <div className="flex items-center justify-center h-40 text-gray-400 text-sm">
            Cargando grupos...
          </div>
        ) : groups.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 gap-4 text-gray-400">
            <p className="text-sm">No hay grupos de captions todavía.</p>
            <button
              onClick={() => setIsCreateOpen(true)}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-black bg-yellow-500 hover:bg-yellow-400 rounded-lg transition-colors"
            >
              <Plus className="w-4 h-4" />
              Crear primer grupo
            </button>
          </div>
        ) : (
          <div className="flex flex-nowrap gap-4 overflow-x-auto py-4">
            {groups.map(g => (
              <div key={g.id} className="w-80 flex-none">
                <CaptionGroupCard group={g} onDelete={handleDelete} />
              </div>
            ))}
          </div>
        )}
      </MainContent>

      <CreateGroupModal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        onCreate={handleCreate}
      />
    </>
  );
}
