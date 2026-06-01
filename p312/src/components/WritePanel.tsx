import { useState } from 'react'
import { useZNSStore } from '@/store/zns-store'
import { PenLine, ArrowRight, Plus } from 'lucide-react'

export default function WritePanel() {
  const { selectedZoneId, zones, writeZone, appendZone, loading } = useZNSStore()
  const [writeSize, setWriteSize] = useState<number>(64)

  const selectedZone = zones.find((z) => z.id === selectedZoneId)
  const remaining = selectedZone ? selectedZone.capacity - selectedZone.writePointer : 0
  const canWrite =
    selectedZone &&
    (selectedZone.state === 'empty' ||
      selectedZone.state === 'implicitly_opened' ||
      selectedZone.state === 'explicitly_opened')

  const handleWrite = () => {
    if (selectedZoneId !== null && writeSize > 0) {
      writeZone(selectedZoneId, writeSize)
    }
  }

  const handleAppend = () => {
    if (selectedZoneId !== null) {
      appendZone(selectedZoneId)
    }
  }

  const handleAppendSize = () => {
    if (selectedZoneId !== null && writeSize > 0) {
      appendZone(selectedZoneId, writeSize)
    }
  }

  const presetSizes = [16, 32, 64, 128, 256]

  return (
    <div className="bg-[#0d1117] border border-[#30363d] rounded-lg p-4">
      <div className="flex items-center gap-2 mb-4">
        <PenLine size={14} className="text-[#8b949e]" />
        <span className="text-[#8b949e] uppercase text-xs tracking-wider font-semibold"
          style={{ fontFamily: '"Space Grotesk", sans-serif' }}>
          WRITE / APPEND
        </span>
      </div>

      {!selectedZone ? (
        <p className="text-[#484f58] text-sm">Select a zone to write data</p>
      ) : !canWrite ? (
        <p className="text-[#f59e0b] text-sm">
          Zone {selectedZone.id} is <span className="uppercase font-semibold">{selectedZone.state.replace(/_/g, ' ')}</span> — not writable
        </p>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs text-[#8b949e]">
            <span>Zone {selectedZone.id}</span>
            <span className="font-mono">
              Remaining: <span className="text-[#00f0b5]">{remaining}</span> / {selectedZone.capacity} LBAs
            </span>
          </div>

          <div className="relative">
            <input
              type="number"
              min={1}
              max={remaining}
              value={writeSize}
              onChange={(e) => setWriteSize(Number(e.target.value))}
              className="w-full bg-[#161b22] border border-[#30363d] text-white font-mono text-sm rounded-lg px-3 py-2 pr-16 focus:border-[#00f0b5] focus:outline-none transition-colors"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[#484f58] text-xs">
              LBAs
            </span>
          </div>

          <div className="flex gap-1.5">
            {presetSizes.map((size) => (
              <button
                key={size}
                onClick={() => setWriteSize(size)}
                className={`flex-1 text-xs font-mono py-1.5 rounded transition-colors ${
                  writeSize === size
                    ? 'bg-[#00f0b5]/20 text-[#00f0b5] border border-[#00f0b5]/40'
                    : 'bg-[#161b22] text-[#8b949e] border border-[#30363d] hover:border-[#484f58]'
                }`}
              >
                {size}
              </button>
            ))}
            <button
              onClick={() => setWriteSize(remaining)}
              className="flex-1 text-xs font-mono py-1.5 rounded bg-[#161b22] text-[#8b949e] border border-[#30363d] hover:border-[#484f58] transition-colors"
            >
              MAX
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={handleWrite}
              disabled={loading || writeSize <= 0 || writeSize > remaining}
              className="flex items-center justify-center gap-1.5 py-2 rounded-lg font-semibold text-xs transition-all bg-[#00f0b5]/10 text-[#00f0b5] border border-[#00f0b5]/30 hover:bg-[#00f0b5]/20 hover:shadow-[0_0_10px_rgba(0,240,181,0.2)] disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:shadow-none"
              style={{ fontFamily: '"Space Grotesk", sans-serif' }}
            >
              <ArrowRight size={14} />
              WRITE
            </button>
            <button
              onClick={handleAppendSize}
              disabled={loading || writeSize <= 0 || writeSize > remaining}
              className="flex items-center justify-center gap-1.5 py-2 rounded-lg font-semibold text-xs transition-all bg-[#a78bfa]/10 text-[#a78bfa] border border-[#a78bfa]/30 hover:bg-[#a78bfa]/20 hover:shadow-[0_0_10px_rgba(167,139,250,0.2)] disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:shadow-none"
              style={{ fontFamily: '"Space Grotesk", sans-serif' }}
            >
              <Plus size={14} />
              APPEND
            </button>
          </div>

          <button
            onClick={handleAppend}
            disabled={loading || remaining <= 0}
            className="w-full flex items-center justify-center gap-2 py-2 rounded-lg font-semibold text-xs transition-all bg-[#a78bfa]/10 text-[#a78bfa] border border-[#a78bfa]/30 hover:bg-[#a78bfa]/20 hover:shadow-[0_0_10px_rgba(167,139,250,0.2)] disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:shadow-none"
            style={{ fontFamily: '"Space Grotesk", sans-serif' }}
          >
            <Plus size={14} />
            APPEND TO FILL ({remaining} LBAs)
          </button>
        </div>
      )}
    </div>
  )
}
