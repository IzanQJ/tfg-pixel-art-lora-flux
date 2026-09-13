'use client';

import { useState } from 'react';
import { Modal } from '@/components/Modal';
import Link from 'next/link';
import { TextInput } from '@/components/formInputs';
import useDatasetList from '@/hooks/useDatasetList';
import { Button } from '@headlessui/react';
import { FaRegTrashAlt } from 'react-icons/fa';
import { openConfirm } from '@/components/ConfirmModal';
import { TopBar, MainContent } from '@/components/layout';
import UniversalTable, { TableColumn } from '@/components/UniversalTable';
import { apiClient } from '@/utils/api';
import { useRouter } from 'next/navigation';
import { FolderOpen, Loader2 } from 'lucide-react';
import { formatDatasetLabel } from '@/utils/trainingCatalog';

export default function Datasets() {
  const router = useRouter();
  const { datasets, status, refreshDatasets } = useDatasetList();
  const [newDatasetName, setNewDatasetName] = useState('');
  const [isNewDatasetModalOpen, setIsNewDatasetModalOpen] = useState(false);

  // Transform datasets array into rows with objects
  const tableRows = datasets.map(dataset => ({
    name: dataset,
    actions: dataset, // Pass full dataset name for actions
  }));

  const columns: TableColumn[] = [
    {
      title: 'Dataset Name',
      key: 'name',
      render: row => (
        <Link href={`/datasets/${row.name}`} className="text-gray-200 hover:text-gray-100">
          {row.name}
        </Link>
      ),
    },
    {
      title: 'Actions',
      key: 'actions',
      className: 'w-20 text-right',
      render: row => (
        <button
          className="text-gray-200 hover:bg-red-600 p-2 rounded-full transition-colors"
          onClick={() => handleDeleteDataset(row.name)}
        >
          <FaRegTrashAlt />
        </button>
      ),
    },
  ];

  const handleDeleteDataset = (datasetName: string) => {
    openConfirm({
      title: 'Eliminar dataset',
      message: `¿Seguro que quieres eliminar el dataset "${datasetName}"? Esta accion no se puede deshacer.`,
      type: 'warning',
      confirmText: 'Eliminar',
      onConfirm: () => {
        apiClient
          .post('/api/datasets/delete', { name: datasetName })
          .then(() => {
            console.log('Dataset deleted:', datasetName);
            refreshDatasets();
          })
          .catch(error => {
            console.error('Error deleting dataset:', error);
          });
      },
    });
  };

  const handleCreateDataset = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const data = await apiClient.post('/api/datasets/create', { name: newDatasetName }).then(res => res.data);
      console.log('New dataset created:', data);
      refreshDatasets();
      setNewDatasetName('');
      setIsNewDatasetModalOpen(false);
    } catch (error) {
      console.error('Error creating new dataset:', error);
    }
  };

  const openNewDatasetModal = () => {
    openConfirm({
      title: 'Nuevo dataset',
      message: 'Introduce el nombre del nuevo dataset:',
      type: 'info',
      confirmText: 'Crear',
      inputTitle: 'Nombre del dataset',
      onConfirm: async (name?: string) => {
        if (!name) {
          console.error('Dataset name is required.');
          return;
        }
        try {
          const data = await apiClient.post('/api/datasets/create', { name }).then(res => res.data);
          console.log('New dataset created:', data);
          if (data.name) {
            router.push(`/datasets/${data.name}`);
          } else {
            refreshDatasets();
          }
        } catch (error) {
          console.error('Error creating new dataset:', error);
        }
      },
    });
  };

  return (
    <>
      <div className="flex flex-col h-full">
        <div className="border-b border-gray-800 px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-gray-100">Datasets</h1>
            <p className="text-sm text-gray-400 mt-1">Datasets de entrenamiento disponibles en datasets/</p>
          </div>
          <Button
            className="text-gray-200 bg-slate-600 px-4 py-2 rounded-md hover:bg-slate-500 transition-colors text-sm"
            onClick={() => openNewDatasetModal()}
          >
            Nuevo dataset
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-6">
          {status === 'loading' ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="w-8 h-8 animate-spin text-gray-500" />
            </div>
          ) : datasets.length === 0 ? (
            <div className="flex items-center justify-center h-full text-gray-500">
              <p>No se encontraron datasets en datasets/</p>
            </div>
          ) : (
            <div className="flex flex-nowrap gap-4 overflow-x-auto pb-3">
              {datasets.map(dataset => (
                <div
                  key={dataset}
                  className="flex w-80 flex-none items-center gap-4 px-5 py-4 bg-gray-800 border border-gray-700 rounded-xl hover:border-yellow-600/60 hover:bg-gray-750 transition-colors group relative"
                >
                  <Link href={`/datasets/${dataset}`} className="flex items-center gap-4 flex-1 min-w-0">
                    <FolderOpen className="w-8 h-8 text-yellow-500 group-hover:text-yellow-400 flex-shrink-0" />
                    <div className="min-w-0">
                      <p className="text-gray-100 font-medium truncate">{formatDatasetLabel(dataset)}</p>
                      <p className="text-xs text-gray-400 mt-0.5 truncate">Carpeta: {dataset}</p>
                    </div>
                  </Link>
                  <button
                    className="text-gray-500 hover:text-red-400 hover:bg-red-900/30 p-2 rounded-full transition-colors flex-shrink-0"
                    onClick={() => handleDeleteDataset(dataset)}
                  >
                    <FaRegTrashAlt className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <Modal
        isOpen={isNewDatasetModalOpen}
        onClose={() => setIsNewDatasetModalOpen(false)}
        title="Nuevo dataset"
        size="md"
      >
        <div className="space-y-4 text-gray-200">
          <form onSubmit={handleCreateDataset}>
            <div className="text-sm text-gray-400">
              Se creara una nueva carpeta con este nombre dentro de la carpeta de datasets.
            </div>
            <div className="mt-4">
              <TextInput label="Nombre del dataset" value={newDatasetName} onChange={value => setNewDatasetName(value)} />
            </div>

            <div className="mt-6 flex justify-end space-x-3">
              <button
                type="button"
                className="rounded-md bg-gray-700 px-4 py-2 text-gray-200 hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-gray-500"
                onClick={() => setIsNewDatasetModalOpen(false)}
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="rounded-md bg-yellow-500 px-4 py-2 text-black hover:bg-yellow-400 focus:outline-none focus:ring-2 focus:ring-yellow-600/50"
              >
                Crear
              </button>
            </div>
          </form>
        </div>
      </Modal>
    </>
  );
}
