import { useState, useMemo } from 'react'
import { Gauge, Thermometer, Settings, TrendingUp, ArrowUp, ArrowDown, Minus, Trash2, Cpu } from 'lucide-react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  Legend,
  ComposedChart,
  Area,
} from 'recharts'
import { useDeviceStore } from '../store/deviceStore'

interface TrendPoint {
  time: string
  [key: string]: string | number | null
}

export function ParameterDisplay() {
  const {
    pv,
    sv,
    tv,
    fv,
    units,
    selectedDevice,
    devices,
    deviceHistory,
    isPolling,
    setSelectedDevice,
    clearDeviceHistory,
  } = useDeviceStore()

  const [selectedVariable, setSelectedVariable] = useState<string>('all')
  const [historyRange, setHistoryRange] = useState<number>(50)
  const [comparisonMode, setComparisonMode] = useState<boolean>(false)
  const [pvDirection, setPvDirection] = useState<'up' | 'down' | 'stable'>('stable')

  const deviceList = Array.from(devices.values())
  const currentDevice = devices.get(selectedDevice)

  const displayPv = currentDevice?.pv ?? pv
  const displaySv = currentDevice?.sv ?? sv
  const displayTv = currentDevice?.tv ?? tv
  const displayFv = currentDevice?.fv ?? fv
  const displayUnits = currentDevice?.units ?? units

  const formatValue = (value: number | null): string => {
    if (value === null || isNaN(value)) return '---'
    return value.toFixed(2)
  }

  const singleDeviceHistory = useMemo(() => {
    const history = deviceHistory.get(selectedDevice) || []
    return history.slice(-historyRange).map((point) => {
      const date = new Date(point.timestamp)
      return {
        time: `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}:${date.getSeconds().toString().padStart(2, '0')}`,
        pv: point.pv,
        sv: point.sv,
        tv: point.tv,
        fv: point.fv,
      }
    })
  }, [deviceHistory, selectedDevice, historyRange])

  const multiDeviceComparisonData = useMemo(() => {
    if (!comparisonMode) return []

    const allHistories: { [key: string]: { [key: string]: number | null } } = {}
    const timePoints: string[] = []

    deviceList.slice(0, 5).forEach((device) => {
      const history = deviceHistory.get(device.address) || []
      history.slice(-20).forEach((point) => {
        const date = new Date(point.timestamp)
        const timeKey = `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}:${date.getSeconds().toString().padStart(2, '0')}`
        if (!timePoints.includes(timeKey)) {
          timePoints.push(timeKey)
        }
        if (!allHistories[timeKey]) {
          allHistories[timeKey] = {}
        }
        allHistories[timeKey][device.address] = point.pv
      })
    })

    return timePoints
      .sort()
      .slice(-20)
      .map((time) => ({
        time,
        ...allHistories[time],
      }))
  }, [comparisonMode, deviceList, deviceHistory])

  const colors = ['#165DFF', '#00B42A', '#FF7D00', '#F53F3F', '#722ED1', '#0FC6C2']

  const DirectionIcon = () => {
    if (pvDirection === 'up') return <ArrowUp className="w-4 h-4 text-success" />
    if (pvDirection === 'down') return <ArrowDown className="w-4 h-4 text-danger" />
    return <Minus className="w-4 h-4 text-dark-600" />
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Cpu className="w-4 h-4 text-primary" />
            <span className="text-white text-sm">Device:</span>
            <select
              value={selectedDevice}
              onChange={(e) => setSelectedDevice(e.target.value)}
              className="bg-dark-900 border border-dark-700 rounded px-2 py-1 text-white text-sm font-mono focus:outline-none focus:border-primary"
            >
              {deviceList.length === 0 ? (
                <option value="0x00">0x00 (Default)</option>
              ) : (
                deviceList.map((device) => (
                  <option key={device.address} value={device.address}>
                    {device.address} {device.online ? '(Online)' : '(Offline)'}
                  </option>
                ))
              )}
            </select>
          </div>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={comparisonMode}
              onChange={(e) => setComparisonMode(e.target.checked)}
              className="accent-primary"
            />
            <span className="text-dark-600">Multi-Device Compare</span>
          </label>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-dark-600 text-sm">History:</span>
          <select
            value={historyRange}
            onChange={(e) => setHistoryRange(Number(e.target.value))}
            className="bg-dark-900 border border-dark-700 rounded px-2 py-1 text-white text-sm focus:outline-none focus:border-primary"
          >
            <option value={20}>20 points</option>
            <option value={50}>50 points</option>
            <option value={100}>100 points</option>
          </select>
          <button
            onClick={() => clearDeviceHistory(selectedDevice)}
            className="p-1.5 text-dark-600 hover:text-danger transition-colors"
            title="Clear History"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-dark-800 border border-dark-700 rounded p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Gauge className="w-5 h-5 text-primary" />
              <span className="text-dark-600 text-sm">PV</span>
            </div>
            <DirectionIcon />
          </div>
          <div className="text-3xl font-mono font-bold text-white">
            {formatValue(displayPv)}
          </div>
          <div className="text-dark-600 text-sm">{displayUnits}</div>
          <div className="text-xs text-dark-700 mt-1">Process Variable</div>
        </div>

        <div className="bg-dark-800 border border-dark-700 rounded p-4">
          <div className="flex items-center gap-2 mb-2">
            <Settings className="w-5 h-5 text-warning" />
            <span className="text-dark-600 text-sm">SV</span>
          </div>
          <div className="text-3xl font-mono font-bold text-warning">
            {formatValue(displaySv)}
          </div>
          <div className="text-dark-600 text-sm">{displayUnits}</div>
          <div className="text-xs text-dark-700 mt-1">Set Value</div>
        </div>

        <div className="bg-dark-800 border border-dark-700 rounded p-4">
          <div className="flex items-center gap-2 mb-2">
            <Thermometer className="w-5 h-5 text-info" />
            <span className="text-dark-600 text-sm">TV</span>
          </div>
          <div className="text-3xl font-mono font-bold text-info">
            {formatValue(displayTv)}
          </div>
          <div className="text-dark-600 text-sm">{displayUnits}</div>
          <div className="text-xs text-dark-700 mt-1">Transmitter Variable</div>
        </div>

        <div className="bg-dark-800 border border-dark-700 rounded p-4">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="w-5 h-5 text-success" />
            <span className="text-dark-600 text-sm">FV</span>
          </div>
          <div className="text-3xl font-mono font-bold text-success">
            {formatValue(displayFv)}
          </div>
          <div className="text-dark-600 text-sm">{displayUnits}</div>
          <div className="text-xs text-dark-700 mt-1">Final Variable</div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-dark-800 border border-dark-700 rounded p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-white font-semibold">Device History</h3>
            <div className="flex items-center gap-2">
              <select
                value={selectedVariable}
                onChange={(e) => setSelectedVariable(e.target.value)}
                className="bg-dark-900 border border-dark-700 rounded px-2 py-1 text-white text-sm focus:outline-none focus:border-primary"
              >
                <option value="all">All Variables</option>
                <option value="pv">PV Only</option>
                <option value="sv">SV Only</option>
                <option value="tv">TV Only</option>
                <option value="fv">FV Only</option>
              </select>
              <div className={`flex items-center gap-2 text-sm ${isPolling ? 'text-success' : 'text-dark-600'}`}>
                <span className={`w-2 h-2 rounded-full ${isPolling ? 'bg-success animate-pulse' : 'bg-dark-600'}`}></span>
                {isPolling ? 'Live' : 'Paused'}
              </div>
            </div>
          </div>
          <div className="h-64">
            {singleDeviceHistory.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={singleDeviceHistory}>
                  <defs>
                    <linearGradient id="pvGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#165DFF" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#165DFF" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="svGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#FF7D00" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#FF7D00" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#272E3B" />
                  <XAxis dataKey="time" stroke="#4E5969" fontSize={10} tickLine={false} />
                  <YAxis stroke="#4E5969" fontSize={10} tickLine={false} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#1D2129',
                      border: '1px solid #272E3B',
                      borderRadius: '4px',
                      color: '#fff',
                    }}
                  />
                  <Legend />
                  {(selectedVariable === 'all' || selectedVariable === 'pv') && (
                    <>
                      <Area type="monotone" dataKey="pv" fill="url(#pvGradient)" stroke="#165DFF" strokeWidth={0} />
                      <Line type="monotone" dataKey="pv" stroke="#165DFF" strokeWidth={2} dot={false} name="PV" />
                    </>
                  )}
                  {(selectedVariable === 'all' || selectedVariable === 'sv') && (
                    <>
                      <Area type="monotone" dataKey="sv" fill="url(#svGradient)" stroke="#FF7D00" strokeWidth={0} />
                      <Line type="monotone" dataKey="sv" stroke="#FF7D00" strokeWidth={2} strokeDasharray="5 5" dot={false} name="SV" />
                    </>
                  )}
                  {(selectedVariable === 'all' || selectedVariable === 'tv') && (
                    <Line type="monotone" dataKey="tv" stroke="#0FC6C2" strokeWidth={2} dot={false} name="TV" />
                  )}
                  {(selectedVariable === 'all' || selectedVariable === 'fv') && (
                    <Line type="monotone" dataKey="fv" stroke="#00B42A" strokeWidth={2} dot={false} name="FV" />
                  )}
                </ComposedChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-dark-600">
                No history data available. Start polling to collect data.
              </div>
            )}
          </div>
        </div>

        <div className="bg-dark-800 border border-dark-700 rounded p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-white font-semibold">Multi-Device Comparison</h3>
            <span className="text-xs text-dark-600">PV Values Comparison</span>
          </div>
          <div className="h-64">
            {comparisonMode && multiDeviceComparisonData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={multiDeviceComparisonData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#272E3B" />
                  <XAxis dataKey="time" stroke="#4E5969" fontSize={10} tickLine={false} />
                  <YAxis stroke="#4E5969" fontSize={10} tickLine={false} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#1D2129',
                      border: '1px solid #272E3B',
                      borderRadius: '4px',
                      color: '#fff',
                    }}
                  />
                  <Legend />
                  {deviceList.slice(0, 5).map((device, index) => (
                    <Line
                      key={device.address}
                      type="monotone"
                      dataKey={device.address}
                      stroke={colors[index % colors.length]}
                      strokeWidth={2}
                      dot={false}
                      name={device.address}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-dark-600">
                <p>Enable "Multi-Device Compare" to view comparison chart</p>
                <p className="text-xs mt-1">Simulate data for multiple devices first</p>
              </div>
            )}
          </div>
          {comparisonMode && deviceList.length > 0 && (
            <div className="mt-3 pt-3 border-t border-dark-700 flex flex-wrap gap-2">
              {deviceList.slice(0, 5).map((device, index) => (
                <div key={device.address} className="flex items-center gap-1.5 text-xs">
                  <span
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: colors[index % colors.length] }}
                  ></span>
                  <span className="text-dark-400">{device.address}</span>
                  <span className="text-dark-600">= {formatValue(device.pv)} {device.units}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
