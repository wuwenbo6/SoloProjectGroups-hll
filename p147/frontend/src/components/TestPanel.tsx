import { useState, useEffect } from 'react'
import { api } from '../api/client'
import type { Route, TestRequest } from '../types'

const FUNCTION_CODES = [
  { value: 0x03, label: '03 - 读保持寄存器' },
  { value: 0x04, label: '04 - 读输入寄存器' },
  { value: 0x06, label: '06 - 写单个寄存器' },
  { value: 0x10, label: '16 - 写多个寄存器' },
]

export default function TestPanel() {
  const [routes, setRoutes] = useState<Route[]>([])
  const [form, setForm] = useState<TestRequest>({
    routeId: 0,
    functionCode: 0x03,
    address: 0,
    quantity: 1,
    value: 0,
  })
  const [result, setResult] = useState<{ success: boolean; data?: any; error?: string } | null>(null)
  const [loading, setLoading] = useState(false)
  const [testHistory, setTestHistory] = useState<
    { time: string; req: TestRequest; res: any }[]
  >([])

  useEffect(() => {
    const fetchRoutes = async () => {
      try {
        const res = await api.getRoutes()
        const enabledRoutes = (res.data || []).filter((r) => r.enabled)
        setRoutes(enabledRoutes)
        if (enabledRoutes.length > 0 && form.routeId === 0) {
          setForm((prev) => ({ ...prev, routeId: enabledRoutes[0].id }))
        }
      } catch (err) {
        console.error(err)
      }
    }
    fetchRoutes()
  }, [])

  const handleTest = async () => {
    if (!form.routeId) {
      alert('请选择路由')
      return
    }
    setLoading(true)
    setResult(null)
    try {
      const res = await api.testRegister(form)
      setResult(res)
      setTestHistory((prev) => [
        {
          time: new Date().toLocaleTimeString(),
          req: { ...form },
          res: res,
        },
        ...prev.slice(0, 9),
      ])
    } catch (err: any) {
      setResult({ success: false, error: err.message })
    } finally {
      setLoading(false)
    }
  }

  const isWrite = form.functionCode === 0x06 || form.functionCode === 0x10
  const selectedRoute = routes.find((r) => r.id === form.routeId)

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-gray-800">在线测试</h2>
          <p className="text-sm text-gray-500 mt-1">通过配置的路由直接读写 Modbus 寄存器</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">测试参数</h3>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">选择路由</label>
              <select
                value={form.routeId}
                onChange={(e) => setForm({ ...form, routeId: Number(e.target.value) })}
                className="input-field"
              >
                <option value={0}>-- 请选择 --</option>
                {routes.map((r) => (
                  <option key={r.id} value={r.id}>
                    #{r.id} {r.ipAddress} → {r.serialPort} (从站ID: {r.slaveId})
                  </option>
                ))}
              </select>
              {selectedRoute && (
                <div className="mt-2 text-xs text-gray-500 bg-gray-50 p-2 rounded">
                  <div>波特率: {selectedRoute.baudRate}</div>
                  <div>数据位: {selectedRoute.dataBits}</div>
                  <div>校验: {selectedRoute.parity}</div>
                  <div>停止位: {selectedRoute.stopBits}</div>
                </div>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">功能码</label>
              <select
                value={form.functionCode}
                onChange={(e) => setForm({ ...form, functionCode: Number(e.target.value) })}
                className="input-field"
              >
                {FUNCTION_CODES.map((fc) => (
                  <option key={fc.value} value={fc.value}>
                    {fc.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  寄存器地址
                </label>
                <input
                  type="number"
                  value={form.address}
                  onChange={(e) => setForm({ ...form, address: Number(e.target.value) })}
                  className="input-field"
                  min={0}
                  max={65535}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {isWrite ? '写入值' : '读取数量'}
                </label>
                <input
                  type="number"
                  value={isWrite ? form.value : form.quantity}
                  onChange={(e) => {
                    const v = Number(e.target.value)
                    if (isWrite) {
                      setForm({ ...form, value: v })
                    } else {
                      setForm({ ...form, quantity: v })
                    }
                  }}
                  className="input-field"
                  min={0}
                  max={65535}
                />
              </div>
            </div>

            {form.functionCode === 0x10 && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">写入数量</label>
                <input
                  type="number"
                  value={form.quantity}
                  onChange={(e) => setForm({ ...form, quantity: Number(e.target.value) })}
                  className="input-field"
                  min={1}
                  max={125}
                />
              </div>
            )}

            <button
              onClick={handleTest}
              disabled={loading}
              className="w-full btn btn-primary"
            >
              {loading ? '执行中...' : isWrite ? '✏️ 写入寄存器' : '📖 读取寄存器'}
            </button>
          </div>
        </div>

        <div className="space-y-6">
          <div className="card">
            <h3 className="text-sm font-semibold text-gray-700 mb-4">测试结果</h3>
            {result ? (
              <div>
                {result.success ? (
                  <div>
                    <div className="flex items-center mb-3">
                      <span className="badge badge-green">✓ 成功</span>
                    </div>
                    <div className="bg-gray-50 p-4 rounded-md">
                      <pre className="text-sm text-gray-700 whitespace-pre-wrap break-all">
                        {JSON.stringify(result.data, null, 2)}
                      </pre>
                    </div>
                    {Array.isArray(result.data) && (
                      <div className="mt-3">
                        <h4 className="text-xs font-medium text-gray-500 mb-2">寄存器值</h4>
                        <div className="grid grid-cols-4 gap-2">
                          {result.data.map((val: number, idx: number) => (
                            <div
                              key={idx}
                              className="bg-primary-50 px-2 py-1 rounded text-center"
                            >
                              <div className="text-xs text-gray-400">
                                [{form.address + idx}]
                              </div>
                              <div className="font-mono text-sm font-semibold text-primary-700">
                                {val}
                              </div>
                              <div className="text-xs text-gray-400">0x{val.toString(16).toUpperCase().padStart(4, '0')}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex items-center">
                    <span className="badge badge-red">✗ 失败</span>
                    <span className="ml-3 text-sm text-red-600">{result.error}</span>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-gray-400 text-sm">点击"执行测试"查看结果</div>
            )}
          </div>

          <div className="card">
            <h3 className="text-sm font-semibold text-gray-700 mb-4">历史记录</h3>
            {testHistory.length === 0 ? (
              <div className="text-gray-400 text-sm">暂无历史记录</div>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {testHistory.map((item, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between text-sm border-b border-gray-100 pb-2"
                  >
                    <div>
                      <span className="text-xs text-gray-400 mr-2">{item.time}</span>
                      <span
                        className={`badge ${
                          item.res.success ? 'badge-green' : 'badge-red'
                        }`}
                      >
                        {item.res.success ? '✓' : '✗'}
                      </span>
                      <span className="ml-2 font-mono text-xs">
                        FC=0x{item.req.functionCode.toString(16).toUpperCase().padStart(2, '0')}
                        {' '}Addr={item.req.address}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
