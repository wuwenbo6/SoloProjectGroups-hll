import { Trash2, AlertTriangle, Zap } from 'lucide-react'
import { usePDStore } from '../store/pd-store'
import type { PDMessageType } from '../types/pd'

const messageTypeColors: Record<PDMessageType | 'ALL', string> = {
  SOURCE_CAPABILITIES: '#00D4FF',
  REQUEST: '#FFB800',
  ACCEPT: '#00FF88',
  REJECT: '#FF4757',
  PS_RDY: '#00FF88',
  GOODCRC: '#6B7280',
  BIST: '#6B7280',
  SINK_CAPABILITIES: '#00D4FF',
  BATTERY_STATUS: '#6B7280',
  ALERT: '#FF4757',
  GET_SOURCE_CAP: '#6B7280',
  GET_SINK_CAP: '#6B7280',
  DR_SWAP: '#FFB800',
  PR_SWAP: '#FFB800',
  VCONN_SWAP: '#FFB800',
  WAIT: '#6B7280',
  NOT_SUPPORTED: '#FF4757',
  GOTOMIN: '#6B7280',
  SOFT_RESET: '#FF4757',
  HARD_RESET: '#FF4757',
  VENDOR_DEFINED: '#6B7280',
  PPS_STATUS: '#FFB800',
  SOURCE_CAPABILITIES_EXTENDED: '#00D4FF',
  BATTERY_CAPABILITIES: '#6B7280',
  SINK_CAPABILITIES_EXTENDED: '#00D4FF',
  ALL: '#6B7280',
}

const filterOptions: (PDMessageType | 'ALL')[] = [
  'ALL',
  'SOURCE_CAPABILITIES',
  'REQUEST',
  'ACCEPT',
  'REJECT',
  'PS_RDY',
  'GOODCRC',
  'SOFT_RESET',
  'HARD_RESET',
]

export function MessageList() {
  const {
    getFilteredMessages,
    selectedMessageId,
    filterType,
    selectMessage,
    setFilterType,
    clearMessages,
    hardResetEvents,
    messageIdGapEvents,
  } = usePDStore()

  const messages = getFilteredMessages()

  const formatTimestamp = (ts: number) => {
    const date = new Date(ts)
    return date.toLocaleTimeString('zh-CN', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      fractionalSecondDigits: 3,
    } as Intl.DateTimeFormatOptions)
  }

  const getMessageSummary = (msg: { header: { messageType: PDMessageType; numDataObjects: number }; _label?: string }) => {
    if (msg._label) return msg._label
    const { messageType, numDataObjects } = msg.header
    if (numDataObjects > 0) {
      return `${messageType} (${numDataObjects} DOs)`
    }
    return messageType
  }

  return (
    <div className="h-full flex flex-col bg-[#1A2733] border-r border-[#2A3B4C]">
      <div className="p-4 border-b border-[#2A3B4C] flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-1">
          <span className="text-sm text-gray-400">筛选:</span>
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value as PDMessageType | 'ALL')}
            className="flex-1 bg-[#0F1923] border border-[#2A3B4C] rounded px-3 py-1.5 text-sm text-white focus:outline-none focus:border-[#00D4FF]"
          >
            {filterOptions.map((type) => (
              <option key={type} value={type}>
                {type === 'ALL' ? '全部消息' : type}
              </option>
            ))}
          </select>
        </div>
        <button
          onClick={clearMessages}
          className="p-2 rounded bg-[#0F1923] border border-[#2A3B4C] text-gray-400 hover:text-[#FF4757] hover:border-[#FF4757] transition-colors"
          title="清空消息"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      {messageIdGapEvents.length > 0 && (
        <div className="px-4 py-2 bg-[#FFB800]/10 border-b border-[#FFB800]/20">
          <div className="flex items-center gap-2 text-[#FFB800] text-xs">
            <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
            <span>MsgID Gap: 期望 {messageIdGapEvents[messageIdGapEvents.length - 1].expectedId}，收到 {messageIdGapEvents[messageIdGapEvents.length - 1].receivedId} → 请求重传</span>
          </div>
        </div>
      )}

      {hardResetEvents.length > 0 && (
        <div className="px-4 py-2 bg-[#FF4757]/10 border-b border-[#FF4757]/20">
          <div className="flex items-center gap-2 text-[#FF4757] text-xs">
            <Zap className="w-3.5 h-3.5 flex-shrink-0" />
            <span>Hard Reset 触发 → 重新发起协商</span>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto scrollbar-thin">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-500">
            <p className="text-sm">暂无消息</p>
            <p className="text-xs mt-1">开始模拟以捕获PD消息</p>
          </div>
        ) : (
          <div className="p-2 space-y-1">
            {messages.map((msg) => (
              <div
                key={msg.id}
                onClick={() => selectMessage(msg.id)}
                className={`p-3 rounded cursor-pointer transition-all ${
                  selectedMessageId === msg.id
                    ? 'bg-[#2A3B4C] border border-[#00D4FF]'
                    : msg._isHardReset
                      ? 'bg-[#FF4757]/10 border border-[#FF4757]/30 hover:border-[#FF4757]/60'
                      : msg._meta?.messageIdGap
                        ? 'bg-[#FFB800]/10 border border-[#FFB800]/30 hover:border-[#FFB800]/60'
                        : 'bg-[#0F1923] border border-transparent hover:border-[#2A3B4C]'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span
                    className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{ backgroundColor: messageTypeColors[msg.header.messageType] }}
                  />
                  <span className="text-xs text-gray-500 font-mono flex-shrink-0">
                    {formatTimestamp(msg.timestamp)}
                  </span>
                  {msg._isHardReset && (
                    <span className="px-1.5 py-0.5 bg-[#FF4757] text-white text-[10px] rounded font-bold flex-shrink-0">
                      HARD RESET
                    </span>
                  )}
                  {msg._meta?.messageIdGap && (
                    <span className="px-1.5 py-0.5 bg-[#FFB800] text-[#0F1923] text-[10px] rounded font-bold flex-shrink-0">
                      MSG_ID GAP
                    </span>
                  )}
                </div>
                <div className="mt-1 text-sm text-white font-medium">
                  {getMessageSummary(msg)}
                </div>
                <div className="mt-1 text-xs text-gray-500 font-mono">
                  {msg.direction} • ID: {msg.header.messageId}
                  {msg._meta?.messageIdGap && (
                    <span className="text-[#FFB800] ml-2">
                      (期望: {msg._meta.expectedId}, 收到: {msg._meta.receivedId})
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="p-3 border-t border-[#2A3B4C] text-xs text-gray-500 flex items-center justify-between">
        <span>共 {messages.length} 条消息</span>
        {(messageIdGapEvents.length > 0 || hardResetEvents.length > 0) && (
          <span className="text-[#FFB800]">
            {messageIdGapEvents.length > 0 && `${messageIdGapEvents.length} Gap`}
            {messageIdGapEvents.length > 0 && hardResetEvents.length > 0 && ' · '}
            {hardResetEvents.length > 0 && `${hardResetEvents.length} Reset`}
          </span>
        )}
      </div>
    </div>
  )
}
