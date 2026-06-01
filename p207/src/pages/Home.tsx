import { useSimulationStore } from '@/store/simulationStore'
import { useWebSocket } from '@/hooks/useWebSocket'
import { DeviceCard } from '@/components/DeviceCard'
import { FrameTimeline } from '@/components/FrameTimeline'
import { ControlPanel } from '@/components/ControlPanel'
import { NetworkTopology } from '@/components/NetworkTopology'
import { EnergyChart } from '@/components/EnergyChart'
import { VirtualClockDisplay } from '@/components/VirtualClock'
import { CollisionStatsPanel } from '@/components/CollisionStats'
import { EnergyReportPanel } from '@/components/EnergyReport'
import { Zap } from 'lucide-react'
import type { EnergyReport } from '../../shared/types'

export default function Home() {
  const {
    getDevicesArray,
    getFramesArray,
    simulationStatus,
    virtualClock,
    lightModel,
    collisionStats,
    isConnected,
    selectedDeviceId,
    setSelectedDeviceId,
    getSelectedDevice,
  } = useSimulationStore()

  const { startSimulation, pauseSimulation, resetSimulation, setConfig } = useWebSocket()

  const devices = getDevicesArray()
  const frames = getFramesArray()
  const selectedDevice = getSelectedDevice()

  const fetchReport = async (): Promise<EnergyReport | null> => {
    try {
      const response = await fetch('/api/simulation/report')
      const data = await response.json()
      return data.success ? data.data : null
    } catch {
      return null
    }
  }

  const exportCSV = () => {
    window.open('/api/simulation/report/csv', '_blank')
  }

  const exportJSON = () => {
    window.open('/api/simulation/report/json', '_blank')
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#0A1F1C' }}>
      <header className="border-b border-gray-800 backdrop-blur-sm bg-gray-900/50 sticky top-0 z-10">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div
                className="w-10 h-10 rounded-lg flex items-center justify-center"
                style={{ backgroundColor: 'rgba(0, 255, 136, 0.2)' }}
              >
                <Zap size={24} style={{ color: '#00FF88' }} />
              </div>
              <div>
                <h1 className="text-xl font-bold text-white">ZigBee Green Power Simulator</h1>
                <p className="text-sm text-gray-400">Energy Harvesting Device Simulator</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span
                className="w-2 h-2 rounded-full"
                style={{
                  backgroundColor: isConnected ? '#00FF88' : '#FF3B5C',
                  animation: isConnected ? 'pulse 2s infinite' : 'none',
                }}
              />
              <span className="text-sm text-gray-400">{isConnected ? 'WebSocket Connected' : 'Connecting...'}</span>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-6 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          <div className="lg:col-span-3 space-y-6">
            <div>
              <h2 className="text-lg font-semibold text-white mb-4">Device Status</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {devices.map((device) => (
                  <DeviceCard
                    key={device.deviceId}
                    device={device}
                    isSelected={selectedDeviceId === device.deviceId}
                    onSelect={() => setSelectedDeviceId(selectedDeviceId === device.deviceId ? null : device.deviceId)}
                  />
                ))}
                {devices.length === 0 && (
                  <div className="col-span-full text-center py-12 text-gray-500">
                    No devices. Please configure device count and start simulation.
                  </div>
                )}
              </div>
            </div>

            {selectedDevice && selectedDevice.energyHistory.length > 0 && (
              <div>
                <h2 className="text-lg font-semibold text-white mb-4">
                  Energy Accumulation Curve - {selectedDevice.deviceId}
                </h2>
                <EnergyChart device={selectedDevice} />
              </div>
            )}

            <div>
              <h2 className="text-lg font-semibold text-white mb-4">GP Frame Timeline</h2>
              <div className="h-[400px]">
                <FrameTimeline frames={frames} />
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <VirtualClockDisplay clock={virtualClock} light={lightModel} />

            <CollisionStatsPanel stats={collisionStats} />

            <EnergyReportPanel
              onRefresh={fetchReport}
              onExportCSV={exportCSV}
              onExportJSON={exportJSON}
            />

            <ControlPanel
              status={simulationStatus}
              isConnected={isConnected}
              onStart={startSimulation}
              onPause={pauseSimulation}
              onReset={resetSimulation}
              onSetConfig={setConfig}
            />

            <div>
              <h2 className="text-lg font-semibold text-white mb-4">Network Topology</h2>
              <NetworkTopology devices={devices} />
            </div>
          </div>
        </div>
      </main>

      <footer className="border-t border-gray-800 mt-8 py-6">
        <div className="container mx-auto px-6 text-center text-gray-500 text-sm">
          <p>
            ZigBee Green Power Device Simulator - Energy Harvesting Cycle: Sleep → Harvest Energy
            (Light Integration) → Wake → Send → Sleep
          </p>
          <p className="mt-1">
            Virtual Clock: 1 real second = {simulationStatus?.config.clockSpeedMultiplier || 60}{' '}
            simulated seconds | Channel Collision Detection Enabled
          </p>
        </div>
      </footer>
    </div>
  )
}
