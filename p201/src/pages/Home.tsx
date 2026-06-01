import { useState } from 'react';
import { Toolbar } from '@/components/Toolbar';
import { ConfigTree } from '@/components/ConfigTree';
import { ConfigDetail } from '@/components/ConfigDetail';
import { FileUploadModal } from '@/components/FileUploadModal';
import { DiffPanel } from '@/components/DiffPanel';
import { Terminal } from 'lucide-react';

export default function Home() {
  const [uploadModalOpen, setUploadModalOpen] = useState(false);

  return (
    <div className="h-screen flex flex-col bg-[#0d1117] text-gray-200">
      <header className="flex items-center gap-3 px-4 py-2 bg-gray-900 border-b border-gray-700">
        <Terminal className="w-6 h-6 text-green-400" />
        <h1 className="text-lg font-bold">
          <span className="text-green-400">Kconfig</span>
          <span className="text-gray-400 ml-1">Web Editor</span>
        </h1>
        <span className="text-xs text-gray-600 ml-2 font-mono">
          menuconfig style
        </span>
      </header>

      <Toolbar onUploadClick={() => setUploadModalOpen(true)} />

      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 border-r border-gray-700 overflow-hidden">
          <ConfigTree />
        </div>
        <div className="w-80 bg-gray-900/50 overflow-y-auto p-3 space-y-3">
          <ConfigDetail />
          <DiffPanel />
        </div>
      </div>

      <FileUploadModal
        isOpen={uploadModalOpen}
        onClose={() => setUploadModalOpen(false)}
      />
    </div>
  );
}
