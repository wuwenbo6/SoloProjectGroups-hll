import { useEffect, useRef, useCallback } from 'react'
import { AudioHARTManager } from '../utils/audio'
import { useDeviceStore } from '../store/deviceStore'
import type { HARTResponse } from '../../shared/types'

export function useHART() {
  const managerRef = useRef<AudioHARTManager | null>(null)
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const multiDevicePollRef = useRef<NodeJS.Timeout | null>(null)
  const currentAddressRef = useRef<number>(0)

  const {
    isConnected,
    isPolling,
    pollInterval,
    multiDeviceConfig,
    connect,
    disconnect,
    updatePV,
    updateSV,
    updateTV,
    updateFV,
    setUnits,
    startPolling,
    stopPolling,
    addLog,
    incrementSent,
    incrementReceived,
    incrementErrors,
    setWaveformData,
    setAudioInitialized,
    reset,
    updateDeviceData,
    addHistoryPoint,
    setSelectedDevice,
  } = useDeviceStore()

  const handleResponse = useCallback((address: string, response: HARTResponse) => {
    incrementReceived()

    if (response.pv !== undefined) {
      updateDeviceData(address, { pv: response.pv })
      updatePV(response.pv)
    }
    if (response.sv !== undefined) {
      updateDeviceData(address, { sv: response.sv })
      updateSV(response.sv)
    }
    if (response.tv !== undefined) {
      updateDeviceData(address, { tv: response.tv })
      updateTV(response.tv)
    }
    if (response.fv !== undefined) {
      updateDeviceData(address, { fv: response.fv })
      updateFV(response.fv)
    }
    if (response.units) {
      updateDeviceData(address, { units: response.units })
      setUnits(response.units)
    }

    const deviceData = useDeviceStore.getState().devices.get(address)
    if (deviceData) {
      addHistoryPoint(address, {
        address,
        pv: deviceData.pv,
        sv: deviceData.sv,
        tv: deviceData.tv,
        fv: deviceData.fv,
      })
    }

    addLog('receive', `Device ${address} - PV: ${response.pv?.toFixed(4) || '---'}`)
  }, [updatePV, updateSV, updateTV, updateFV, setUnits, updateDeviceData, addHistoryPoint, addLog, incrementReceived])

  const initialize = useCallback(async () => {
    if (!managerRef.current) {
      managerRef.current = new AudioHARTManager()
    }

    try {
      await managerRef.current.initialize()
      setAudioInitialized(true)
      addLog('info', 'Audio system initialized')
    } catch (error) {
      addLog('error', `Failed to initialize audio: ${error}`)
      throw error
    }
  }, [setAudioInitialized, addLog])

  const connectDevice = useCallback(async () => {
    if (!managerRef.current) {
      await initialize()
    }

    try {
      await managerRef.current!.startCapture()
      connect()
      addLog('info', 'Device connected')
    } catch (error) {
      incrementErrors()
      addLog('error', `Connection failed: ${error}`)
      throw error
    }
  }, [initialize, connect, addLog, incrementErrors])

  const disconnectDevice = useCallback(() => {
    if (managerRef.current) {
      managerRef.current.stopCapture()
    }

    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current)
      pollIntervalRef.current = null
    }

    if (multiDevicePollRef.current) {
      clearInterval(multiDevicePollRef.current)
      multiDevicePollRef.current = null
    }

    disconnect()
    reset()
    addLog('info', 'Device disconnected')
  }, [disconnect, reset, addLog])

  const sendCommand = useCallback(async (command: number, data: number[] = [], address?: string) => {
    if (!managerRef.current) {
      addLog('error', 'Audio manager not initialized')
      return
    }

    try {
      await managerRef.current.sendHARTCommand(command, data)
      incrementSent()
      const addr = address || useDeviceStore.getState().deviceAddress
      addLog('send', `Device ${addr} - Command ${command} sent`, data.join(' '))
    } catch (error) {
      incrementErrors()
      addLog('error', `Failed to send command: ${error}`)
    }
  }, [addLog, incrementSent, incrementErrors])

  const startPollingDevice = useCallback(() => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current)
    }

    pollIntervalRef.current = setInterval(() => {
      sendCommand(3)
    }, pollInterval)

    startPolling()
    addLog('info', 'Started single device polling')
  }, [pollInterval, sendCommand, startPolling, addLog])

  const stopPollingDevice = useCallback(() => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current)
      pollIntervalRef.current = null
    }
    stopPolling()
    addLog('info', 'Stopped polling')
  }, [stopPolling, addLog])

  const startMultiDevicePolling = useCallback(() => {
    if (multiDevicePollRef.current) {
      clearInterval(multiDevicePollRef.current)
    }

    currentAddressRef.current = multiDeviceConfig.startAddress

    const pollNextDevice = () => {
      const address = `0x${currentAddressRef.current.toString(16).padStart(2, '0').toUpperCase()}`
      
      managerRef.current?.getProtocol().buildCommandFrame(3)
      
      sendCommand(3, [], address)
      setSelectedDevice(address)

      currentAddressRef.current++
      if (currentAddressRef.current > multiDeviceConfig.endAddress) {
        currentAddressRef.current = multiDeviceConfig.startAddress
      }
    }

    multiDevicePollRef.current = setInterval(pollNextDevice, multiDeviceConfig.pollDelay)

    startPolling()
    addLog('info', `Started multi-device polling (0x${multiDeviceConfig.startAddress.toString(16)} - 0x${multiDeviceConfig.endAddress.toString(16)})`)
  }, [multiDeviceConfig, sendCommand, setSelectedDevice, startPolling, addLog])

  const stopMultiDevicePolling = useCallback(() => {
    if (multiDevicePollRef.current) {
      clearInterval(multiDevicePollRef.current)
      multiDevicePollRef.current = null
    }
    stopPolling()
    addLog('info', 'Stopped multi-device polling')
  }, [stopPolling, addLog])

  const scanDevices = useCallback(async () => {
    addLog('info', 'Scanning devices...')
    const { startAddress, endAddress } = useDeviceStore.getState().multiDeviceConfig
    
    for (let addr = startAddress; addr <= endAddress; addr++) {
      const address = `0x${addr.toString(16).padStart(2, '0').toUpperCase()}`
      addLog('info', `Scanning device ${address}...`)
      await new Promise(resolve => setTimeout(resolve, 200))
    }
    
    addLog('info', 'Device scan complete')
  }, [addLog])

  const simulateData = useCallback(() => {
    const address = useDeviceStore.getState().deviceAddress
    const simulatedPV = 50 + Math.random() * 50
    const simulatedSV = 75
    const simulatedTV = simulatedPV * 1.1
    const simulatedFV = simulatedPV * 0.95

    updateDeviceData(address, {
      pv: simulatedPV,
      sv: simulatedSV,
      tv: simulatedTV,
      fv: simulatedFV,
      units: '%',
    })

    addHistoryPoint(address, {
      address,
      pv: simulatedPV,
      sv: simulatedSV,
      tv: simulatedTV,
      fv: simulatedFV,
    })

    updatePV(simulatedPV)
    updateSV(simulatedSV)
    updateTV(simulatedTV)
    updateFV(simulatedFV)
    setUnits('%')
    incrementReceived()
    addLog('receive', `Device ${address} - Simulated PV: ${simulatedPV.toFixed(2)}%`)
  }, [updatePV, updateSV, updateTV, updateFV, setUnits, updateDeviceData, addHistoryPoint, incrementReceived, addLog])

  const simulateMultiDeviceData = useCallback(() => {
    const { startAddress, endAddress } = useDeviceStore.getState().multiDeviceConfig
    
    for (let addr = startAddress; addr <= endAddress; addr++) {
      const address = `0x${addr.toString(16).padStart(2, '0').toUpperCase()}`
      const baseValue = addr * 5 + 20
      const simulatedPV = baseValue + Math.random() * 10
      const simulatedSV = baseValue + 5
      const simulatedTV = simulatedPV * 1.05
      const simulatedFV = simulatedPV * 0.98

      updateDeviceData(address, {
        pv: simulatedPV,
        sv: simulatedSV,
        tv: simulatedTV,
        fv: simulatedFV,
        units: '%',
      })

      addHistoryPoint(address, {
        address,
        pv: simulatedPV,
        sv: simulatedSV,
        tv: simulatedTV,
        fv: simulatedFV,
      })
    }

    incrementReceived()
    addLog('info', `Simulated data for devices 0x${startAddress.toString(16)} - 0x${endAddress.toString(16)}`)
  }, [updateDeviceData, addHistoryPoint, incrementReceived, addLog])

  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current)
      }
      if (multiDevicePollRef.current) {
        clearInterval(multiDevicePollRef.current)
      }
      if (managerRef.current) {
        managerRef.current.close()
      }
    }
  }, [])

  return {
    initialize,
    connectDevice,
    disconnectDevice,
    sendCommand,
    startPollingDevice,
    stopPollingDevice,
    startMultiDevicePolling,
    stopMultiDevicePolling,
    scanDevices,
    simulateData,
    simulateMultiDeviceData,
    isConnected,
    isPolling,
  }
}
