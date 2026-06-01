import React from 'react';
import { AlertCircle, AlertTriangle, Loader2 } from 'lucide-react';
import { useAppStore } from '../store/appStore';

export const StatusBar: React.FC = () => {
  const { isLoading, error, warnings } = useAppStore();

  if (!isLoading && !error && warnings.length === 0) {
    return null;
  }

  return (
    <div className="bg-white border-b border-gray-200">
      {isLoading && (
        <div className="flex items-center space-x-2 px-4 py-2 bg-blue-50">
          <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />
          <span className="text-sm text-blue-700">正在解析GSDML文件...</span>
        </div>
      )}

      {error && (
        <div className="flex items-center space-x-2 px-4 py-2 bg-red-50">
          <AlertCircle className="w-4 h-4 text-red-500" />
          <span className="text-sm text-red-700">{error}</span>
        </div>
      )}

      {warnings.length > 0 && !error && (
        <div className="flex items-start space-x-2 px-4 py-2 bg-amber-50">
          <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
          <div className="flex flex-wrap gap-x-4">
            {warnings.map((warning, index) => (
              <span key={index} className="text-sm text-amber-700">
                {warning}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
