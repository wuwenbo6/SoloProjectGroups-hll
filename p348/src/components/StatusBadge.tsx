import { getStatusLabel, getStatusBgColor } from '@/lib/format';

interface StatusBadgeProps {
  status: string;
  className?: string;
}

export function StatusBadge({ status, className = '' }: StatusBadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${getStatusBgColor(status)} ${className}`}
    >
      <span className={`mr-1.5 h-1.5 w-1.5 rounded-full bg-current`}></span>
      {getStatusLabel(status)}
    </span>
  );
}
