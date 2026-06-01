import { X } from 'lucide-react'
import { usePDStore } from '../store/pd-store'

export function MessageDetail() {
  const { messages, selectedMessageId, selectMessage } = usePDStore()
  const selectedMessage = messages.find((m) => m.id === selectedMessageId)

  if (!selectedMessage) {
    return (
      <div className="h-full bg-[#1A2733] border-l border-[#2A3B4C] flex items-center justify-center">
        <div className="text-center text-gray-500">
          <p className="text-sm">选择一条消息</p>
          <p className="text-xs mt-1">查看详细解码信息</p>
        </div>
      </div>
    )
  }

  const formatHexDump = (hex: string) => {
    const bytes = hex.match(/.{1,2}/g) || []
    let result = ''
    for (let i = 0; i < bytes.length; i += 8) {
      const row = bytes.slice(i, i + 8)
      const offset = (i * 2).toString(16).padStart(4, '0')
      const hexPart = row.join(' ').padEnd(23)
      const asciiPart = row
        .map((b) => {
          const code = parseInt(b, 16)
          return code >= 32 && code <= 126 ? String.fromCharCode(code) : '.'
        })
        .join('')
      result += `${offset}:  ${hexPart}  ${asciiPart}\n`
    }
    return result.trim()
  }

  return (
    <div className="h-full bg-[#1A2733] border-l border-[#2A3B4C] flex flex-col animate-slide-in-right">
      <div className="p-4 border-b border-[#2A3B4C] flex items-center justify-between">
        <h2 className="text-lg font-semibold text-white">消息详情</h2>
        <button
          onClick={() => selectMessage(null)}
          className="p-1.5 rounded hover:bg-[#2A3B4C] text-gray-400 hover:text-white transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto scrollbar-thin p-4 space-y-6">
        <div>
          <h3 className="text-sm font-medium text-gray-400 mb-2">原始数据</h3>
          <div className="bg-[#0F1923] rounded p-3 font-mono text-xs text-[#00D4FF] overflow-x-auto">
            <pre>{formatHexDump(selectedMessage.rawHex)}</pre>
          </div>
        </div>
        <div>
          <h3 className="text-sm font-medium text-gray-400 mb-2">消息头</h3>
          <div className="bg-[#0F1923] rounded overflow-hidden">
            <table className="w-full text-sm">
              <tbody>
                <tr className="border-b border-[#2A3B4C]">
                  <td className="py-2 px-3 text-gray-500">消息类型</td>
                  <td className="py-2 px-3 text-white font-mono">
                    {selectedMessage.header.messageType}
                  </td>
                </tr>
                <tr className="border-b border-[#2A3B4C]">
                  <td className="py-2 px-3 text-gray-500">消息ID</td>
                  <td className="py-2 px-3 text-white font-mono">
                    {selectedMessage.header.messageId}
                  </td>
                </tr>
                <tr className="border-b border-[#2A3B4C]">
                  <td className="py-2 px-3 text-gray-500">数据角色</td>
                  <td className="py-2 px-3 text-white font-mono">
                    {selectedMessage.header.portDataRole}
                  </td>
                </tr>
                <tr className="border-b border-[#2A3B4C]">
                  <td className="py-2 px-3 text-gray-500">功率角色</td>
                  <td className="py-2 px-3 text-white font-mono">
                    {selectedMessage.header.portPowerRole}
                  </td>
                </tr>
                <tr className="border-b border-[#2A3B4C]">
                  <td className="py-2 px-3 text-gray-500">协议版本</td>
                  <td className="py-2 px-3 text-white font-mono">
                    PD {selectedMessage.header.specificationRevision}.0
                  </td>
                </tr>
                <tr>
                  <td className="py-2 px-3 text-gray-500">数据对象数</td>
                  <td className="py-2 px-3 text-white font-mono">
                    {selectedMessage.header.numDataObjects}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
        {selectedMessage.dataObjects && selectedMessage.dataObjects.length > 0 && (
          <div>
            <h3 className="text-sm font-medium text-gray-400 mb-2">
              数据对象 ({selectedMessage.dataObjects.length})
            </h3>
            <div className="space-y-3">
              {selectedMessage.dataObjects.map((pdo, index) => (
                <div
                  key={index}
                  className="bg-[#0F1923] rounded p-3 border border-[#2A3B4C]"
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs text-gray-500">PDO #{index + 1}</span>
                    <span className="text-xs px-2 py-0.5 rounded bg-[#2A3B4C] text-gray-300 capitalize">
                      {pdo.type}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <span className="text-gray-500 text-xs">电压</span>
                      <div className="text-[#00D4FF] font-mono">
                        {(pdo.voltageMV / 1000).toFixed(1)}V
                      </div>
                    </div>
                    <div>
                      <span className="text-gray-500 text-xs">电流</span>
                      <div className="text-[#00FF88] font-mono">
                        {(pdo.currentMA / 1000).toFixed(2)}A
                      </div>
                    </div>
                    <div className="col-span-2">
                      <span className="text-gray-500 text-xs">功率</span>
                      <div className="text-white font-mono">
                        {(pdo.maxPowerMW / 1000).toFixed(1)}W
                      </div>
                    </div>
                    {pdo.type === 'apsdo' && pdo.minVoltageMV != null && pdo.maxVoltageMV != null && (
                      <div className="col-span-2">
                        <span className="text-gray-500 text-xs">电压范围</span>
                        <div className="text-[#FFD700] font-mono">
                          {(pdo.minVoltageMV / 1000).toFixed(1)}V - {(pdo.maxVoltageMV / 1000).toFixed(1)}V
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="mt-2 pt-2 border-t border-[#2A3B4C]">
                    <span className="text-xs text-gray-500">Raw: </span>
                    <span className="text-xs text-gray-400 font-mono">
                      0x{pdo.rawValue.toString(16).toUpperCase().padStart(8, '0')}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        {selectedMessage.extendedData && (
          <div>
            <h3 className="text-sm font-medium text-gray-400 mb-2">扩展消息数据</h3>
            <div className="bg-[#0F1923] rounded overflow-hidden">
              <table className="w-full text-sm">
                <tbody>
                  <tr className="border-b border-[#2A3B4C]">
                    <td className="py-2 px-3 text-gray-500">消息类型</td>
                    <td className="py-2 px-3 text-white font-mono">
                      {selectedMessage.extendedData.messageType}
                    </td>
                  </tr>
                  <tr className="border-b border-[#2A3B4C]">
                    <td className="py-2 px-3 text-gray-500">原始数据</td>
                    <td className="py-2 px-3 text-gray-300 font-mono text-xs">
                      [{selectedMessage.extendedData.rawData.join(', ')}]
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            {selectedMessage.extendedData.ppsStatus && (
              <div className="mt-3">
                <h4 className="text-xs font-medium text-gray-500 mb-1.5">PPS Status</h4>
                <div className="bg-[#0F1923] rounded overflow-hidden">
                  <table className="w-full text-sm">
                    <tbody>
                      <tr className="border-b border-[#2A3B4C]">
                        <td className="py-2 px-3 text-gray-500">输出电压</td>
                        <td className="py-2 px-3 text-[#00D4FF] font-mono">
                          {(selectedMessage.extendedData.ppsStatus.outputVoltageMV / 1000).toFixed(2)}V
                        </td>
                      </tr>
                      <tr className="border-b border-[#2A3B4C]">
                        <td className="py-2 px-3 text-gray-500">输出电流</td>
                        <td className="py-2 px-3 text-[#00FF88] font-mono">
                          {(selectedMessage.extendedData.ppsStatus.outputCurrentMA / 1000).toFixed(2)}A
                        </td>
                      </tr>
                      <tr className="border-b border-[#2A3B4C]">
                        <td className="py-2 px-3 text-gray-500">标志位</td>
                        <td className="py-2 px-3">
                          <div className="flex flex-wrap gap-1.5">
                            {selectedMessage.extendedData.ppsStatus.flags.overCurrent && (
                              <span className="px-1.5 py-0.5 text-xs rounded bg-red-900/50 text-red-400">过流</span>
                            )}
                            {selectedMessage.extendedData.ppsStatus.flags.overVoltage && (
                              <span className="px-1.5 py-0.5 text-xs rounded bg-red-900/50 text-red-400">过压</span>
                            )}
                            {selectedMessage.extendedData.ppsStatus.flags.powerLimited && (
                              <span className="px-1.5 py-0.5 text-xs rounded bg-yellow-900/50 text-yellow-400">功率受限</span>
                            )}
                            {selectedMessage.extendedData.ppsStatus.flags.sourcePpsCapable && (
                              <span className="px-1.5 py-0.5 text-xs rounded bg-green-900/50 text-green-400">Source PPS</span>
                            )}
                            {selectedMessage.extendedData.ppsStatus.flags.sinkPpsCapable && (
                              <span className="px-1.5 py-0.5 text-xs rounded bg-green-900/50 text-green-400">Sink PPS</span>
                            )}
                          </div>
                        </td>
                      </tr>
                      <tr>
                        <td className="py-2 px-3 text-gray-500">原始字节</td>
                        <td className="py-2 px-3 text-gray-400 font-mono text-xs">
                          0x{selectedMessage.extendedData.ppsStatus.rawByte.toString(16).toUpperCase().padStart(2, '0')}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            )}
            {selectedMessage.extendedData.sourceCapExtended && (
              <div className="mt-3">
                <h4 className="text-xs font-medium text-gray-500 mb-1.5">Source Cap Extended</h4>
                <div className="bg-[#0F1923] rounded overflow-hidden">
                  <table className="w-full text-sm">
                    <tbody>
                      <tr className="border-b border-[#2A3B4C]">
                        <td className="py-2 px-3 text-gray-500">VID</td>
                        <td className="py-2 px-3 text-white font-mono">
                          0x{selectedMessage.extendedData.sourceCapExtended.vid.toString(16).toUpperCase().padStart(4, '0')}
                        </td>
                      </tr>
                      <tr className="border-b border-[#2A3B4C]">
                        <td className="py-2 px-3 text-gray-500">PID</td>
                        <td className="py-2 px-3 text-white font-mono">
                          0x{selectedMessage.extendedData.sourceCapExtended.pid.toString(16).toUpperCase().padStart(4, '0')}
                        </td>
                      </tr>
                      <tr className="border-b border-[#2A3B4C]">
                        <td className="py-2 px-3 text-gray-500">XID</td>
                        <td className="py-2 px-3 text-white font-mono">
                          0x{selectedMessage.extendedData.sourceCapExtended.xid.toString(16).toUpperCase().padStart(8, '0')}
                        </td>
                      </tr>
                      <tr className="border-b border-[#2A3B4C]">
                        <td className="py-2 px-3 text-gray-500">FW版本</td>
                        <td className="py-2 px-3 text-white font-mono">
                          {selectedMessage.extendedData.sourceCapExtended.fwVersion}
                        </td>
                      </tr>
                      <tr>
                        <td className="py-2 px-3 text-gray-500">PDO数量</td>
                        <td className="py-2 px-3 text-white font-mono">
                          {selectedMessage.extendedData.sourceCapExtended.numPDOs}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
        <div>
          <h3 className="text-sm font-medium text-gray-400 mb-2">元数据</h3>
          <div className="bg-[#0F1923] rounded overflow-hidden">
            <table className="w-full text-sm">
              <tbody>
                <tr className="border-b border-[#2A3B4C]">
                  <td className="py-2 px-3 text-gray-500">方向</td>
                  <td className="py-2 px-3 text-white font-mono">{selectedMessage.direction}</td>
                </tr>
                <tr>
                  <td className="py-2 px-3 text-gray-500">时间戳</td>
                  <td className="py-2 px-3 text-white font-mono">
                    {new Date(selectedMessage.timestamp).toLocaleString()}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
