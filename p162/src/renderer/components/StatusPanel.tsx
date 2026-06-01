import { Activity, Wifi, WifiOff, Clock, Send, Download, AlertTriangle } from 'lucide-react'
import { useDeviceStore } from '../store/deviceStore'

export function StatusPanel() {
  const { isConnected, deviceAddress, stats } = useDeviceStore()

  const formatTime = (date: Date | null) => {
    if (!date) return '--:--:--'
    return date.toLocaleTimeString()
  }

  return (
    <div className="bg-dark-800 border border-dark-700 rounded p-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Activity className="w-5 h-5 text-primary" />
          <h2 className="text-lg font-semibold text-white">Communication Status</h2>
        </div>
        <div className="flex items-center gap-2">
          {isConnected ? (
            <Wifi className="w-5 h-5 text-success animate-pulse" />
          ) : (
            <WifiOff className="w-5 h-5 text-dark-600" />
          )}
          <span className={`text-sm font-medium ${isConnected ? 'text-success' : 'text-dark-600'}`}>
            {isConnected ? 'Connected' : 'Disconnected'}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-dark-900 rounded p-3">
          <div className="text-dark-600 text-xs mb-1">Device Address</div>
          <div className="text-white font-mono text-lg">{deviceAddress}</div>
        </div>

        <div className="bg-dark-900 rounded p-3">
          <div className="text-dark-600 text-xs mb-1 flex items-center gap-1">
            <Send className="w-3 h-3" /> Packets Sent
          </div>
          <div className="text-primary font-mono text-lg">{stats.packetsSent}</div>
        </div>

        <div className="bg-dark-900 rounded p-3">
          <div className="text-dark-600 text-xs mb-1 flex items-center gap-1">
            <Download className="w-3 h-3" /> Packets Received
          </div>
          <div className="text-success font-mono text-lg">{stats.packetsReceived}</div>
        </div>

        <div className="bg-dark-900 rounded p-3">
          <div className="text-dark-600 text-xs mb-1 flex items-center gap-1">
            <AlertTriangle className="w-3 h-3" /> Errors
          </div>
          <div className={`font-mono text-lg ${stats.errors > 0 ? 'text-danger' : 'text-white'}`}>
            {stats.errors}
          </div>
        </div>
      </div>

      <div className="mt-4 flex items-center gap-2 text-dark-600 text-sm">
        <Clock className="w-4 h-4" />
        <span>Last Packet: {formatTime(stats.lastPacketTime)}</span>
      </div>
    </div>
  )
}
