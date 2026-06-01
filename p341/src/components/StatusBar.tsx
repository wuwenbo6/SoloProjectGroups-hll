import { Zap, Usb, Download } from 'lucide-react'
import { useState, useRef, useEffect } from 'react'
import { usePDStore } from '../store/pd-store'

export function StatusBar() {
  const { deviceStatus, negotiation, exportPowerCurveCSV, exportMessagesCSV } = usePDStore()
  const [showExportMenu, setShowExportMenu] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowExportMenu(false)
      }
    }
    if (showExportMenu) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showExportMenu])

  const downloadCSV = (csv: string, filename: string) => {
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
    setShowExportMenu(false)
  }

  return (
    <div className="h-16 bg-[#1A2733] border-b border-[#2A3B4C] flex items-center px-6 justify-between">
      <div className="flex items-center gap-6">
        <div className="flex items-center gap-3">
          <Usb className="w-5 h-5 text-[#00D4FF]" />
          <div className="flex items-center gap-2">
            <span
              className={`w-3 h-3 rounded-full ${
                deviceStatus.connected ? 'bg-[#00FF88] animate-pulse' : 'bg-gray-500'
              }`}
            />
            <span className="text-sm text-gray-400">
              {deviceStatus.connected ? '已连接' : '未连接'}
            </span>
          </div>
        </div>
        {deviceStatus.connected && (
          <div className="flex items-center gap-4 text-sm">
            <span className="text-white font-medium">{deviceStatus.deviceName || 'PD Analyzer'}</span>
            <span className="text-gray-500">|</span>
            <span className="text-gray-400">
              Firmware: {deviceStatus.firmwareVersion || 'v1.0.0'}
            </span>
          </div>
        )}
      </div>
      <div className="flex items-center gap-8">
        <div className="flex items-center gap-3">
          <Zap className="w-6 h-6 text-[#00D4FF]" />
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-bold text-[#00D4FF] text-glow-cyan font-mono">
              {negotiation.activeVoltage.toFixed(1)}
            </span>
            <span className="text-lg text-[#00D4FF]">V</span>
          </div>
        </div>
        <div className="w-px h-8 bg-[#2A3B4C]" />
        <div className="flex items-baseline gap-2">
          <span className="text-3xl font-bold text-[#00D4FF] text-glow-cyan font-mono">
            {negotiation.activeCurrent.toFixed(2)}
          </span>
          <span className="text-lg text-[#00D4FF]">A</span>
        </div>
        <div className="w-px h-8 bg-[#2A3B4C]" />
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-bold text-[#00FF88] text-glow-green font-mono">
            {(negotiation.activeVoltage * negotiation.activeCurrent).toFixed(1)}
          </span>
          <span className="text-base text-[#00FF88]">W</span>
        </div>
        <div className="w-px h-8 bg-[#2A3B4C]" />
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setShowExportMenu(!showExportMenu)}
            className="flex items-center gap-2 px-3 py-1.5 rounded bg-[#2A3B4C] hover:bg-[#3A4B5C] text-gray-300 hover:text-white transition-colors text-sm"
          >
            <Download className="w-4 h-4" />
            <span>导出CSV</span>
          </button>
          {showExportMenu && (
            <div className="absolute right-0 top-full mt-1 w-56 bg-[#1A2733] border border-[#2A3B4C] rounded shadow-lg z-50">
              <button
                onClick={() => downloadCSV(exportPowerCurveCSV(), 'power_curve.csv')}
                className="w-full text-left px-4 py-2.5 text-sm text-gray-300 hover:bg-[#2A3B4C] hover:text-white transition-colors rounded-t"
              >
                导出供电曲线CSV
              </button>
              <button
                onClick={() => downloadCSV(exportMessagesCSV(), 'messages.csv')}
                className="w-full text-left px-4 py-2.5 text-sm text-gray-300 hover:bg-[#2A3B4C] hover:text-white transition-colors rounded-b"
              >
                导出消息日志CSV
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
