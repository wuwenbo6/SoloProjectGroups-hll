import { useState } from 'react'
import { Cpu, Wifi, WifiOff, Clock, ChevronRight, Play, Pause, Settings } from 'lucide-react'
import { useDeviceStore } from '../store/deviceStore'
import { useHART } from '../hooks/useHART'

export function DeviceList() {
  const { devices, selectedDevice, setSelectedDevice, multiDeviceConfig, setMultiDeviceConfig } = useDeviceStore()
  const { startMultiDevicePolling, stopMultiDevicePolling, simulateMultiDeviceData, isPolling } = useHART()
  const [showConfig, setShowConfig] = useState(false)

  const deviceList = Array.from(devices.values())

  const formatTime = (date: Date | null) => {
    if (!date) return '--:--:--'
    return date.toLocaleTimeString()
  }

  const formatValue = (value: number | null) => {
    if (value === null || isNaN(value)) return '---'
    return value.toFixed(2)
  }

  const handleAddressRangeChange = (type: 'start' | 'end', value: string) => {
    const num = parseInt(value, 16)
    if (!isNaN(num) && num >= 0 && num <= 15) {
      if (type === 'start') {
        setMultiDeviceConfig({ startAddress: num })
      } else {
        setMultiDeviceConfig({ endAddress: num })
      }
    }
  }

  const handlePollDelayChange = (value: string) => {
    const num = parseInt(value, 10)
    if (!isNaN(num) && num >= 100) {
      setMultiDeviceConfig({ pollDelay: num })
    }
  }

  return (
    <div className="bg-dark-800 border border-dark-700 rounded p-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Cpu className="w-5 h-5 text-primary" />
          <h3 className="text-white font-semibold">Device List</h3>
          <span className="text-dark-600 text-sm">({deviceList.length} devices)</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowConfig(!showConfig)}
            className={`p-1.5 rounded transition-colors ${showConfig ? 'bg-primary text-white' : 'text-dark-600 hover:text-white'}`}
            title="Polling Config"
          >
            <Settings className="w-4 h-4" />
          </button>
          {isPolling ? (
            <button
              onClick={stopMultiDevicePolling}
              className="p-1.5 bg-danger text-white rounded hover:bg-red-600 transition-colors"
              title="Stop Multi-Device Polling"
            >
              <Pause className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={startMultiDevicePolling}
              className="p-1.5 bg-success text-white rounded hover:bg-green-600 transition-colors"
              title="Start Multi-Device Polling"
            >
              <Play className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={simulateMultiDeviceData}
            className="px-3 py-1.5 bg-warning text-white text-sm rounded hover:bg-orange-600 transition-colors"
          >
            Simulate All
          </button>
        </div>
      </div>

      {showConfig && (
        <div className="mb-4 p-3 bg-dark-900 rounded border border-dark-700">
          <div className="text-sm text-dark-600 mb-2">Polling Configuration</div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs text-dark-600 mb-1">Start Address (Hex)</label>
              <input
                type="text"
                value={multiDeviceConfig.startAddress.toString(16).padStart(2, '0').toUpperCase()}
                onChange={(e) => handleAddressRangeChange('start', e.target.value)}
                className="w-full bg-dark-800 border border-dark-700 rounded px-2 py-1 text-white text-sm font-mono focus:outline-none focus:border-primary"
                maxLength={2}
              />
            </div>
            <div>
              <label className="block text-xs text-dark-600 mb-1">End Address (Hex)</label>
              <input
                type="text"
                value={multiDeviceConfig.endAddress.toString(16).padStart(2, '0').toUpperCase()}
                onChange={(e) => handleAddressRangeChange('end', e.target.value)}
                className="w-full bg-dark-800 border border-dark-700 rounded px-2 py-1 text-white text-sm font-mono focus:outline-none focus:border-primary"
                maxLength={2}
              />
            </div>
            <div>
              <label className="block text-xs text-dark-600 mb-1">Poll Delay (ms)</label>
              <input
                type="number"
                value={multiDeviceConfig.pollDelay}
                onChange={(e) => handlePollDelayChange(e.target.value)}
                className="w-full bg-dark-800 border border-dark-700 rounded px-2 py-1 text-white text-sm font-mono focus:outline-none focus:border-primary"
                min={100}
                step={100}
              />
            </div>
          </div>
        </div>
      )}

      {deviceList.length === 0 ? (
        <div className="text-center py-8 text-dark-600">
          <Cpu className="w-12 h-12 mx-auto mb-2 opacity-50" />
          <p>No devices detected</p>
          <p className="text-sm">Start polling or use "Simulate All" to generate test data</p>
        </div>
      ) : (
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {deviceList.map((device) => (
            <div
              key={device.address}
              onClick={() => setSelectedDevice(device.address)}
              className={`flex items-center gap-3 p-3 rounded cursor-pointer transition-colors ${
                selectedDevice === device.address
                  ? 'bg-primary/20 border border-primary'
                  : 'bg-dark-900 border border-dark-700 hover:border-dark-600'
              }`}
            >
              <div className="flex-shrink-0">
                {device.online ? (
                  <Wifi className="w-4 h-4 text-success" />
                ) : (
                  <WifiOff className="w-4 h-4 text-dark-600" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-white font-mono text-sm">{device.address}</span>
                  <span className={`text-xs px-1.5 py-0.5 rounded ${device.online ? 'bg-success/20 text-success' : 'bg-dark-600/20 text-dark-600'}`}>
                    {device.online ? 'Online' : 'Offline'}
                  </span>
                </div>
                <div className="flex items-center gap-3 mt-1 text-xs text-dark-600">
                  <span>PV: {formatValue(device.pv)} {device.units}</span>
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {formatTime(device.lastUpdate)}
                  </span>
                </div>
              </div>
              <ChevronRight className={`w-4 h-4 transition-colors ${selectedDevice === device.address ? 'text-primary' : 'text-dark-600'}`} />
            </div>
          ))}
        </div>
      )}

      <div className="mt-3 pt-3 border-t border-dark-700 flex items-center justify-between text-xs text-dark-600">
        <span>Address Range: 0x{multiDeviceConfig.startAddress.toString(16).padStart(2, '0').toUpperCase()} - 0x{multiDeviceConfig.endAddress.toString(16).padStart(2, '0').toUpperCase()}</span>
        <span>Interval: {multiDeviceConfig.pollDelay}ms</span>
      </div>
    </div>
  )
}
