import { CheckCircle, Loader2, AlertTriangle, Zap, RotateCcw } from 'lucide-react'
import { usePDStore } from '../store/pd-store'

const phases = [
  { key: 'idle', label: 'Idle', description: '等待连接' },
  { key: 'capabilities_sent', label: 'Capabilities', description: '能力通告' },
  { key: 'request_sent', label: 'Request', description: '请求发送' },
  { key: 'accepted', label: 'Accept', description: '请求接受' },
  { key: 'power_transition', label: 'Power Transition', description: '功率转换' },
  { key: 'ready', label: 'Ready', description: '协商完成' },
]

const extraPhases = [
  { key: 'msgid_gap', label: 'MsgID Gap', description: '消息ID不连续', icon: 'gap' },
  { key: 'retransmitting', label: 'Retransmit', description: '重传请求中', icon: 'retransmit' },
  { key: 'hard_reset', label: 'Hard Reset', description: '硬复位', icon: 'reset' },
]

export function TimelineView() {
  const { negotiation, hardResetEvents, messageIdGapEvents } = usePDStore()

  const getPhaseIndex = (phase: string) => {
    return phases.findIndex((p) => p.key === phase)
  }

  const currentPhaseIndex = getPhaseIndex(negotiation.phase)
  const isRejected = negotiation.phase === 'rejected'
  const isMsgIdGap = negotiation.phase === 'msgid_gap'
  const isRetransmitting = negotiation.phase === 'retransmitting'
  const isHardReset = negotiation.phase === 'hard_reset'
  const isExtraPhase = isMsgIdGap || isRetransmitting || isHardReset

  const getActiveExtraPhase = () => {
    if (isMsgIdGap) return extraPhases.find((p) => p.key === 'msgid_gap')
    if (isRetransmitting) return extraPhases.find((p) => p.key === 'retransmitting')
    if (isHardReset) return extraPhases.find((p) => p.key === 'hard_reset')
    return null
  }

  const activeExtra = getActiveExtraPhase()

  return (
    <div className="h-full bg-[#1A2733] border-b border-[#2A3B4C] p-6 overflow-y-auto scrollbar-thin">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-semibold text-white">协商时间线</h2>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <div className="text-xs text-gray-500">目标电压</div>
            <div className="text-lg font-bold text-[#00D4FF] font-mono">
              {negotiation.requestedVoltage > 0
                ? `${negotiation.requestedVoltage.toFixed(1)}V`
                : '-'}
            </div>
          </div>
          <div className="text-right">
            <div className="text-xs text-gray-500">目标电流</div>
            <div className="text-lg font-bold text-[#00FF88] font-mono">
              {negotiation.requestedCurrent > 0
                ? `${negotiation.requestedCurrent.toFixed(2)}A`
                : '-'}
            </div>
          </div>
        </div>
      </div>
      <div className="relative">
        <div className="absolute top-5 left-0 right-0 h-0.5 bg-[#2A3B4C]" />
        <div
          className="absolute top-5 left-0 h-0.5 bg-[#00D4FF] transition-all duration-500"
          style={{
            width: `${isRejected || isExtraPhase ? 0 : (currentPhaseIndex / (phases.length - 1)) * 100}%`,
          }}
        />
        <div className="relative flex justify-between">
          {phases.map((phase, index) => {
            const isActive = index === currentPhaseIndex && !isExtraPhase
            const isCompleted = index < currentPhaseIndex && !isRejected && !isExtraPhase
            const isRejectedPhase = isRejected && index <= currentPhaseIndex

            return (
              <div key={phase.key} className="flex flex-col items-center">
                <div
                  className={`relative w-10 h-10 rounded-full flex items-center justify-center transition-all duration-300 ${
                    isActive
                      ? 'bg-[#00D4FF] glow-cyan'
                      : isCompleted
                        ? 'bg-[#00FF88]'
                        : isRejectedPhase
                          ? 'bg-[#FF4757]'
                          : 'bg-[#2A3B4C]'
                  }`}
                >
                  {isCompleted ? (
                    <CheckCircle className="w-5 h-5 text-[#0F1923]" />
                  ) : isActive ? (
                    <Loader2 className="w-5 h-5 text-white animate-spin" />
                  ) : (
                    <span
                      className={`text-sm font-bold ${
                        isRejectedPhase ? 'text-white' : 'text-gray-500'
                      }`}
                    >
                      {index + 1}
                    </span>
                  )}
                </div>
                <div className="mt-3 text-center">
                  <div
                    className={`text-sm font-medium ${
                      isActive
                        ? 'text-[#00D4FF]'
                        : isCompleted
                          ? 'text-[#00FF88]'
                          : isRejectedPhase
                            ? 'text-[#FF4757]'
                            : 'text-gray-500'
                    }`}
                  >
                    {phase.label}
                  </div>
                  <div className="text-xs text-gray-600 mt-1">{phase.description}</div>
                </div>
              </div>
            )
          })}
        </div>

        {isExtraPhase && activeExtra && (
          <div className="mt-8">
            <div className="flex items-center justify-center gap-3">
              <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
                isHardReset ? 'bg-[#FF4757] glow-red' : 'bg-[#FFB800] glow-amber'
              }`}>
                {activeExtra.icon === 'reset' && <Zap className="w-6 h-6 text-white" />}
                {activeExtra.icon === 'gap' && <AlertTriangle className="w-6 h-6 text-[#0F1923]" />}
                {activeExtra.icon === 'retransmit' && <RotateCcw className="w-6 h-6 text-[#0F1923] animate-spin" />}
              </div>
              <div>
                <div className={`text-lg font-bold ${
                  isHardReset ? 'text-[#FF4757]' : 'text-[#FFB800]'
                }`}>
                  {activeExtra.label}
                </div>
                <div className="text-sm text-gray-500">{activeExtra.description}</div>
              </div>
            </div>
          </div>
        )}

        {isRejected && (
          <div className="mt-6 p-4 bg-[#FF4757]/10 border border-[#FF4757]/30 rounded-lg text-center">
            <span className="text-[#FF4757] font-medium">协商被拒绝</span>
          </div>
        )}
        {negotiation.phase === 'ready' && (
          <div className="mt-6 p-4 bg-[#00FF88]/10 border border-[#00FF88]/30 rounded-lg text-center">
            <span className="text-[#00FF88] font-medium">
              协商完成 - {negotiation.activeVoltage.toFixed(1)}V @ {negotiation.activeCurrent.toFixed(2)}A (
              {(negotiation.activeVoltage * negotiation.activeCurrent).toFixed(1)}W)
            </span>
          </div>
        )}

        {hardResetEvents.length > 0 && (
          <div className="mt-4 p-3 bg-[#FF4757]/5 border border-[#FF4757]/20 rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <Zap className="w-4 h-4 text-[#FF4757]" />
              <span className="text-sm font-medium text-[#FF4757]">Hard Reset 事件记录</span>
            </div>
            {hardResetEvents.map((evt, i) => (
              <div key={i} className="text-xs text-gray-400 font-mono ml-6">
                {new Date(evt.timestamp).toLocaleTimeString('zh-CN', { hour12: false })} - {evt.message}
              </div>
            ))}
          </div>
        )}

        {messageIdGapEvents.length > 0 && (
          <div className="mt-3 p-3 bg-[#FFB800]/5 border border-[#FFB800]/20 rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="w-4 h-4 text-[#FFB800]" />
              <span className="text-sm font-medium text-[#FFB800]">MessageID Gap 事件记录</span>
            </div>
            {messageIdGapEvents.map((evt, i) => (
              <div key={i} className="text-xs text-gray-400 font-mono ml-6">
                {new Date(evt.timestamp).toLocaleTimeString('zh-CN', { hour12: false })} - 期望ID: {evt.expectedId}, 收到ID: {evt.receivedId} → Soft Reset & 重传
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
