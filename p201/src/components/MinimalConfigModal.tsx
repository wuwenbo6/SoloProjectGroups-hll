import { useState } from 'react';
import { useKconfigStore } from '@/store/kconfigStore';
import { X, Scissors, Download, CheckCircle, Loader2 } from 'lucide-react';

interface MinimalConfigModalProps {
  onClose: () => void;
}

export function MinimalConfigModal({ onClose }: MinimalConfigModalProps) {
  const generateMinimal = useKconfigStore((s) => s.generateMinimal);
  const applyMinimalConfig = useKconfigStore((s) => s.applyMinimalConfig);
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [applied, setApplied] = useState(false);

  const handleGenerate = async () => {
    setLoading(true);
    try {
      const r = await generateMinimal();
      setResult(r);
    } finally {
      setLoading(false);
    }
  };

  const handleApply = () => {
    if (result) {
      applyMinimalConfig(result);
      setApplied(true);
    }
  };

  const handleDownload = () => {
    if (!result) return;
    const blob = new Blob([result.config], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = '.minimal.config';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
      <div className="bg-gray-900 rounded-lg border border-gray-700 w-full max-w-lg mx-4">
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          <div className="flex items-center gap-2 text-gray-200">
            <Scissors className="w-5 h-5 text-purple-400" />
            <span className="font-mono">Generate Minimal Config</span>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-200">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4">
          {!result && !loading && (
            <div className="text-center py-8">
              <Scissors className="w-16 h-16 text-purple-400 mx-auto mb-4 opacity-50" />
              <p className="text-gray-400 mb-4">
                Remove unused configuration options that are not enabled
                <br />and not required by any enabled option.
              </p>
              <button
                onClick={handleGenerate}
                className="px-6 py-2 bg-purple-900 text-purple-200 rounded-lg hover:bg-purple-800 transition-colors font-mono"
              >
                Generate Minimal Config
              </button>
            </div>
          )}

          {loading && (
            <div className="text-center py-12">
              <Loader2 className="w-10 h-10 text-purple-400 animate-spin mx-auto" />
              <p className="text-gray-400 mt-4">Calculating dependency closure...</p>
            </div>
          )}

          {result && (
            <div>
              <div className="grid grid-cols-3 gap-4 mb-4">
                <div className="bg-gray-800 rounded-lg p-3 text-center">
                  <div className="text-2xl font-bold text-green-400">{result.keptCount}</div>
                  <div className="text-xs text-gray-400">Kept</div>
                </div>
                <div className="bg-gray-800 rounded-lg p-3 text-center">
                  <div className="text-2xl font-bold text-red-400">{result.removedCount}</div>
                  <div className="text-xs text-gray-400">Removed</div>
                </div>
                <div className="bg-gray-800 rounded-lg p-3 text-center">
                  <div className="text-2xl font-bold text-gray-400">
                    {result.removedCount + result.keptCount}
                  </div>
                  <div className="text-xs text-gray-400">Total</div>
                </div>
              </div>

              {result.removedSymbols.length > 0 && (
                <div className="bg-gray-800 rounded-lg p-3 mb-4 max-h-40 overflow-y-auto">
                  <div className="text-xs text-gray-400 mb-2">Removed symbols:</div>
                  <div className="flex flex-wrap gap-1">
                    {result.removedSymbols.slice(0, 50).map((s: string) => (
                      <span key={s} className="text-xs font-mono text-red-400 bg-red-900/30 px-1.5 py-0.5 rounded">
                        {s}
                      </span>
                    ))}
                    {result.removedSymbols.length > 50 && (
                      <span className="text-xs text-gray-500">
                        +{result.removedSymbols.length - 50} more
                      </span>
                    )}
                  </div>
                </div>
              )}

              <div className="flex gap-2">
                <button
                  onClick={handleDownload}
                  className="flex-1 py-2 bg-gray-700 text-gray-200 rounded-lg hover:bg-gray-600 transition-colors flex items-center justify-center gap-2"
                >
                  <Download className="w-4 h-4" />
                  Download
                </button>
                {!applied ? (
                  <button
                    onClick={handleApply}
                    className="flex-1 py-2 bg-purple-900 text-purple-200 rounded-lg hover:bg-purple-800 transition-colors flex items-center justify-center gap-2"
                  >
                    <CheckCircle className="w-4 h-4" />
                    Apply to Editor
                  </button>
                ) : (
                  <button
                  className="flex-1 py-2 bg-green-900 text-green-200 rounded-lg flex items-center justify-center gap-2"
                >
                  <CheckCircle className="w-4 h-4" />
                  Applied!
                </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
