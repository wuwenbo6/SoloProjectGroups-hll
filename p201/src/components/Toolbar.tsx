import { useState } from 'react';
import {
  Upload,
  ChevronDown,
  ChevronUp,
  Download,
  RotateCcw,
  FileText,
  Search,
  Scissors,
} from 'lucide-react';
import { useKconfigStore } from '@/store/kconfigStore';
import { apiClient } from '@/utils/api';
import { MinimalConfigModal } from './MinimalConfigModal';

interface ToolbarProps {
  onUploadClick: () => void;
}

export function Toolbar({ onUploadClick }: ToolbarProps) {
  const {
    loaded,
    values,
    symbols,
    searchQuery,
    setSearchQuery,
    expandAll,
    collapseAll,
    reset,
  } = useKconfigStore();

  const [showMinimalModal, setShowMinimalModal] = useState(false);

  const handleDownload = async () => {
    if (!loaded) return;
    try {
      const config = await apiClient.generateConfig(values, symbols);
      const blob = new Blob([config], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = '.config';
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
    }
  };

  const handleLoadSample = async () => {
    try {
      const result = await apiClient.loadSample();
      useKconfigStore.getState().loadKconfig(result);
    } catch (err) {
      console.error(err);
    }
  };

  const handleReset = () => {
    reset();
  };

  return (
    <div className="flex items-center gap-2 px-4 py-2 bg-gray-800/50 border-b border-gray-700">
      <button
        onClick={onUploadClick}
        className="flex items-center gap-2 px-3 py-1.5 text-sm bg-green-600 hover:bg-green-500 text-white rounded transition-colors"
      >
        <Upload className="w-4 h-4" />
        Upload
      </button>

      <button
        onClick={handleLoadSample}
        className="flex items-center gap-2 px-3 py-1.5 text-sm bg-gray-700 hover:bg-gray-600 text-gray-200 rounded transition-colors"
      >
        <FileText className="w-4 h-4" />
        Load Sample
      </button>

      <div className="h-6 w-px bg-gray-600 mx-1" />

      <button
        onClick={expandAll}
        disabled={!loaded}
        className="flex items-center gap-1 px-2 py-1.5 text-sm bg-gray-700 hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed text-gray-200 rounded transition-colors"
      >
        <ChevronDown className="w-4 h-4" />
        Expand All
      </button>

      <button
        onClick={collapseAll}
        disabled={!loaded}
        className="flex items-center gap-1 px-2 py-1.5 text-sm bg-gray-700 hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed text-gray-200 rounded transition-colors"
      >
        <ChevronUp className="w-4 h-4" />
        Collapse All
      </button>

      <div className="h-6 w-px bg-gray-600 mx-1" />

      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
        <input
          type="text"
          placeholder="Search config..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          disabled={!loaded}
          className="pl-9 pr-3 py-1.5 text-sm bg-gray-900 border border-gray-600 rounded focus:outline-none focus:border-green-500 disabled:opacity-50 disabled:cursor-not-allowed w-64"
        />
      </div>

      <div className="flex-1" />

      <button
        onClick={() => setShowMinimalModal(true)}
        disabled={!loaded}
        className="px-3 py-1.5 text-sm font-mono bg-purple-900/50 text-purple-300 rounded hover:bg-purple-800 transition-colors flex items-center gap-1.5"
      >
        <Scissors className="w-4 h-4" />
        Minimal
      </button>

      <button
        onClick={handleDownload}
        disabled={!loaded}
        className="flex items-center gap-2 px-3 py-1.5 text-sm bg-gray-700 hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed text-gray-200 rounded transition-colors"
      >
        <Download className="w-4 h-4" />
        Save
      </button>

      <button
        onClick={handleReset}
        disabled={!loaded}
        className="flex items-center gap-2 px-3 py-1.5 text-sm bg-red-600/80 hover:bg-red-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded transition-colors"
      >
        <RotateCcw className="w-4 h-4" />
        Reset
      </button>

      {showMinimalModal && (
        <MinimalConfigModal onClose={() => setShowMinimalModal(false)} />
      )}
    </div>
  );
}
