import { useEffect, useState } from 'react';
import { CheckCircle, XCircle, Info, X } from 'lucide-react';
import { cn } from '../lib/utils.js';

interface Toast {
  id: string;
  type: 'success' | 'error' | 'info';
  message: string;
}

interface ToastContainerProps {
  toasts: Toast[];
  onRemove: (id: string) => void;
}

export function ToastContainer({ toasts, onRemove }: ToastContainerProps) {
  return (
    <div className="fixed top-4 right-4 z-50 space-y-2">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onRemove={onRemove} />
      ))}
    </div>
  );
}

interface ToastItemProps {
  toast: Toast;
  onRemove: (id: string) => void;
}

function ToastItem({ toast, onRemove }: ToastItemProps) {
  useEffect(() => {
    const timer = setTimeout(() => {
      onRemove(toast.id);
    }, 3000);
    return () => clearTimeout(timer);
  }, [toast.id, onRemove]);

  return (
    <div
      className={cn(
        'flex items-center gap-3 px-4 py-3 rounded-lg shadow-lg border animate-slide-in',
        'min-w-[280px] max-w-[400px]',
        toast.type === 'success' && 'bg-green-900/90 border-green-700 text-green-100',
        toast.type === 'error' && 'bg-red-900/90 border-red-700 text-red-100',
        toast.type === 'info' && 'bg-zinc-800/90 border-zinc-600 text-zinc-100'
      )}
    >
      {toast.type === 'success' && (
        <CheckCircle className="w-5 h-5 text-green-400 flex-shrink-0" />
      )}
      {toast.type === 'error' && (
        <XCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
      )}
      {toast.type === 'info' && (
        <Info className="w-5 h-5 text-zinc-400 flex-shrink-0" />
      )}
      <span className="text-sm flex-1">{toast.message}</span>
      <button
        onClick={() => onRemove(toast.id)}
        className="text-zinc-400 hover:text-zinc-200 transition-colors"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}

export function useToast() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const showToast = (type: Toast['type'], message: string) => {
    const id = Math.random().toString(36).slice(2);
    setToasts((prev) => [...prev, { id, type, message }]);
  };

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  const success = (message: string) => showToast('success', message);
  const error = (message: string) => showToast('error', message);
  const info = (message: string) => showToast('info', message);

  return { toasts, removeToast, success, error, info };
}
