import { useEffect, useState } from 'react'
import { useTcpStore } from '@/store/useTcpStore'
import { AlertTriangle } from 'lucide-react'

export default function RetransmitAlert() {
  const currentPacket = useTcpStore((s) => s.currentPacket)
  const [visible, setVisible] = useState(false)
  const [alertType, setAlertType] = useState<'timeout' | 'fast'>('timeout')
  const [seq, setSeq] = useState<number | undefined>(undefined)

  useEffect(() => {
    if (!currentPacket) return
    if (currentPacket.type !== 'RETRANSMIT') return

    if (currentPacket.lost) {
      setAlertType('timeout')
    } else {
      setAlertType('fast')
    }
    setSeq(currentPacket.seq)
    setVisible(true)

    const timer = setTimeout(() => {
      setVisible(false)
    }, 1500)

    return () => clearTimeout(timer)
  }, [currentPacket])

  if (!visible) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none bg-black/70 animate-float-up">
      <div className="relative flex flex-col items-center">
        <div className="relative">
          <div className="absolute inset-0 animate-pulse-glow">
            <AlertTriangle className="w-32 h-32 text-red-500 opacity-50" />
          </div>
          <AlertTriangle className="w-32 h-32 text-red-500 relative z-10" />
        </div>

        <h2
          className="mt-6 text-4xl font-bold text-white animate-pulse"
          style={{ textShadow: '0 0 20px rgba(239, 68, 68, 0.8)' }}
        >
          {alertType === 'timeout' ? '超时重传' : '快速重传'}
        </h2>

        {seq !== undefined && (
          <p className="mt-3 text-xl font-mono text-red-400">
            重传数据包 #{seq}
          </p>
        )}

        <p className="mt-2 text-sm text-white/50">
          {alertType === 'timeout'
            ? '检测到超时，正在重传丢失的数据包'
            : '收到3个重复ACK，正在快速重传'}
        </p>
      </div>
    </div>
  )
}
