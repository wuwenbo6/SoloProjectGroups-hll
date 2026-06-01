import { X, AlertTriangle, CheckCircle2, Info } from 'lucide-react';
import { useRbdStore } from '../store/rbdStore';

export default function ConfirmDialog() {
  const { confirmDialog, closeConfirm } = useRbdStore();

  if (!confirmDialog.open) return null;

  const Icon = confirmDialog.danger ? AlertTriangle : confirmDialog.danger === false && confirmDialog.title.includes('成功') ? CheckCircle2 : Info;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={closeConfirm}
      />
      <div className="relative bg-slate-900 border border-slate-700 rounded-xl shadow-2xl w-full max-w-md mx-4 overflow-hidden animate-scale-in">
        <div className="p-6">
          <div className="flex items-start gap-4">
            <div
              className={`w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 ${
                confirmDialog.danger
                  ? 'bg-red-500/10 text-red-400'
                  : 'bg-cyan-500/10 text-cyan-400'
              }`}
            >
              <Icon className="w-6 h-6" />
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-white mb-2">
                {confirmDialog.title}
              </h3>
              <p className="text-slate-400 text-sm leading-relaxed">
                {confirmDialog.message}
              </p>
            </div>
            <button
              onClick={closeConfirm}
              className="text-slate-500 hover:text-slate-300 transition-colors p-1"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
        <div className="px-6 py-4 bg-slate-800/50 flex justify-end gap-3">
          <button
            onClick={closeConfirm}
            className="px-4 py-2 text-sm font-medium text-slate-300 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors"
          >
            取消
          </button>
          <button
            onClick={() => {
              confirmDialog.onConfirm?.();
              closeConfirm();
            }}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-all ${
              confirmDialog.danger
                ? 'bg-red-500 hover:bg-red-600 text-white shadow-lg shadow-red-500/25'
                : 'bg-cyan-500 hover:bg-cyan-600 text-white shadow-lg shadow-cyan-500/25'
            }`}
          >
            确认
          </button>
        </div>
      </div>
    </div>
  );
}
