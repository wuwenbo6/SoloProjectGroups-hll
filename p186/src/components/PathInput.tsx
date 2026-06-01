import React, { useState } from 'react';
import { Search, History, FolderOpen } from 'lucide-react';

interface PathInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  isLoading: boolean;
  history: string[];
}

const PathInput: React.FC<PathInputProps> = ({
  value,
  onChange,
  onSubmit,
  isLoading,
  history,
}) => {
  const [showHistory, setShowHistory] = useState(false);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      onSubmit();
    }
  };

  const handleHistorySelect = (path: string) => {
    onChange(path);
    setShowHistory(false);
  };

  return (
    <div className="relative w-full">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <FolderOpen className="h-5 w-5 text-slate-400" />
          </div>
          <input
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={() => setShowHistory(true)}
            onBlur={() => setTimeout(() => setShowHistory(false), 200)}
            placeholder="Enter file or directory path (e.g., /mnt/nfs/share)"
            className="w-full pl-10 pr-10 py-3 bg-slate-800/50 border border-slate-700 rounded-lg text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all font-mono text-sm"
            disabled={isLoading}
          />
          {history.length > 0 && (
            <button
              type="button"
              className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-200 transition-colors"
              onClick={() => setShowHistory(!showHistory)}
            >
              <History className="h-5 w-5" />
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={onSubmit}
          disabled={isLoading || !value.trim()}
          className="px-6 py-3 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-all flex items-center gap-2 shadow-lg shadow-blue-600/20 hover:shadow-blue-500/30"
        >
          <Search className={`h-5 w-5 ${isLoading ? 'animate-spin' : ''}`} />
          <span>{isLoading ? 'Loading...' : 'Load ACL'}</span>
        </button>
      </div>

      {showHistory && history.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-slate-800 border border-slate-700 rounded-lg shadow-xl z-50 overflow-hidden">
          <div className="px-3 py-2 bg-slate-900/50 text-xs text-slate-400 font-medium">
            Recent Paths
          </div>
          <div className="max-h-48 overflow-y-auto">
            {history.map((path, index) => (
              <button
                key={index}
                type="button"
                onClick={() => handleHistorySelect(path)}
                className="w-full px-3 py-2 text-left text-sm text-slate-300 hover:bg-slate-700/50 transition-colors font-mono truncate"
              >
                {path}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default PathInput;
