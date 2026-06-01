import { useEffect } from 'react'
import TcpCanvas from '@/components/TcpCanvas'
import EventPanel from '@/components/EventPanel'
import TransitionLog from '@/components/TransitionLog'
import NodeTooltip from '@/components/NodeTooltip'
import CongestionChart from '@/components/CongestionChart'
import CongestionControls from '@/components/CongestionControls'
import PacketFlow from '@/components/PacketFlow'
import RetransmitAlert from '@/components/RetransmitAlert'
import { useTcpStore } from '@/store/useTcpStore'

export default function Home() {
  const fetchState = useTcpStore((s) => s.fetchState)
  const fetchCongestionState = useTcpStore((s) => s.fetchCongestionState)

  useEffect(() => {
    fetchState()
    fetchCongestionState()
  }, [fetchState, fetchCongestionState])

  return (
    <div className="w-screen h-screen overflow-hidden bg-[#0a0e17] relative">
      <TcpCanvas />
      <EventPanel />
      <TransitionLog />
      <NodeTooltip />
      <CongestionChart />
      <CongestionControls />
      <PacketFlow />
      <RetransmitAlert />
    </div>
  )
}
