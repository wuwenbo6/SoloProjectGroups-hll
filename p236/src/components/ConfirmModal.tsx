import { useAppStore } from '@/store/useAppStore'
import { AlertTriangle, X } from 'lucide-react'

export default function ConfirmModal() {
  const {
    showConfirmModal,
    confirmModalTitle,
    confirmModalMessage,
    confirmModalAction,
    setShowConfirmModal,
    deleting,
  } = useAppStore()

  if (!showConfirmModal) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={() => !deleting && setShowConfirmModal(false)}
      />
      <div className="relative bg-white rounded-2xl shadow-2xl max-w-md w-full mx-4 animate-fade-in">
        <button
          onClick={() => !deleting && setShowConfirmModal(false)}
          className="absolute top-4 right-4 text-zinc-400 hover:text-zinc-600 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-full bg-danger-50 flex items-center justify-center">
              <AlertTriangle className="w-5 h-5 text-danger-500" />
            </div>
            <h3 className="text-lg font-semibold text-zinc-900">{confirmModalTitle}</h3>
          </div>
          <p className="text-sm text-zinc-600 leading-relaxed">{confirmModalMessage}</p>
        </div>

        <div className="flex gap-3 px-6 pb-6">
          <button
            onClick={() => setShowConfirmModal(false)}
            disabled={deleting}
            className="btn-secondary flex-1"
          >
            取消
          </button>
          <button
            onClick={() => {
              if (confirmModalAction) confirmModalAction()
            }}
            disabled={deleting}
            className="btn-danger flex-1 flex items-center justify-center gap-2"
          >
            {deleting ? (
              <>
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                删除中...
              </>
            ) : (
              '确认删除'
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
