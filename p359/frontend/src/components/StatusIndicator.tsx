import { getStatusColor, getStatusBgColor } from '../utils/formatters';

interface StatusIndicatorProps {
  status: string;
  label?: string;
  showDot?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

export function StatusIndicator({ status, label, showDot = true, size = 'md' }: StatusIndicatorProps) {
  const sizeClasses = {
    sm: 'h-2 w-2',
    md: 'h-3 w-3',
    lg: 'h-4 w-4',
  };

  const textSizeClasses = {
    sm: 'text-xs',
    md: 'text-sm',
    lg: 'text-base',
  };

  const dotColorClasses: Record<string, string> = {
    up: 'bg-green-400',
    down: 'bg-gray-400',
    fault: 'bg-red-400 animate-pulse',
    active: 'bg-blue-400',
    passive: 'bg-amber-400',
    completed: 'bg-green-400',
    in_progress: 'bg-blue-400 animate-pulse',
    idle: 'bg-gray-400',
    failed: 'bg-red-400 animate-pulse',
    error: 'bg-red-400 animate-pulse',
    warning: 'bg-amber-400 animate-pulse',
    info: 'bg-blue-400',
  };

  return (
    <div className={`inline-flex items-center gap-2 px-2 py-1 rounded-full ${getStatusBgColor(status)}`}>
      {showDot && (
        <span
          className={`inline-block rounded-full ${sizeClasses[size]} ${dotColorClasses[status] || 'bg-gray-400'}`}
        />
      )}
      {label && (
        <span className={`${textSizeClasses[size]} font-medium ${getStatusColor(status)}`}>
          {label}
        </span>
      )}
    </div>
  );
}
