import { useState, useEffect } from 'react'
import { api } from '../api/client'
import type { Route, BackupRoute } from '../types'

const BAUD_RATES = [1200, 2400, 4800, 9600, 19200, 38400, 57600, 115200]
const PARITY_OPTIONS = ['none', 'odd', 'even', 'mark', 'space']
const STOP_BITS = [1, 2]

const defaultBackup: BackupRoute = {
  enabled: false,
  serialPort: '',
  baudRate: 9600,
  dataBits: 8,
  parity: 'none',
  stopBits: 1,
  slaveId: 0,
  autoFailback: true,
  failbackInterval: 3,
}

const defaultRoute: Omit<Route, 'id' | 'serialError' | 'hasError' | 'activePath'> = {
  ipAddress: '192.168.1.',
  serialPort: '',
  baudRate: 9600,
  dataBits: 8,
  parity: 'none',
  stopBits: 1,
  slaveId: 1,
  enabled: true,
  backup: { ...defaultBackup },
}

export default function RoutingTable() {
  const [routes, setRoutes] = useState<Route[]>([])
  const [serialPorts, setSerialPorts] = useState<string[]>([])
  const [showModal, setShowModal] = useState(false)
  const [editingRoute, setEditingRoute] = useState<Route | null>(null)
  const [form, setForm] = useState<Omit<Route, 'id' | 'serialError' | 'hasError' | 'activePath'>>(defaultRoute)
  const [showBackup, setShowBackup] = useState(false)
  const [loading, setLoading] = useState(false)
  const [selectedError, setSelectedError] = useState<{ id: number; error: string } | null>(null)

  const fetchData = async () => {
    try {
      const [routesRes, portsRes] = await Promise.all([
        api.getRoutes(),
        api.getSerialPorts().catch(() => ({ data: [] })),
      ])
      setRoutes(routesRes.data || [])
      setSerialPorts(portsRes.data || [])
    } catch (err) {
      console.error(err)
    }
  }

  useEffect(() => {
    fetchData()
    const interval = setInterval(fetchData, 5000)
    return () => clearInterval(interval)
  }, [])

  const openCreateModal = () => {
    setEditingRoute(null)
    setForm({ ...defaultRoute, backup: { ...defaultBackup } })
    setShowBackup(false)
    if (serialPorts.length > 0) {
      setForm((prev) => ({ ...prev, serialPort: serialPorts[0] }))
    }
    setShowModal(true)
  }

  const openEditModal = (route: Route) => {
    setEditingRoute(route)
    setForm({
      ipAddress: route.ipAddress,
      serialPort: route.serialPort,
      baudRate: route.baudRate,
      dataBits: route.dataBits,
      parity: route.parity,
      stopBits: route.stopBits,
      slaveId: route.slaveId,
      enabled: route.enabled,
      backup: route.backup || { ...defaultBackup },
    })
    setShowBackup(route.backup?.enabled || false)
    setShowModal(true)
  }

  const handleSubmit = async () => {
    setLoading(true)
    try {
      if (editingRoute) {
        await api.updateRoute(editingRoute.id, form)
      } else {
        await api.createRoute(form)
      }
      setShowModal(false)
      fetchData()
    } catch (err: any) {
      alert(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (id: number) => {
    if (!confirm('确定删除此路由?')) return
    try {
      await api.deleteRoute(id)
      fetchData()
    } catch (err: any) {
      alert(err.message)
    }
  }

  const handleToggle = async (route: Route) => {
    try {
      await api.toggleRoute(route.id, !route.enabled)
      fetchData()
    } catch (err: any) {
      alert(err.message)
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-gray-800">路由表配置</h2>
          <p className="text-sm text-gray-500 mt-1">配置 Modbus TCP IP 地址到串口通道的映射</p>
        </div>
        <button onClick={openCreateModal} className="btn btn-primary">
          <span className="mr-1">+</span> 添加路由
        </button>
      </div>

      <div className="card overflow-x-auto">
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>IP 地址</th>
              <th>串口</th>
              <th>波特率</th>
              <th>数据位</th>
              <th>校验</th>
              <th>停止位</th>
              <th>从站ID</th>
              <th>状态</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {routes.length === 0 && (
              <tr>
                <td colSpan={10} className="text-center py-8 text-gray-400">
                  暂无路由配置，点击"添加路由"创建
                </td>
              </tr>
            )}
            {routes.map((r) => (
              <tr key={r.id} className={r.hasError ? 'bg-red-50' : r.activePath === 'backup' ? 'bg-yellow-50' : ''}>
                <td className="font-mono">{r.id}</td>
                <td className="font-mono text-primary-600">{r.ipAddress}</td>
                <td className="font-mono">
                  <div className="flex items-center">
                    {r.serialPort}
                    {r.backup?.enabled && (
                      <span className="ml-1 text-xs text-blue-500">+备份</span>
                    )}
                    {r.hasError && (
                      <button
                        onClick={() => setSelectedError({ id: r.id, error: r.serialError || '' })}
                        className="ml-2 text-red-500 hover:text-red-700"
                        title="查看串口错误"
                      >
                        ⚠️
                      </button>
                    )}
                  </div>
                </td>
                <td>{r.baudRate}</td>
                <td>{r.dataBits}</td>
                <td>{r.parity}</td>
                <td>{r.stopBits}</td>
                <td>{r.slaveId}</td>
                <td>
                  <div className="flex flex-col space-y-1">
                    <button
                      onClick={() => handleToggle(r)}
                      className={`badge ${r.enabled ? 'badge-green' : 'badge-gray'}`}
                    >
                      {r.enabled ? '● 启用' : '○ 禁用'}
                    </button>
                    {r.backup?.enabled && (
                      <span className={`badge ${r.activePath === 'backup' ? 'badge-orange' : 'badge-blue'}`}>
                        {r.activePath === 'backup' ? '🔄 备路中' : '主路'}
                      </span>
                    )}
                    {r.hasError && r.enabled && (
                      <span className="badge badge-red">串口异常</span>
                    )}
                  </div>
                </td>
                <td>
                  <div className="flex space-x-2">
                    <button
                      onClick={() => openEditModal(r)}
                      className="text-primary-600 hover:text-primary-800"
                    >
                      编辑
                    </button>
                    <button
                      onClick={() => handleDelete(r.id)}
                      className="text-red-500 hover:text-red-700"
                    >
                      删除
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {routes.some((r) => r.hasError) && (
          <div className="mt-4 text-sm text-red-600 bg-red-50 p-3 rounded">
            ⚠ 检测到 {routes.filter((r) => r.hasError).length} 个路由存在串口异常，请检查串口连接和权限设置。
          </div>
        )}
      </div>

      {selectedError && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl mx-4">
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-800 flex items-center">
                <span className="text-red-500 mr-2">⚠️</span>
                串口错误详情
              </h3>
              <button
                onClick={() => setSelectedError(null)}
                className="text-gray-400 hover:text-gray-600 text-2xl"
              >
                ×
              </button>
            </div>
            <div className="px-6 py-4">
              <div className="bg-red-50 border border-red-200 rounded p-4">
                <pre className="text-sm text-red-700 whitespace-pre-wrap font-mono">
                  {selectedError.error}
                </pre>
              </div>
              <div className="mt-4 bg-blue-50 border border-blue-200 rounded p-4">
                <h4 className="text-sm font-semibold text-blue-800 mb-2">🔧 常见解决方案</h4>
                <ul className="text-sm text-blue-700 space-y-1 list-disc list-inside">
                  <li>
                    <strong>权限不足 (Linux):</strong> 执行 <code className="bg-blue-100 px-1 rounded">sudo usermod -aG dialout $USER</code>，然后注销重新登录
                  </li>
                  <li>
                    <strong>权限不足 (macOS):</strong> 检查系统设置 → 隐私与安全性 → 允许终端访问串口
                  </li>
                  <li>
                    <strong>设备不存在:</strong> 确认设备已连接，执行 <code className="bg-blue-100 px-1 rounded">ls /dev/tty*</code> (Linux/macOS) 查看可用设备
                  </li>
                  <li>
                    <strong>设备被占用:</strong> 关闭其他可能使用该串口的程序（如串口调试助手、其他网关等）
                  </li>
                  <li>
                    <strong>USB 串口:</strong> 尝试更换 USB 接口或 USB 转串口线
                  </li>
                </ul>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-200 flex justify-end">
              <button
                onClick={() => setSelectedError(null)}
                className="btn btn-primary"
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-lg mx-4">
            <div className="px-6 py-4 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-800">
                {editingRoute ? '编辑路由' : '添加路由'}
              </h3>
            </div>
            <div className="px-6 py-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">IP 地址</label>
                <input
                  type="text"
                  value={form.ipAddress}
                  onChange={(e) => setForm({ ...form, ipAddress: e.target.value })}
                  className="input-field"
                  placeholder="192.168.1.100"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">主串口</label>
                  <select
                    value={form.serialPort}
                    onChange={(e) => setForm({ ...form, serialPort: e.target.value })}
                    className="input-field"
                  >
                    <option value="">选择串口</option>
                    {serialPorts.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">主从站 ID</label>
                  <input
                    type="number"
                    value={form.slaveId}
                    onChange={(e) => setForm({ ...form, slaveId: Number(e.target.value) })}
                    className="input-field"
                    min={1}
                    max={247}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">波特率</label>
                  <select
                    value={form.baudRate}
                    onChange={(e) => setForm({ ...form, baudRate: Number(e.target.value) })}
                    className="input-field"
                  >
                    {BAUD_RATES.map((b) => (
                      <option key={b} value={b}>
                        {b}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">数据位</label>
                  <input
                    type="number"
                    value={form.dataBits}
                    onChange={(e) => setForm({ ...form, dataBits: Number(e.target.value) })}
                    className="input-field"
                    min={5}
                    max={8}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">校验位</label>
                  <select
                    value={form.parity}
                    onChange={(e) => setForm({ ...form, parity: e.target.value })}
                    className="input-field"
                  >
                    {PARITY_OPTIONS.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">停止位</label>
                  <select
                    value={form.stopBits}
                    onChange={(e) => setForm({ ...form, stopBits: Number(e.target.value) })}
                    className="input-field"
                  >
                    {STOP_BITS.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="border-t border-gray-200 pt-4">
                <button
                  type="button"
                  onClick={() => setShowBackup(!showBackup)}
                  className="flex items-center text-sm font-medium text-primary-600 hover:text-primary-800"
                >
                  <span className="mr-1">{showBackup ? '▼' : '▶'}</span>
                  备份串口配置 {form.backup?.enabled && <span className="ml-2 text-xs text-blue-500">(已启用)</span>}
                </button>
                {showBackup && (
                  <div className="mt-4 space-y-4 pl-4 border-l-2 border-blue-200">
                    <div className="flex items-center space-x-2">
                      <label className="text-sm font-medium text-gray-700">启用备份</label>
                      <input
                        type="checkbox"
                        checked={form.backup?.enabled || false}
                        onChange={(e) => setForm({ ...form, backup: { ...form.backup!, enabled: e.target.checked } })}
                        className="w-4 h-4 text-primary-600 rounded"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">备串口</label>
                        <select
                          value={form.backup?.serialPort || ''}
                          onChange={(e) => setForm({ ...form, backup: { ...form.backup!, serialPort: e.target.value } })}
                          className="input-field"
                          disabled={!form.backup?.enabled}
                        >
                          <option value="">选择串口</option>
                          {serialPorts.map((p) => (
                            <option key={p} value={p}>
                              {p}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">备从站 ID</label>
                        <input
                          type="number"
                          value={form.backup?.slaveId || 0}
                          onChange={(e) => setForm({ ...form, backup: { ...form.backup!, slaveId: Number(e.target.value) } })}
                          className="input-field"
                          min={0}
                          max={247}
                          disabled={!form.backup?.enabled}
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">波特率</label>
                        <select
                          value={form.backup?.baudRate || 9600}
                          onChange={(e) => setForm({ ...form, backup: { ...form.backup!, baudRate: Number(e.target.value) } })}
                          className="input-field"
                          disabled={!form.backup?.enabled}
                        >
                          {BAUD_RATES.map((b) => (
                            <option key={b} value={b}>
                              {b}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">数据位</label>
                        <input
                          type="number"
                          value={form.backup?.dataBits || 8}
                          onChange={(e) => setForm({ ...form, backup: { ...form.backup!, dataBits: Number(e.target.value) } })}
                          className="input-field"
                          min={5}
                          max={8}
                          disabled={!form.backup?.enabled}
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">校验位</label>
                        <select
                          value={form.backup?.parity || 'none'}
                          onChange={(e) => setForm({ ...form, backup: { ...form.backup!, parity: e.target.value } })}
                          className="input-field"
                          disabled={!form.backup?.enabled}
                        >
                          {PARITY_OPTIONS.map((p) => (
                            <option key={p} value={p}>
                              {p}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">停止位</label>
                        <select
                          value={form.backup?.stopBits || 1}
                          onChange={(e) => setForm({ ...form, backup: { ...form.backup!, stopBits: Number(e.target.value) } })}
                          className="input-field"
                          disabled={!form.backup?.enabled}
                        >
                          {STOP_BITS.map((s) => (
                            <option key={s} value={s}>
                              {s}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <div className="flex items-center space-x-4">
                      <div className="flex items-center space-x-2">
                        <label className="text-sm font-medium text-gray-700">自动切回主路</label>
                        <input
                          type="checkbox"
                          checked={form.backup?.autoFailback ?? true}
                          onChange={(e) => setForm({ ...form, backup: { ...form.backup!, autoFailback: e.target.checked } })}
                          className="w-4 h-4 text-primary-600 rounded"
                          disabled={!form.backup?.enabled}
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">切回间隔(次)</label>
                        <input
                          type="number"
                          value={form.backup?.failbackInterval || 3}
                          onChange={(e) => setForm({ ...form, backup: { ...form.backup!, failbackInterval: Number(e.target.value) } })}
                          className="input-field"
                          min={1}
                          max={100}
                          disabled={!form.backup?.enabled}
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-200 flex justify-end space-x-3">
              <button
                onClick={() => setShowModal(false)}
                className="btn btn-secondary"
                disabled={loading}
              >
                取消
              </button>
              <button
                onClick={handleSubmit}
                className="btn btn-primary"
                disabled={loading}
              >
                {loading ? '保存中...' : '保存'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
