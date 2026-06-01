import { useEffect, useRef } from 'react'
import { StatusBar } from '../components/StatusBar'
import { MessageList } from '../components/MessageList'
import { TimelineView } from '../components/TimelineView'
import { PowerChart } from '../components/PowerChart'
import { MessageDetail } from '../components/MessageDetail'
import { SimulationControl } from '../components/SimulationControl'
import { usePDStore } from '../store/pd-store'
import type { PDMessage, NegotiationState, PowerCurvePoint, DeviceStatus, MessageIdGapEvent, HardResetEvent } from '../types/pd'

export default function Home() {
  const {
    addMessage,
    updateNegotiation,
    addPowerCurvePoint,
    updateDeviceStatus,
    addMessageIdGapEvent,
    addHardResetEvent,
    isSimulating,
    currentScenario,
    simulationSpeed,
    setSimulating,
  } = usePDStore()

  const powerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const mockTimeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([])

  useEffect(() => {
    if (window.electronAPI) {
      window.electronAPI.onMessage((msg: PDMessage) => {
        addMessage(msg)
      })

      window.electronAPI.onNegotiationUpdate((state: NegotiationState) => {
        updateNegotiation(state)
      })

      window.electronAPI.onPowerCurvePoint((point: PowerCurvePoint) => {
        addPowerCurvePoint(point)
      })

      window.electronAPI.onDeviceStatus((status: DeviceStatus) => {
        updateDeviceStatus(status)
      })

      window.electronAPI.onMessageIdGap((event: MessageIdGapEvent) => {
        addMessageIdGapEvent(event)
      })

      window.electronAPI.onHardReset((event: HardResetEvent) => {
        addHardResetEvent(event)
      })
    } else {
      const mockDeviceStatus: DeviceStatus = {
        connected: true,
        deviceName: 'PD Analyzer Pro',
        firmwareVersion: 'v2.1.0',
        captureCount: 0,
      }
      updateDeviceStatus(mockDeviceStatus)
    }
  }, [addMessage, updateNegotiation, addPowerCurvePoint, updateDeviceStatus, addMessageIdGapEvent, addHardResetEvent])

  useEffect(() => {
    if (window.electronAPI) {
      if (isSimulating) {
        window.electronAPI.startSimulation(currentScenario, simulationSpeed)
      } else {
        window.electronAPI.stopSimulation()
      }
    } else {
      if (isSimulating) {
        runMockSimulation()
      } else {
        clearMockTimers()
      }
    }
  }, [isSimulating, currentScenario, simulationSpeed])

  const clearMockTimers = () => {
    if (powerIntervalRef.current) {
      clearInterval(powerIntervalRef.current)
      powerIntervalRef.current = null
    }
    mockTimeoutsRef.current.forEach((t) => clearTimeout(t))
    mockTimeoutsRef.current = []
  }

  const runMockSimulation = () => {
    clearMockTimers()

    const scenarioConfigs: Record<string, { voltage: number; current: number; shouldReject: boolean; hasMsgIdGap: boolean; hasHardReset: boolean }> = {
      'standard-5v': { voltage: 5, current: 3, shouldReject: false, hasMsgIdGap: false, hasHardReset: false },
      'standard-9v': { voltage: 9, current: 3, shouldReject: false, hasMsgIdGap: false, hasHardReset: false },
      'standard-20v': { voltage: 20, current: 5, shouldReject: false, hasMsgIdGap: false, hasHardReset: false },
      'pps-negotiation': { voltage: 12, current: 2.5, shouldReject: false, hasMsgIdGap: false, hasHardReset: false },
      'rejected-request': { voltage: 5, current: 3, shouldReject: true, hasMsgIdGap: false, hasHardReset: false },
      'renegotiation': { voltage: 15, current: 3, shouldReject: false, hasMsgIdGap: false, hasHardReset: false },
      'msgid-gap-retransmit': { voltage: 9, current: 3, shouldReject: false, hasMsgIdGap: true, hasHardReset: false },
      'hard-reset-renegotiate': { voltage: 5, current: 3, shouldReject: false, hasMsgIdGap: false, hasHardReset: true },
    }

    const config = scenarioConfigs[currentScenario] || scenarioConfigs['standard-5v']
    const baseDelay = 200 / simulationSpeed
    let msgIdCounter = 0

    const mockCapabilites = [
      { position: 1, type: 'fixed' as const, voltageMV: 5000, currentMA: 3000, maxPowerMW: 15000, rawValue: 0x11002c91 },
      { position: 2, type: 'fixed' as const, voltageMV: 9000, currentMA: 3000, maxPowerMW: 27000, rawValue: 0x11002cd1 },
      { position: 3, type: 'fixed' as const, voltageMV: 20000, currentMA: 5000, maxPowerMW: 100000, rawValue: 0x11003e91 },
    ]

    const addMockMessage = (type: string, msgId: number, dataObjs?: any[], label?: string, meta?: any, isHardReset?: boolean) => {
      const mockMessage: PDMessage = {
        id: `msg-${Date.now()}-${msgIdCounter++}`,
        timestamp: Date.now(),
        rawHex: 'A123456789ABCDEF0123456789ABCDEF',
        header: {
          messageType: type as any,
          messageId: msgId,
          portDataRole: 'Source',
          portPowerRole: 'Source',
          specificationRevision: 3,
          numDataObjects: dataObjs ? dataObjs.length : 0,
        },
        direction: 'SOP',
        dataObjects: dataObjs,
        _label: label,
        _meta: meta,
        _isHardReset: isHardReset,
      }
      addMessage(mockMessage)
    }

    const scheduleStep = (fn: () => void, delay: number) => {
      const t = setTimeout(fn, delay)
      mockTimeoutsRef.current.push(t)
    }

    scheduleStep(() => {
      addMockMessage('SOURCE_CAPABILITIES', 0, mockCapabilites, 'Source_Capabilities')
      updateNegotiation({
        ...usePDStore.getState().negotiation,
        phase: 'capabilities_sent',
        sourceCapabilities: mockCapabilites,
      })
    }, baseDelay)

    if (config.hasMsgIdGap) {
      scheduleStep(() => {
        addMockMessage('GOODCRC', 0, undefined, 'GoodCRC')
      }, baseDelay * 1.5)

      scheduleStep(() => {
        addMockMessage('REQUEST', 3, undefined, 'Request(MSG_ID=3, GAP!)', {
          messageIdGap: true,
          expectedId: 1,
          receivedId: 3,
        })
        addMessageIdGapEvent({ expectedId: 1, receivedId: 3, lastId: 0, timestamp: Date.now() })
        updateNegotiation({
          ...usePDStore.getState().negotiation,
          phase: 'msgid_gap',
          messageIdGap: true,
        })
      }, baseDelay * 2)

      scheduleStep(() => {
        addMockMessage('SOFT_RESET', 1, undefined, 'Soft_Reset(MSG_ID不连续)')
        updateNegotiation({
          ...usePDStore.getState().negotiation,
          phase: 'retransmitting',
          messageIdGap: false,
        })
      }, baseDelay * 3.5)

      scheduleStep(() => {
        addMockMessage('SOURCE_CAPABILITIES', 0, mockCapabilites, 'Source_Capabilities(重传)')
        updateNegotiation({
          ...usePDStore.getState().negotiation,
          phase: 'capabilities_sent',
        })
      }, baseDelay * 5)

      scheduleStep(() => {
        addMockMessage('REQUEST', 1, undefined, 'Request(9V, 重传)')
        updateNegotiation({
          ...usePDStore.getState().negotiation,
          phase: 'request_sent',
          requestedVoltage: config.voltage,
          requestedCurrent: config.current,
        })
      }, baseDelay * 6)

      scheduleStep(() => {
        addMockMessage('ACCEPT', 1, undefined, 'Accept')
        updateNegotiation({
          ...usePDStore.getState().negotiation,
          phase: 'accepted',
        })
      }, baseDelay * 7)

      scheduleStep(() => {
        addMockMessage('PS_RDY', 1, undefined, 'PS_RDY')
        updateNegotiation({
          ...usePDStore.getState().negotiation,
          phase: 'ready',
          activeVoltage: config.voltage,
          activeCurrent: config.current,
        })
        startMockPowerCurve(config.voltage, config.current)
      }, baseDelay * 8)
    } else if (config.hasHardReset) {
      scheduleStep(() => {
        addMockMessage('REQUEST', 1, undefined, 'Request(9V)')
        updateNegotiation({
          ...usePDStore.getState().negotiation,
          phase: 'request_sent',
          requestedVoltage: 9,
          requestedCurrent: 3,
        })
      }, baseDelay * 1.5)

      scheduleStep(() => {
        addMockMessage('ACCEPT', 1, undefined, 'Accept')
        updateNegotiation({
          ...usePDStore.getState().negotiation,
          phase: 'accepted',
        })
      }, baseDelay * 2)

      scheduleStep(() => {
        addMockMessage('PS_RDY', 1, undefined, 'PS_RDY')
        updateNegotiation({
          ...usePDStore.getState().negotiation,
          phase: 'ready',
          activeVoltage: 9,
          activeCurrent: 3,
        })
      }, baseDelay * 3)

      scheduleStep(() => {
        addMockMessage('HARD_RESET', 0, undefined, 'Hard_Reset(异常触发)', undefined, true)
        addHardResetEvent({ timestamp: Date.now(), message: 'Hard_Reset(异常触发)' })
        updateNegotiation({
          ...usePDStore.getState().negotiation,
          phase: 'hard_reset',
          hardResetOccurred: true,
        })
      }, baseDelay * 7)

      scheduleStep(() => {
        const safeCaps = [
          { position: 1, type: 'fixed' as const, voltageMV: 5000, currentMA: 3000, maxPowerMW: 15000, rawValue: 0x11002c91 },
          { position: 2, type: 'fixed' as const, voltageMV: 9000, currentMA: 3000, maxPowerMW: 27000, rawValue: 0x11002cd1 },
        ]
        addMockMessage('SOURCE_CAPABILITIES', 0, safeCaps, 'Source_Capabilities(硬复位后重新协商)')
        updateNegotiation({
          ...usePDStore.getState().negotiation,
          phase: 'capabilities_sent',
          sourceCapabilities: safeCaps,
          hardResetOccurred: true,
        })
      }, baseDelay * 11)

      scheduleStep(() => {
        addMockMessage('REQUEST', 1, undefined, 'Request(5V安全电压)')
        updateNegotiation({
          ...usePDStore.getState().negotiation,
          phase: 'request_sent',
          requestedVoltage: 5,
          requestedCurrent: 3,
        })
      }, baseDelay * 12)

      scheduleStep(() => {
        addMockMessage('ACCEPT', 1, undefined, 'Accept')
        updateNegotiation({
          ...usePDStore.getState().negotiation,
          phase: 'accepted',
        })
      }, baseDelay * 13)

      scheduleStep(() => {
        addMockMessage('PS_RDY', 1, undefined, 'PS_RDY')
        updateNegotiation({
          ...usePDStore.getState().negotiation,
          phase: 'ready',
          activeVoltage: 5,
          activeCurrent: 3,
        })
        startMockPowerCurve(5, 3)
      }, baseDelay * 14)
    } else {
      scheduleStep(() => {
        addMockMessage('REQUEST', 1, undefined, 'Request')
        updateNegotiation({
          ...usePDStore.getState().negotiation,
          phase: 'request_sent',
          requestedVoltage: config.voltage,
          requestedCurrent: config.current,
        })
      }, baseDelay * 1.5)

      if (config.shouldReject) {
        scheduleStep(() => {
          addMockMessage('REJECT', 1, undefined, 'Reject')
          updateNegotiation({
            ...usePDStore.getState().negotiation,
            phase: 'rejected',
          })
        }, baseDelay * 2.5)
      } else {
        scheduleStep(() => {
          addMockMessage('ACCEPT', 1, undefined, 'Accept')
          updateNegotiation({
            ...usePDStore.getState().negotiation,
            phase: 'accepted',
          })
        }, baseDelay * 2.5)

        scheduleStep(() => {
          addMockMessage('PS_RDY', 1, undefined, 'PS_RDY')
          updateNegotiation({
            ...usePDStore.getState().negotiation,
            phase: 'ready',
            activeVoltage: config.voltage,
            activeCurrent: config.current,
          })
          startMockPowerCurve(config.voltage, config.current)
        }, baseDelay * 3.5)
      }
    }
  }

  const startMockPowerCurve = (voltage: number, current: number) => {
    if (powerIntervalRef.current) clearInterval(powerIntervalRef.current)
    powerIntervalRef.current = setInterval(() => {
      addPowerCurvePoint({
        timestamp: Date.now(),
        voltage: voltage + (Math.random() - 0.5) * 0.1,
        current: current * (0.8 + Math.random() * 0.4),
        power: voltage * current,
      })
    }, 50 / simulationSpeed)
  }

  useEffect(() => {
    return () => {
      clearMockTimers()
    }
  }, [])

  return (
    <div className="h-screen flex flex-col bg-[#0F1923]">
      <StatusBar />
      <div className="flex-1 flex overflow-hidden">
        <div className="w-1/4">
          <MessageList />
        </div>
        <div className="flex-1 flex flex-col">
          <div className="h-1/2">
            <TimelineView />
          </div>
          <div className="h-1/2">
            <PowerChart />
          </div>
        </div>
        <div className="w-1/4">
          <MessageDetail />
        </div>
      </div>
      <SimulationControl />
    </div>
  )
}
