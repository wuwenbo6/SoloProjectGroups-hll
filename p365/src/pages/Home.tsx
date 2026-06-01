import { useEffect } from 'react'
import { useDDSStore } from '@/store/ddsStore'
import Header from '@/components/Header'
import ControlPanel from '@/components/ControlPanel'
import StatsPanel from '@/components/StatsPanel'
import ContentFilterPanel from '@/components/ContentFilterPanel'
import ExportPanel from '@/components/ExportPanel'
import MessageTimeline from '@/components/MessageTimeline'
import RateChart from '@/components/RateChart'

export default function Home() {
  const { connect, disconnect } = useDDSStore()

  useEffect(() => {
    connect()
    return () => {
      disconnect()
    }
  }, [connect, disconnect])

  return (
    <div className="min-h-screen bg-[#0A0E17] text-white">
      <Header />
      <main className="max-w-[1400px] mx-auto p-6 space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <ControlPanel />
          <StatsPanel />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <ContentFilterPanel />
          <ExportPanel />
        </div>
        <RateChart />
        <MessageTimeline />
      </main>
    </div>
  )
}
