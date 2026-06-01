import React from 'react';
import { AlertCircle, X } from 'lucide-react';
import { useFitStore } from '../store/useFitStore';

const ErrorMessage: React.FC = () => {
  const { error, setError } = useFitStore();

  if (!error) return null;

  return (
    <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start justify-between">
      <div className="flex items-start space-x-3">
        <AlertCircle className="w-5 h-5 text-red-500 mt-0.5 flex-shrink-0" />
        <div>
          <p className="text-red-800 font-medium">错误</p>
          <p className="text-red-600 text-sm">{error}</p>
        </div>
      </div>
      <button
        onClick={() => setError(null)}
        className="text-red-400 hover:text-red-600 transition-colors"
      >
        <X className="w-5 h-5" />
      </button>
    </div>
  );
};

export default ErrorMessage;
