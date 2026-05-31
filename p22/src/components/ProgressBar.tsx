import React from 'react';
import { Loader2, CheckCircle, XCircle } from 'lucide-react';

interface ProgressBarProps {
  progress: number;
  isProcessing: boolean;
  isLoading?: boolean;
  error?: string | null;
  label?: string;
}

export function ProgressBar({ progress, isProcessing, isLoading, error, label }: ProgressBarProps) {
  const getStatusColor = () => {
    if (error) return 'bg-error';
    if (progress === 100) return 'bg-success';
    return 'bg-primary-500';
  };

  const getStatusIcon = () => {
    if (error) return <XCircle className="w-5 h-5 text-error" />;
    if (progress === 100) return <CheckCircle className="w-5 h-5 text-success" />;
    if (isProcessing || isLoading) return <Loader2 className="w-5 h-5 text-primary-400 animate-spin" />;
    return null;
  };

  return (
    <div className="w-full">
      {label && (
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium">{label}</span>
          <div className="flex items-center gap-2">
            {getStatusIcon()}
            <span className="text-sm text-dark-200">{progress}%</span>
          </div>
        </div>
      )}
      
      <div className="relative h-2 bg-dark-700 rounded-full overflow-hidden">
        <div
          className={`h-full ${getStatusColor()} transition-all duration-300 ease-out`}
          style={{ width: `${progress}%` }}
        />
        {(isProcessing || isLoading) && progress < 100 && (
          <div
            className="absolute inset-0 shimmer-bg"
            style={{ transform: `translateX(${progress - 100}%)` }}
          />
        )}
      </div>
      
      {error && (
        <p className="mt-2 text-sm text-error">{error}</p>
      )}
    </div>
  );
}
