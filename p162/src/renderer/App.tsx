import { useState } from 'react'
import { Radio, Minus, Square, X } from 'lucide-react'
import { StatusPanel } from './components/StatusPanel'
import { ParameterDisplay } from './components/ParameterDisplay'
import { CommandTerminal } from './components/CommandTerminal'
import { WaveformDisplay } from './components/WaveformDisplay'
import { ControlPanel } from './components/ControlPanel'
import { DeviceList } from './components/DeviceList'

function App() {
  const [isMaximized, setIsMaximized] = useState(false)

  const handleMinimize = () => {
    if (window.electronAPI) {
      window.electronAPI.minimize()
    }
  }

  const handleMaximize = async () => {
    if (window.electronAPI) {
      const result = await window.electronAPI.maximize()
      setIsMaximized(result)
    }
  }

  const handleClose = () => {
    if (window.electronAPI) {
      window.electronAPI.close()
    }
  }

  return (
    <div className="h-screen flex flex-col bg-dark-900">
      <div className="titlebar flex items-center justify-between px-4 py-2 bg-dark-800 border-b border-dark-700">
        <div className="flex items-center gap-2">
          <Radio className="w-5 h-5 text-primary" />
          <span className="font-semibold text-white">HART FSK Modem</span>
          <span className="text-xs text-dark-600 ml-2">v1.0.0</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={handleMinimize}
            className="w-8 h-8 flex items-center justify-center text-dark-600 hover:text-white hover:bg-dark-700 rounded transition-colors"
            title="Minimize"
          >
            <Minus className="w-4 h-4" />
          </button>
          <button
            onClick={handleMaximize}
            className="w-8 h-8 flex items-center justify-center text-dark-600 hover:text-white hover:bg-dark-700 rounded transition-colors"
            title="Maximize"
          >
            <Square className="w-4 h-4" />
          </button>
          <button
            onClick={handleClose}
            className="w-8 h-8 flex items-center justify-center text-dark-600 hover:text-white hover:bg-danger rounded transition-colors"
            title="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4">
        <div className="space-y-4 max-w-[1600px] mx-auto">
          <StatusPanel />
          
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
            <div className="lg:col-span-3 space-y-4">
              <ParameterDisplay />
              <WaveformDisplay />
            </div>
            
            <div className="space-y-4">
              <ControlPanel />
              <DeviceList />
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-3">
              <CommandTerminal />
            </div>
          </div>
        </div>
      </div>

      <div className="px-4 py-2 bg-dark-800 border-t border-dark-700 text-xs text-dark-600 flex justify-between">
        <span>HART Protocol - Bell 202 FSK Modulation</span>
        <span>1200/2200 Hz @ 1200 Baud</span>
      </div>
    </div>
  )
}

export default App
