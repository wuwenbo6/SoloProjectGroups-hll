import { useEffect, useRef, useState, useCallback } from 'react'
import { useTcpStore } from '@/store/useTcpStore'
import type { PacketRecord } from '@/types/congestion'
import { Monitor, Server } from 'lucide-react'

interface ActivePacket extends PacketRecord {
  progress: number
  startTime: number
  duration: number
  yOffset: number
}

const PACKET_COLORS: Record<string, string> = {
  DATA: '#00e5ff',
  ACK: '#4ade80',
  DUP_ACK: '#ffab00',
  RETRANSMIT: '#ef4444',
}

export default function PacketFlow() {
  const currentPacket = useTcpStore((s) => s.currentPacket)
  const currentState = useTcpStore((s) => s.currentState)
  const [activePackets, setActivePackets] = useState<ActivePacket[]>([])
  const animationRef = useRef<number>(0)
  const lastPacketRef = useRef<number | null>(null)

  const isEstablished = currentState === 'ESTABLISHED'

  const createActivePacket = useCallback((packet: PacketRecord): ActivePacket => {
    const direction = packet.type === 'DATA' || packet.type === 'RETRANSMIT' ? 1 : -1
    return {
      ...packet,
      progress: direction === 1 ? 0 : 1,
      startTime: performance.now(),
      duration: 1500,
      yOffset: (Math.random() - 0.5) * 40,
    }
  }, [])

  useEffect(() => {
    if (!currentPacket || !isEstablished) return
    if (currentPacket.id === lastPacketRef.current) return

    lastPacketRef.current = currentPacket.id

    const newPacket = createActivePacket(currentPacket)
    setActivePackets((prev) => {
      const filtered = prev.filter((p) => p.progress > 0 && p.progress < 1)
      return [...filtered.slice(-2), newPacket]
    })
  }, [currentPacket, isEstablished, createActivePacket])

  useEffect(() => {
    const animate = () => {
      const now = performance.now()

      setActivePackets((prev) => {
        return prev
          .map((packet) => {
            const elapsed = now - packet.startTime
            const progressRatio = Math.min(1, elapsed / packet.duration)
            const direction = packet.type === 'DATA' || packet.type === 'RETRANSMIT' ? 1 : -1

            let newProgress = direction === 1
              ? progressRatio
              : 1 - progressRatio

            if (packet.lost && progressRatio > 0.6) {
              newProgress = 0.6
            }

            return {
              ...packet,
              progress: newProgress,
            }
          })
          .filter((p) => {
            const elapsed = now - p.startTime
            if (p.lost && elapsed > p.duration * 0.8) return false
            if (elapsed > p.duration + 200) return false
            return true
          })
      })

      animationRef.current = requestAnimationFrame(animate)
    }

    animationRef.current = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(animationRef.current)
  }, [])

  const getPacketPosition = (progress: number) => {
    const startX = 15
    const endX = 85
    return startX + (endX - startX) * progress
  }

  return (
    <div className="absolute inset-0 pointer-events-none z-5 overflow-hidden">
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[120px]">
        <div className="absolute left-[10%] top-1/2 -translate-y-1/2 flex flex-col items-center">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-cyan-500/20 to-cyan-400/10 border border-cyan-400/30 flex items-center justify-center backdrop-blur-xl">
            <Monitor className="w-7 h-7 text-cyan-400" />
          </div>
          <span className="mt-2 text-xs text-white/60 font-medium">客户端</span>
        </div>

        <div className="absolute left-[22%] right-[22%] top-1/2 -translate-y-1/2">
          <div className="relative h-[3px] bg-gradient-to-r from-cyan-500/30 via-white/20 to-amber-500/30 rounded-full">
            <div className="absolute inset-0 bg-gradient-to-r from-cyan-500/0 via-cyan-400/30 to-cyan-500/0 animate-pulse" />
          </div>
          <div className="absolute -top-1 left-0 right-0 flex justify-between">
            {[...Array(8)].map((_, i) => (
              <div
                key={i}
                className="w-1 h-3 bg-white/10 rounded-full"
                style={{ marginLeft: i === 0 ? '0' : undefined }}
              />
            ))}
          </div>
        </div>

        <div className="absolute right-[10%] top-1/2 -translate-y-1/2 flex flex-col items-center">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-amber-500/20 to-amber-400/10 border border-amber-400/30 flex items-center justify-center backdrop-blur-xl">
            <Server className="w-7 h-7 text-amber-400" />
          </div>
          <span className="mt-2 text-xs text-white/60 font-medium">服务端</span>
        </div>

        {activePackets.map((packet) => {
          const x = getPacketPosition(packet.progress)
          const color = PACKET_COLORS[packet.type]
          const isLost = packet.lost
          const isRetransmit = packet.type === 'RETRANSMIT'
          const isDupAck = packet.type === 'DUP_ACK'

          const elapsed = performance.now() - packet.startTime
          const opacity = isLost && elapsed > packet.duration * 0.6
            ? Math.max(0, 1 - (elapsed - packet.duration * 0.6) / (packet.duration * 0.2))
            : 1

          return (
            <div
              key={packet.id}
              className={`absolute top-1/2 -translate-y-1/2 ${isLost ? 'animate-shake' : ''}`}
              style={{
                left: `${x}%`,
                transform: `translateY(calc(-50% + ${packet.yOffset}px))`,
                opacity,
                transition: 'opacity 0.2s',
              }}
            >
              <div
                className={`relative ${isRetransmit ? 'animate-pulse-glow' : ''}`}
                style={{
                  filter: `drop-shadow(0 0 8px ${color}80)`,
                }}
              >
                <div
                  className="w-10 h-6 rounded-lg flex items-center justify-center text-[9px] font-mono font-bold"
                  style={{
                    backgroundColor: `${color}25`,
                    border: `1.5px solid ${color}`,
                    color: color,
                  }}
                >
                  {packet.type === 'DATA' && 'DATA'}
                  {packet.type === 'ACK' && 'ACK'}
                  {packet.type === 'DUP_ACK' && 'DUP'}
                  {packet.type === 'RETRANSMIT' && 'RXT'}
                </div>
                {packet.seq !== undefined && (
                  <div
                    className="absolute -top-4 left-1/2 -translate-x-1/2 text-[9px] font-mono whitespace-nowrap"
                    style={{ color: color }}
                  >
                    #{packet.seq}
                  </div>
                )}
                {isDupAck && (
                  <div
                    className="absolute -top-1 -right-1 w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-bold"
                    style={{
                      backgroundColor: color,
                      color: '#000',
                    }}
                  >
                    ×
                  </div>
                )}
                {isLost && (
                  <svg
                    className="absolute inset-0 w-full h-full"
                    style={{ color: '#ef4444' }}
                  >
                    <line
                      x1="10%"
                      y1="50%"
                      x2="90%"
                      y2="50%"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeDasharray="3 2"
                    />
                  </svg>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
