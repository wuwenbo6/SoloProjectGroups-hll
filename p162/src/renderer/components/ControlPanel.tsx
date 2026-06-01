import { useState, useEffect } from 'react'
import { Settings, Power, PowerOff, Radio } from 'lucide-react'
import { useDeviceStore } from '../store/deviceStore'
import { useHART } from '../hooks/useHART'

interface AudioDevice {
  id: string
  name: string
}

export function ControlPanel() {
  const { isConnected, audioInitialized } = useDeviceStore()
  const { initialize, connectDevice, disconnectDevice } = useHART()
  const [inputDevices, setInputDevices] = useState<AudioDevice[]>([])
  const [outputDevices, setOutputDevices] = useState<AudioDevice[]>([])
  const [selectedInput, setSelectedInput] = useState('')
  const [selectedOutput, setSelectedOutput] = useState('')
  const [gain, setGain] = useState(80)

  useEffect(() => {
    const loadDevices = async () => {
      try {
        await navigator.mediaDevices.getUserMedia({ audio: true })
        const devices = await navigator.mediaDevices.enumerateDevices()
        
        setInputDevices(
          devices
            .filter(d => d.kind === 'audioinput')
            .map(d => ({ id: d.deviceId, name: d.label || `Input ${d.deviceId.slice(0, 8)}` }))
        )
        
        setOutputDevices(
          devices
            .filter(d => d.kind === 'audiooutput')
            .map(d => ({ id: d.deviceId, name: d.label || `Output ${d.deviceId.slice(0, 8)}` }))
        )
      } catch (error) {
        console.error('Failed to enumerate devices:', error)
      }
    }

    loadDevices()
    navigator.mediaDevices.addEventListener('devicechange', loadDevices)
    return () => navigator.mediaDevices.removeEventListener('devicechange', loadDevices)
  }, [])

  const handleInitialize = async () => {
    try {
      await initialize()
    } catch (error) {
      console.error('Initialization failed:', error)
    }
  }

  return (
    <div className="bg-dark-800 border border-dark-700 rounded p-4">
      <div className="flex items-center gap-2 mb-4">
        <Settings className="w-5 h-5 text-primary" />
        <h3 className="text-white font-semibold">Audio Control</h3>
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-dark-600 text-sm mb-1">Input Device</label>
          <select
            value={selectedInput}
            onChange={(e) => setSelectedInput(e.target.value)}
            disabled={isConnected}
            className="w-full bg-dark-900 border border-dark-700 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-primary disabled:opacity-50"
          >
            <option value="">Default Input</option>
            {inputDevices.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-dark-600 text-sm mb-1">Output Device</label>
          <select
            value={selectedOutput}
            onChange={(e) => setSelectedOutput(e.target.value)}
            disabled={isConnected}
            className="w-full bg-dark-900 border border-dark-700 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-primary disabled:opacity-50"
          >
            <option value="">Default Output</option>
            {outputDevices.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
        </div>

        <div>
          <div className="flex justify-between mb-1">
            <label className="text-dark-600 text-sm">Output Gain</label>
            <span className="text-primary text-sm font-mono">{gain}%</span>
          </div>
          <input
            type="range"
            min="0"
            max="100"
            value={gain}
            onChange={(e) => setGain(Number(e.target.value))}
            className="w-full accent-primary"
          />
        </div>

        <div className="grid grid-cols-2 gap-2">
          {!audioInitialized ? (
            <button
              onClick={handleInitialize}
              className="col-span-2 px-4 py-2 bg-dark-900 border border-primary text-primary rounded hover:bg-primary hover:text-white transition-colors flex items-center justify-center gap-2"
            >
              <Radio className="w-4 h-4" /> Initialize Audio
            </button>
          ) : isConnected ? (
            <button
              onClick={disconnectDevice}
              className="col-span-2 px-4 py-2 bg-danger text-white rounded hover:bg-red-600 transition-colors flex items-center justify-center gap-2"
            >
              <PowerOff className="w-4 h-4" /> Disconnect
            </button>
          ) : (
            <button
              onClick={connectDevice}
              className="col-span-2 px-4 py-2 bg-success text-white rounded hover:bg-green-600 transition-colors flex items-center justify-center gap-2"
            >
              <Power className="w-4 h-4" /> Connect Device
            </button>
          )}
        </div>
      </div>

      <div className="mt-4 pt-4 border-t border-dark-700">
        <div className="text-xs text-dark-600 space-y-1">
          <div className="flex justify-between">
            <span>Sample Rate:</span>
            <span className="text-dark-500">48000 Hz</span>
          </div>
          <div className="flex justify-between">
            <span>Baud Rate:</span>
            <span className="text-dark-500">1200</span>
          </div>
          <div className="flex justify-between">
            <span>Mark/Space:</span>
            <span className="text-dark-500">1200/2200 Hz</span>
          </div>
        </div>
      </div>
    </div>
  )
}
