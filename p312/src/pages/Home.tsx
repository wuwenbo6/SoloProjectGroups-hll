import NamespaceConfig from '@/components/NamespaceConfig'
import ZoneStatusOverview from '@/components/ZoneStatusOverview'
import ZoneTable from '@/components/ZoneTable'
import ZoneOperations from '@/components/ZoneOperations'
import WritePanel from '@/components/WritePanel'
import StateMachineDiagram from '@/components/StateMachineDiagram'
import OperationLog from '@/components/OperationLog'
import Toast from '@/components/Toast'
import { useZNSStore } from '@/store/zns-store'
import { Server } from 'lucide-react'

export default function Home() {
  const { initialized } = useZNSStore()

  return (
    <div className="min-h-screen bg-[#0a0e17] text-white">
      <Toast />

      <header className="border-b border-[#21262d] bg-[#0d1117]/80 backdrop-blur-sm sticky top-0 z-40">
        <div className="max-w-[1600px] mx-auto px-6 py-3 flex items-center gap-3">
          <div className="flex items-center gap-2.5">
            <Server size={20} className="text-[#00f0b5]" />
            <h1 className="text-lg font-bold tracking-tight" style={{ fontFamily: '"Space Grotesk", sans-serif' }}>
              NVMe ZNS Simulator
            </h1>
          </div>
          <span className="text-[#484f58] text-xs font-mono border border-[#30363d] rounded-full px-2.5 py-0.5">
            Zoned Namespace
          </span>
          {initialized && (
            <span className="ml-auto flex items-center gap-1.5 text-xs text-[#00f0b5]">
              <span className="w-1.5 h-1.5 rounded-full bg-[#00f0b5] animate-pulse" />
              Active
            </span>
          )}
        </div>
      </header>

      <main className="max-w-[1600px] mx-auto px-6 py-6 space-y-6">
        <NamespaceConfig />

        {initialized && (
          <>
            <ZoneStatusOverview />

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2">
                <ZoneTable />
              </div>

              <div className="space-y-6">
                <ZoneOperations />
                <WritePanel />
                <StateMachineDiagram />
              </div>
            </div>

            <OperationLog />
          </>
        )}
      </main>
    </div>
  )
}
