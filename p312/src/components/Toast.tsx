import { useEffect } from 'react'
import { useZNSStore } from '@/store/zns-store'
import { X } from 'lucide-react'

export default function Toast() {
  const { toast, clearToast } = useZNSStore()

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(clearToast, 3000)
      return () => clearTimeout(timer)
    }
  }, [toast, clearToast])

  if (!toast) return null

  const isError = toast.type === 'error'
  const bgColor = isError ? 'bg-[#ef4444]/15' : 'bg-[#00f0b5]/15'
  const borderColor = isError ? 'border-[#ef4444]/40' : 'border-[#00f0b5]/40'
  const textColor = isError ? 'text-[#ef4444]' : 'text-[#00f0b5]'

  return (
    <div className="fixed top-4 right-4 z-50 animate-slide-in">
      <div className={`${bgColor} ${borderColor} border rounded-lg px-4 py-3 flex items-center gap-3 shadow-lg backdrop-blur-sm`}>
        <span className={`${textColor} text-sm font-mono`}>{toast.message}</span>
        <button onClick={clearToast} className={`${textColor} opacity-60 hover:opacity-100 transition-opacity`}>
          <X size={14} />
        </button>
      </div>
    </div>
  )
}
