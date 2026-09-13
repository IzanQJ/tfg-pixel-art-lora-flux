'use client';

import Link from 'next/link';
import { Home, Settings, BrainCircuit, Images, Plus, Wand2, FolderOpen, GalleryHorizontal, Filter, Tag } from 'lucide-react';
import { FaXTwitter, FaDiscord, FaYoutube } from 'react-icons/fa6';
import { usePipeline } from './PipelineContext';
import {
  BASE_GENERATION_OUTPUT_ID,
  BASE_GENERATION_LABEL,
  formatTrainingFullLabel,
  getGenerationModelOptions,
  sortTrainingOutputIds,
} from '@/utils/trainingCatalog';

const Sidebar = () => {
  const { selectedModel, setSelectedModel, selectedFolder, setSelectedFolder, iterations } = usePipeline();
  const sortedIterations = sortTrainingOutputIds(iterations);
  const hasBaseGallery = sortedIterations.includes(BASE_GENERATION_OUTPUT_ID);
  const trainingIterations = sortedIterations.filter(iter => iter !== BASE_GENERATION_OUTPUT_ID);
  const modelOptions = getGenerationModelOptions(sortedIterations);

  const navigation = [
    { name: 'Generate', href: '/generate', icon: Wand2 },
    { name: 'Dashboard', href: '/dashboard', icon: Home },
    { name: 'New Job', href: '/jobs/new', icon: Plus },
    { name: 'Training Queue', href: '/jobs', icon: BrainCircuit },
    { name: 'Entrenamientos', href: '/trainings', icon: GalleryHorizontal },
    { name: 'Datasets', href: '/datasets', icon: Images },
    { name: 'Captions', href: '/captions', icon: Tag },
    { name: 'Scraper', href: '/scraper', icon: Filter },
    { name: 'Settings', href: '/settings', icon: Settings },
  ];

  const socialsBoxClass =
    'flex flex-col items-center justify-center p-1 hover:bg-gray-800 rounded-lg transition-colors';
  const socialIconClass = 'w-5 h-5 text-gray-400 hover:text-white';

  const handleFolderClick = (iter: string) => {
    setSelectedFolder(selectedFolder === iter ? null : iter);
  };

  return (
    <div className="flex flex-col w-59 bg-gray-900 text-gray-100">
      <div className="px-4 py-3">
        <h1 className="text-l">
          <img src="/ostris_logo.png" alt="Ostris AI Toolkit" className="w-auto h-7 mr-3 inline" />
          <span className="font-bold uppercase">Ostris</span>
          <span className="ml-2 uppercase text-gray-300">AI-Toolkit</span>
        </h1>
      </div>

      {/* Model Selector */}
      <div className="px-4 py-3 border-b border-gray-800">
        <label className="block text-xs uppercase text-gray-500 mb-2 font-medium tracking-wide">
          Modelo de generación
        </label>
        <select
          value={selectedModel}
          onChange={e => setSelectedModel(e.target.value)}
          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:ring-2 focus:ring-yellow-600/50 focus:border-transparent"
        >
          {modelOptions.map(opt => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {/* Navigation */}
      <nav>
        <ul className="px-2 py-3 space-y-1">
          {navigation.map(item => (
            <li key={item.name}>
              <Link
                href={item.href}
                onClick={() => { if (item.href === '/generate') setSelectedFolder(null); }}
                className="flex items-center px-4 py-2 text-gray-300 hover:bg-gray-800 rounded-lg transition-colors"
              >
                <item.icon className="w-5 h-5 mr-3" />
                {item.name}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {/* Base model gallery */}
      {hasBaseGallery && (
        <div className="px-4 py-3 border-t border-gray-800">
          <p className="text-xs uppercase text-gray-500 mb-2 font-medium tracking-wide">
            {BASE_GENERATION_LABEL} (galeria)
          </p>
          <Link
            href="/generate"
            onClick={() => handleFolderClick(BASE_GENERATION_OUTPUT_ID)}
            className={`flex items-center px-3 py-2 rounded-lg text-sm transition-colors ${
              selectedFolder === BASE_GENERATION_OUTPUT_ID
                ? 'bg-yellow-600/20 text-yellow-400 border border-yellow-700/30'
                : 'text-gray-400 hover:bg-gray-800 hover:text-gray-200'
            }`}
          >
            <FolderOpen className="w-4 h-4 mr-2 flex-shrink-0" />
            Imagenes generadas
          </Link>
        </div>
      )}

      {/* Training folders */}
      {trainingIterations.length > 0 && (
        <div className="px-4 py-3 border-t border-gray-800">
          <p className="text-xs uppercase text-gray-500 mb-2 font-medium tracking-wide">Entrenamientos (galeria)</p>
          <ul className="space-y-1">
            {trainingIterations.map(iter => (
              <li key={iter}>
                <Link
                  href="/generate"
                  onClick={() => handleFolderClick(iter)}
                  className={`flex items-center px-3 py-2 rounded-lg text-sm transition-colors ${
                    selectedFolder === iter
                      ? 'bg-yellow-600/20 text-yellow-400 border border-yellow-700/30'
                      : 'text-gray-400 hover:bg-gray-800 hover:text-gray-200'
                  }`}
                >
                  <FolderOpen className="w-4 h-4 mr-2 flex-shrink-0" />
                  {formatTrainingFullLabel(iter)}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex-1" />

      <a
        href="https://ostris.com/support"
        target="_blank"
        rel="noreferrer"
        className="flex items-center space-x-2 px-4 py-3"
      >
        <div className="min-w-[26px] min-h-[26px]">
          <svg height="24" version="1.1" width="24" xmlns="http://www.w3.org/2000/svg">
            <g transform="translate(0 -1028.4)">
              <path
                d="m7 1031.4c-1.5355 0-3.0784 0.5-4.25 1.7-2.3431 2.4-2.2788 6.1 0 8.5l9.25 9.8 9.25-9.8c2.279-2.4 2.343-6.1 0-8.5-2.343-2.3-6.157-2.3-8.5 0l-0.75 0.8-0.75-0.8c-1.172-1.2-2.7145-1.7-4.25-1.7z"
                fill="#c0392b"
              />
            </g>
          </svg>
        </div>
        <div className="uppercase text-gray-500 text-sm mb-2 flex-1 pt-2 pl-0">Support AI-Toolkit</div>
      </a>

      {/* Social links grid */}
      <div className="px-1 py-1 border-t border-gray-800">
        <div className="grid grid-cols-3 gap-4">
          <a href="https://discord.gg/VXmU2f5WEU" target="_blank" rel="noreferrer" className={socialsBoxClass}>
            <FaDiscord className={socialIconClass} />
          </a>
          <a href="https://www.youtube.com/@ostrisai" target="_blank" rel="noreferrer" className={socialsBoxClass}>
            <FaYoutube className={socialIconClass} />
          </a>
          <a href="https://x.com/ostrisai" target="_blank" rel="noreferrer" className={socialsBoxClass}>
            <FaXTwitter className={socialIconClass} />
          </a>
        </div>
      </div>
    </div>
  );
};

export default Sidebar;
