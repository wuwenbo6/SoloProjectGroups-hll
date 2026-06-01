import { useState } from 'react'
import { Terminal, Send, Trash2, Play, Pause, Zap, Cpu, Layers } from 'lucide-react'
import { useDeviceStore } from '../store/deviceStore'
import { useHART } from '../hooks/useHART'
import { HART_COMMANDS } from '../../shared/types'

export function CommandTerminal() {
  const { logs, clearLogs, isPolling, selectedDevice, multiDeviceConfig } = useDeviceStore()
  const { sendCommand, startPollingDevice, stopPollingDevice, startMultiDevicePolling, stopMultiDevicePolling, simulateData } = useHART()
  const [customCommand, setCustomCommand] = useState('')
  const [selectedCommand, setSelectedCommand] = useState<number>(3)
  const [pollingMode, setPollingMode] = useState<'single' | 'multi'>('single')

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('en-US', { hour12: false })
  }

  const getLogColor = (type: string) => {
    switch (type) {
      case 'send': return 'text-primary'
      case 'receive': return 'text-success'
      case 'error': return 'text-danger'
      default: return 'text-dark-600'
    }
  }

  const getLogPrefix = (type: string) => {
    switch (type) {
      case 'send': return '→'
      case 'receive': return '←'
      case 'error': return '✗'
      default: return 'ℹ'
    }
  }

  const handleSendCommand = () => {
    const cmd = customCommand ? parseInt(customCommand, 10) : selectedCommand
    if (!isNaN(cmd)) {
      sendCommand(cmd)
    }
  }

  return (
    <div className="bg-dark-800 border border-dark-700 rounded flex flex-col h-full">
      <div className="flex items-center justify-between p-4 border-b border-dark-700">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Terminal className="w-5 h-5 text-primary" />
            <h3 className="text-white font-semibold">Command Terminal</h3>
          </div>
          <div className="flex items-center gap-2 px-3 py-1 bg-dark-900 rounded text-sm">
            <Cpu className="w-4 h-4 text-primary" />
            <span className="text-dark-400">Target:</span>
            <span className="text-white font-mono">{selectedDevice}</span>
          </div>
        </div>
        <button
          onClick={clearLogs}
          className="p-1.5 text-dark-600 hover:text-danger transition-colors"
          title="Clear logs"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 font-mono text-sm space-y-1 min-h-[200px] max-h-[300px]">
        {logs.length === 0 ? (
          <div className="text-dark-600 text-center py-8">
            No logs yet. Send a command to start.
          </div>
        ) : (
          logs.map((log, index) => (
            <div key={index} className={`${getLogColor(log.type)} flex gap-2`}>
              <span className="text-dark-600">[{formatTime(log.timestamp)}]</span>
              <span>{getLogPrefix(log.type)}</span>
              <span>{log.message}</span>
              {log.data && <span className="text-dark-600">({log.data})</span>}
            </div>
          ))
        )}
      </div>

      <div className="p-4 border-t border-dark-700 space-y-3">
        <div className="flex gap-2 flex-wrap">
          {HART_COMMANDS.slice(0, 4).map((cmd) => (
            <button
              key={cmd.id}
              onClick={() => {
                setSelectedCommand(cmd.id)
                sendCommand(cmd.id)
              }}
              className="px-3 py-1.5 bg-dark-900 border border-dark-700 rounded text-white text-sm hover:border-primary hover:text-primary transition-colors"
            >
              CMD {cmd.id}
            </button>
          ))}
          <button
            onClick={simulateData}
            className="px-3 py-1.5 bg-dark-900 border border-dark-700 rounded text-warning text-sm hover:border-warning transition-colors flex items-center gap-1"
          >
            <Zap className="w-3 h-3" /> Simulate
          </button>
        </div>

        <div className="flex gap-2">
          <select
            value={selectedCommand}
            onChange={(e) => setSelectedCommand(Number(e.target.value))}
            className="flex-1 bg-dark-900 border border-dark-700 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-primary"
          >
            {HART_COMMANDS.map((cmd) => (
              <option key={cmd.id} value={cmd.id}>
                CMD {cmd.id} - {cmd.name}
              </option>
            ))}
          </select>
          <input
            type="text"
            placeholder="Custom cmd #"
            value={customCommand}
            onChange={(e) => setCustomCommand(e.target.value)}
            className="w-24 bg-dark-900 border border-dark-700 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-primary font-mono"
          />
          <button
            onClick={handleSendCommand}
            className="px-4 py-2 bg-primary text-white rounded hover:bg-secondary transition-colors flex items-center gap-2"
          >
            <Send className="w-4 h-4" /> Send
          </button>
        </div>

        <div className="flex gap-2">
          <div className="flex bg-dark-900 rounded overflow-hidden border border-dark-700">
            <button
              onClick={() => setPollingMode('single')}
              className={`px-3 py-1 text-sm transition-colors ${pollingMode === 'single' ? 'bg-primary text-white' : 'text-dark-400 hover:text-white'}`}
            >
              Single
            </button>
            <button
              onClick={() => setPollingMode('multi')}
              className={`px-3 py-1 text-sm transition-colors flex items-center gap-1 ${pollingMode === 'multi' ? 'bg-primary text-white' : 'text-dark-400 hover:text-white'}`}
            >
              <Layers className="w-3 h-3" /> Multi
            </button>
          </div>
          {isPolling ? (
            <button
              onClick={pollingMode === 'single' ? stopPollingDevice : stopMultiDevicePolling}
              className="flex-1 px-4 py-2 bg-danger text-white rounded hover:bg-red-600 transition-colors flex items-center justify-center gap-2"
            >
              <Pause className="w-4 h-4" /> Stop Polling
            </button>
          ) : (
            <button
              onClick={pollingMode === 'single' ? startPollingDevice : startMultiDevicePolling}
              className="flex-1 px-4 py-2 bg-success text-white rounded hover:bg-green-600 transition-colors flex items-center justify-center gap-2"
            >
              <Play className="w-4 h-4" />
              {pollingMode === 'single' ? 'Start Polling' : `Scan 0x${multiDeviceConfig.startAddress.toString(16)}-0x${multiDeviceConfig.endAddress.toString(16)}`}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
