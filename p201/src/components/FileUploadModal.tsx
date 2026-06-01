import { useRef } from 'react';
import { Upload, X, FileCode } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useKconfigStore } from '@/store/kconfigStore';
import { apiClient } from '@/utils/api';

interface FileUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function FileUploadModal({ isOpen, onClose }: FileUploadModalProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const { loadKconfig } = useKconfigStore();

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const result = await apiClient.parseFile(file);
      loadKconfig(result);
      onClose();
    } catch (error) {
      console.error('Failed to parse file:', error);
      alert('Failed to parse Kconfig file. Please check the format.');
    }

    if (inputRef.current) {
      inputRef.current.value = '';
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
      <div className="bg-gray-900 rounded-lg border border-gray-700 w-full max-w-md mx-4">
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          <h2 className="text-lg font-semibold text-gray-200">Upload Kconfig File</h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-700 rounded transition-colors"
          >
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        <div className="p-6">
          <label className="block cursor-pointer">
            <div className={cn(
              'border-2 border-dashed rounded-lg p-8 text-center transition-colors',
              'border-gray-600 hover:border-green-500 hover:bg-gray-800/50'
            )}>
              <FileCode className="w-12 h-12 mx-auto mb-4 text-gray-500" />
              <p className="text-gray-300 mb-2">
                Click to select a Kconfig file
              </p>
              <p className="text-sm text-gray-500">
                Supports standard Kconfig format from Linux kernel
              </p>
            </div>
            <input
              ref={inputRef}
              type="file"
              accept=".config,Kconfig*"
              onChange={handleFileSelect}
              className="hidden"
            />
          </label>
        </div>
      </div>
    </div>
  );
}
