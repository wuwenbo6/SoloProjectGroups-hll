import { useState } from 'react'
import { FileText, Download, BarChart3, TrendingUp, Zap, AlertCircle } from 'lucide-react'
import type { EnergyReport } from '../../shared/types'

interface EnergyReportProps {
  onExportCSV: () => void
  onExportJSON: () => void
  onRefresh: () => Promise<EnergyReport | null>
}

export function EnergyReportPanel({ onExportCSV, onExportJSON, onRefresh }: EnergyReportProps) {
  const [report, setReport] = useState<EnergyReport | null>(null)
  const [loading, setLoading] = useState(false)

  const handleRefresh = async () => {
    setLoading(true)
    const data = await onRefresh()
    setReport(data)
    setLoading(false)
  }

  const getEfficiencyColor = (score: number) => {
    if (score >= 80) return 'text-green-400'
    if (score >= 60) return 'text-yellow-400'
    return 'text-red-400'
  }

  const getEfficiencyBg = (score: number) => {
    if (score >= 80) return 'bg-green-400'
    if (score >= 60) return 'bg-yellow-400'
    return 'bg-red-400'
  }

  return (
    <div className="bg-gray-800/50 backdrop-blur-sm rounded-xl border border-gray-700/50 p-4">
      <div className="flex items-center justify-between mb-4">
        <h4 className="font-semibold text-white flex items-center gap-2">
          <FileText size={18} className="text-green-400" />
          能量预测报表
        </h4>
        <div className="flex gap-2">
          <button
            onClick={handleRefresh}
            disabled={loading}
            className="p-2 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 rounded-lg transition-colors"
            title="刷新报表"
          >
            <BarChart3 size={16} className="text-white" />
          </button>
          <button
            onClick={onExportCSV}
            className="p-2 bg-green-700 hover:bg-green-600 rounded-lg transition-colors"
            title="导出 CSV"
          >
            <Download size={16} className="text-white" />
          </button>
          <button
            onClick={onExportJSON}
            className="p-2 bg-blue-700 hover:bg-blue-600 rounded-lg transition-colors"
            title="导出 JSON"
          >
            <FileText size={16} className="text-white" />
          </button>
        </div>
      </div>

      {!report ? (
        <div className="text-center text-gray-500 py-8">
          <BarChart3 size={40} className="mx-auto mb-2 opacity-50" />
          <p>点击刷新按钮生成报表</p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="bg-gray-900/50 rounded-lg p-3">
            <div className="text-xs text-gray-400 mb-2">总体摘要</div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex items-center gap-2">
                <Zap size={14} className="text-green-400" />
                <div>
                  <div className="text-white font-bold" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                    {report.summary.totalEnergyHarvested}
                  </div>
                  <div className="text-xs text-gray-500">总收集能量</div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <TrendingUp size={14} className="text-blue-400" />
                <div>
                  <div className="text-white font-bold" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                    {report.summary.totalEnergyConsumed}
                  </div>
                  <div className="text-xs text-gray-500">总消耗能量</div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <AlertCircle size={14} className="text-red-400" />
                <div>
                  <div className="text-white font-bold" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                    {report.summary.totalCollisions}
                  </div>
                  <div className="text-xs text-gray-500">总碰撞数</div>
                </div>
              </div>
              <div>
                <div className={`font-bold ${getEfficiencyColor(report.summary.averageEfficiency)}`} style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                  {report.summary.averageEfficiency}%
                </div>
                <div className="text-xs text-gray-500">平均效率</div>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <div className="text-xs text-gray-400">设备详情</div>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {report.devices.map((device) => (
                <div
                  key={device.deviceId}
                  className="bg-gray-900/30 rounded-lg p-2 flex items-center justify-between"
                >
                  <div>
                    <div className="text-sm text-white font-medium">{device.deviceId}</div>
                    <div className="text-xs text-gray-500">
                      发送: {device.framesSent} | 碰撞: {device.collisions}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-20 bg-gray-700 rounded-full h-2">
                      <div
                        className={`h-2 rounded-full ${getEfficiencyBg(device.efficiencyScore)}`}
                        style={{ width: `${Math.min(device.efficiencyScore, 100)}%` }}
                      />
                    </div>
                    <span className={`text-xs font-bold ${getEfficiencyColor(device.efficiencyScore)}`} style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                      {device.efficiencyScore}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="text-xs text-gray-500 text-center">
            生成时间: {new Date(report.generatedAt).toLocaleString()}
          </div>
        </div>
      )}
    </div>
  )
}
