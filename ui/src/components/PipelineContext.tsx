'use client';

import React, { createContext, useCallback, useContext, useState, useEffect, ReactNode } from 'react';
import { getGenerationModelOptions, sortTrainingOutputIds } from '@/utils/trainingCatalog';

export type ModelOption = 'base' | string; // 'base' | 'iter_01' | 'iter_02' | ...

interface PipelineContextValue {
  selectedModel: ModelOption;
  setSelectedModel: (m: ModelOption) => void;
  selectedFolder: string | null; // null = chat, 'iter_01' = gallery
  setSelectedFolder: (f: string | null) => void;
  iterations: string[];
}

const PipelineContext = createContext<PipelineContextValue>({
  selectedModel: 'base',
  setSelectedModel: () => {},
  selectedFolder: null,
  setSelectedFolder: () => {},
  iterations: [],
});

export function PipelineProvider({ children }: { children: ReactNode }) {
  const [selectedModel, setSelectedModel] = useState<ModelOption>('base');
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  const [iterations, setIterations] = useState<string[]>([]);

  const loadIterations = useCallback(() => {
    fetch('/api/iterations')
      .then(r => r.json())
      .then(data => {
        if (!data.iterations) return;

        const sortedIterations = sortTrainingOutputIds(data.iterations);
        setIterations(sortedIterations);
        setSelectedFolder(current => (current && !sortedIterations.includes(current) ? null : current));
        setSelectedModel(current => {
          const modelOptions = getGenerationModelOptions(sortedIterations);
          return modelOptions.some(option => option.value === current) ? current : 'base';
        });
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    loadIterations();

    window.addEventListener('pipeline:iterations-changed', loadIterations);
    const intervalId = window.setInterval(loadIterations, 15000);

    return () => {
      window.removeEventListener('pipeline:iterations-changed', loadIterations);
      window.clearInterval(intervalId);
    };
  }, [loadIterations]);

  return (
    <PipelineContext.Provider value={{ selectedModel, setSelectedModel, selectedFolder, setSelectedFolder, iterations }}>
      {children}
    </PipelineContext.Provider>
  );
}

export function usePipeline() {
  return useContext(PipelineContext);
}
