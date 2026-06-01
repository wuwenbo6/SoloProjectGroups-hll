import { useState } from 'react'
import { HardDrive, Power, Download } from 'lucide-react'
import { useZNSStore } from '@/store/zns-store'

export default function NamespaceConfig() {
  const [zoneCount, setZoneCount] = useState(8)
  const [zoneCapacity, setZoneCapacity] = useState(1024)
  const { initialized, loading, initNamespace, exportCSV } = useZNSStore()

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    initNamespace(zoneCount, zoneCapacity)
  }

  return (
    <div className="rounded-lg border border-[#30363d] bg-[#0d1117] p-6">
      <div className="mb-5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <HardDrive className="h-5 w-5 text-[#00f0b5]" />
          <h2
            className="text-sm font-semibold tracking-widest text-[#00f0b5]"
            style={{ fontFamily: 'Space Grotesk, sans-serif' }}
          >
            NAMESPACE CONFIG
          </h2>
        </div>
        {initialized && (
          <button
            onClick={exportCSV}
            className="flex items-center gap-1.5 rounded-md bg-[#3b82f6]/10 px-3 py-1.5 text-xs font-medium text-[#3b82f6] border border-[#3b82f6]/30 transition-all hover:bg-[#3b82f6]/20 hover:shadow-[0_0_10px_rgba(59,130,246,0.2)]"
            style={{ fontFamily: 'Space Grotesk, sans-serif' }}
          >
            <Download className="h-3.5 w-3.5" />
            EXPORT CSV
          </button>
        )}
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label
              className="mb-1.5 block text-xs font-medium tracking-wider text-[#8b949e]"
              style={{ fontFamily: 'Space Grotesk, sans-serif' }}
            >
              ZONE COUNT
            </label>
            <input
              type="number"
              min={1}
              max={256}
              value={zoneCount}
              onChange={(e) => setZoneCount(Number(e.target.value))}
              disabled={initialized}
              className="font-mono w-full rounded-md bg-[#161b22] border border-[#30363d] px-3 py-2 text-sm text-white focus:border-[#00f0b5] focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
            />
          </div>

          <div>
            <label
              className="mb-1.5 block text-xs font-medium tracking-wider text-[#8b949e]"
              style={{ fontFamily: 'Space Grotesk, sans-serif' }}
            >
              ZONE CAPACITY (LBAs)
            </label>
            <input
              type="number"
              min={1}
              max={1048576}
              value={zoneCapacity}
              onChange={(e) => setZoneCapacity(Number(e.target.value))}
              disabled={initialized}
              className="font-mono w-full rounded-md bg-[#161b22] border border-[#30363d] px-3 py-2 text-sm text-white focus:border-[#00f0b5] focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={initialized || loading}
          className="flex w-full items-center justify-center gap-2 rounded-md bg-[#00f0b5] px-4 py-2.5 text-sm font-semibold text-[#0a0e17] transition-all hover:shadow-[0_0_15px_rgba(0,240,181,0.3)] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:shadow-none"
          style={{ fontFamily: 'Space Grotesk, sans-serif' }}
        >
          <Power className="h-4 w-4" />
          INITIALIZE
        </button>
      </form>

      {initialized && (
        <p className="mt-3 text-center text-xs text-[#8b949e]">
          Namespace initialized — use zone commands below
        </p>
      )}
    </div>
  )
}
