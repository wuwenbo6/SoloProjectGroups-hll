import React, { useEffect } from 'react';
import { X, CheckCircle, AlertCircle, Info } from 'lucide-react';

interface NotificationProps {
  type: 'success' | 'error' | 'info';
  message: string;
  isVisible: boolean;
  onClose: () => void;
  duration?: number;
}

const Notification: React.FC<NotificationProps> = ({
  type,
  message,
  isVisible,
  onClose,
  duration = 4000,
}) => {
  useEffect(() => {
    if (isVisible && duration > 0) {
      const timer = setTimeout(() => {
        onClose();
      }, duration);
      return () => clearTimeout(timer);
    }
  }, [isVisible, duration, onClose]);

  if (!isVisible) return null;

  const styles = {
    success: {
      bg: 'bg-emerald-600/90',
      border: 'border-emerald-500',
      icon: <CheckCircle className="h-5 w-5" />,
    },
    error: {
      bg: 'bg-red-600/90',
      border: 'border-red-500',
      icon: <AlertCircle className="h-5 w-5" />,
    },
    info: {
      bg: 'bg-blue-600/90',
      border: 'border-blue-500',
      icon: <Info className="h-5 w-5" />,
    },
  };

  const style = styles[type];

  return (
    <div className="fixed top-4 right-4 z-50 animate-in slide-in-from-right duration-300">
      <div
        className={`flex items-center gap-3 px-4 py-3 rounded-lg border ${style.bg} ${style.border} shadow-xl backdrop-blur-sm text-white min-w-72`}
      >
        {style.icon}
        <span className="flex-1 text-sm font-medium">{message}</span>
        <button
          type="button"
          onClick={onClose}
          className="p-1 hover:bg-white/20 rounded transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
};

export default Notification;
