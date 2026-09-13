'use client';

import { usePipeline } from '@/components/PipelineContext';
import GenerateChat from '@/components/GenerateChat';
import GalleryView from '@/components/GalleryView';

export default function GeneratePage() {
  const { selectedFolder } = usePipeline();

  return selectedFolder ? <GalleryView /> : <GenerateChat />;
}
