import { useState, useEffect, useCallback } from "react"
import { useTrapStore } from "@/store/trapStore"
import { fetchConfig, updateConfig, fetchStatus, discoverEngineId } from "@/utils/api"
import { SnmpConfig, V3User, ServiceStatus, ForwardTarget, OidMapping } from "@/types"
import {
  Save,
  Plus,
  Trash2,
  Wifi,
  WifiOff,
  Radio,
  Clock,
  Hash,
  Search,
  Key,
  Send,
  Link2,
  BookOpen,
} from "lucide-react"

function formatUptime(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
}

const defaultConfig: SnmpConfig = {
  listen_port: 162,
  v2c_communities: ["public"],
  v3_users: [],
  forward_targets: [],
  oid_mappings: [],
}

export default function ConfigPage() {
  const [config, setConfig] = useState<SnmpConfig>(defaultConfig)
  const [status, setStatus] = useState<ServiceStatus | null>(null)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState("")
  const [discoverIp, setDiscoverIp] = useState("")
  const [discoverPort, setDiscoverPort] = useState(161)
  const [discovering, setDiscovering] = useState(false)
  const [discoverResult, setDiscoverResult] = useState<{
    success: boolean
    engineId?: string
    error?: string
  } | null>(null)

  const loadConfig = useCallback(async () => {
    try {
      const data = await fetchConfig()
      setConfig(data)
    } catch {
      // use default
    }
  }, [])

  const loadStatus = useCallback(async () => {
    try {
      const data = await fetchStatus()
      setStatus(data)
    } catch {
      // ignore
    }
  }, [])

  useEffect(() => {
    loadConfig()
    loadStatus()
    const interval = setInterval(loadStatus, 5000)
    return () => clearInterval(interval)
  }, [loadConfig, loadStatus])

  const handleSave = async () => {
    setSaving(true)
    setMessage("")
    try {
      const result = await updateConfig(config)
      setMessage(result.message || "配置已保存")
      await loadStatus()
    } catch {
      setMessage("保存失败，请检查后端服务")
    }
    setSaving(false)
    setTimeout(() => setMessage(""), 3000)
  }

  const addCommunity = () => {
    setConfig((prev) => ({
      ...prev,
      v2c_communities: [...prev.v2c_communities, ""],
    }))
  }

  const removeCommunity = (index: number) => {
    setConfig((prev) => ({
      ...prev,
      v2c_communities: prev.v2c_communities.filter((_, i) => i !== index),
    }))
  }

  const updateCommunity = (index: number, value: string) => {
    setConfig((prev) => ({
      ...prev,
      v2c_communities: prev.v2c_communities.map((c, i) =>
        i === index ? value : c
      ),
    }))
  }

  const addV3User = () => {
    setConfig((prev) => ({
      ...prev,
      v3_users: [
        ...prev.v3_users,
        {
          username: "",
          auth_protocol: "NONE",
          auth_key: "",
          priv_protocol: "NONE",
          priv_key: "",
        },
      ],
    }))
  }

  const removeV3User = (index: number) => {
    setConfig((prev) => ({
      ...prev,
      v3_users: prev.v3_users.filter((_, i) => i !== index),
    }))
  }

  const updateV3User = (index: number, field: keyof V3User, value: string) => {
    setConfig((prev) => ({
      ...prev,
      v3_users: prev.v3_users.map((u, i) =>
        i === index ? { ...u, [field]: value } : u
      ),
    }))
  }

  const handleDiscover = async () => {
    if (!discoverIp.trim()) {
      setDiscoverResult({ success: false, error: "请输入目标 IP" })
      return
    }
    setDiscovering(true)
    setDiscoverResult(null)
    try {
      const result = await discoverEngineId({
        target_ip: discoverIp.trim(),
        target_port: discoverPort,
      })
      setDiscoverResult({
        success: result.success,
        engineId: result.engine_id,
        error: result.error,
      })
    } catch {
      setDiscoverResult({ success: false, error: "发现失败，请检查后端服务" })
    }
    setDiscovering(false)
  }

  const addForwardTarget = () => {
    const newTarget: ForwardTarget = {
      id: crypto.randomUUID(),
      type: "syslog",
      enabled: true,
      name: "",
      host: "127.0.0.1",
      port: 514,
      format: "syslog",
      facility: 16,
      severity: 6,
    }
    setConfig((prev) => ({
      ...prev,
      forward_targets: [...prev.forward_targets, newTarget],
    }))
  }

  const removeForwardTarget = (id: string) => {
    setConfig((prev) => ({
      ...prev,
      forward_targets: prev.forward_targets.filter((t) => t.id !== id),
    }))
  }

  const updateForwardTarget = (id: string, field: keyof ForwardTarget, value: unknown) => {
    setConfig((prev) => ({
      ...prev,
      forward_targets: prev.forward_targets.map((t) =>
        t.id === id ? { ...t, [field]: value } : t
      ),
    }))
  }

  const addOidMapping = () => {
    const newMapping: OidMapping = {
      oid: "",
      name: "",
      description: "",
    }
    setConfig((prev) => ({
      ...prev,
      oid_mappings: [...prev.oid_mappings, newMapping],
    }))
  }

  const removeOidMapping = (index: number) => {
    setConfig((prev) => ({
      ...prev,
      oid_mappings: prev.oid_mappings.filter((_, i) => i !== index),
    }))
  }

  const updateOidMapping = (index: number, field: keyof OidMapping, value: string) => {
    setConfig((prev) => ({
      ...prev,
      oid_mappings: prev.oid_mappings.map((m, i) =>
        i === index ? { ...m, [field]: value } : m
      ),
    }))
  }

  return (
    <div className="flex h-full flex-col overflow-auto">
      <div className="border-b border-[#1a2332] bg-[#0d1320] px-6 py-4">
        <h2 className="text-lg font-bold text-white">配置管理</h2>
        <p className="mt-1 text-xs text-[#4a5e78]">管理 SNMP Trap 监听服务的配置参数</p>
      </div>

      <div className="flex-1 overflow-auto p-6">
        <div className="mx-auto max-w-3xl space-y-6">
          {/* Status Cards */}
          <div className="grid grid-cols-3 gap-4">
            <div className="rounded-xl border border-[#1a2332] bg-[#0f1624] p-4">
              <div className="flex items-center gap-2 text-xs text-[#4a5e78]">
                {status?.listening ? (
                  <Wifi className="h-4 w-4 text-[#00e5a0]" />
                ) : (
                  <WifiOff className="h-4 w-4 text-[#ff4d6a]" />
                )}
                监听状态
              </div>
              <div className="mt-2 text-lg font-bold text-white">
                {status?.listening ? "运行中" : "已停止"}
              </div>
            </div>
            <div className="rounded-xl border border-[#1a2332] bg-[#0f1624] p-4">
              <div className="flex items-center gap-2 text-xs text-[#4a5e78]">
                <Radio className="h-4 w-4" />
                监听端口
              </div>
              <div className="mt-2 font-mono text-lg font-bold text-white">
                {status?.listen_port ?? config.listen_port}
              </div>
            </div>
            <div className="rounded-xl border border-[#1a2332] bg-[#0f1624] p-4">
              <div className="flex items-center gap-2 text-xs text-[#4a5e78]">
                <Clock className="h-4 w-4" />
                运行时长
              </div>
              <div className="mt-2 font-mono text-lg font-bold text-white">
                {status?.uptime ? formatUptime(status.uptime) : "00:00:00"}
              </div>
            </div>
          </div>

          {/* Port Config */}
          <div className="rounded-xl border border-[#1a2332] bg-[#0f1624] p-5">
            <h3 className="mb-4 text-sm font-semibold text-white">监听配置</h3>
            <div className="flex items-center gap-4">
              <label className="text-xs text-[#6b7f99]">UDP 端口</label>
              <input
                type="number"
                value={config.listen_port}
                onChange={(e) =>
                  setConfig((prev) => ({
                    ...prev,
                    listen_port: parseInt(e.target.value) || 162,
                  }))
                }
                className="w-32 rounded-lg border border-[#1a2332] bg-[#0a0e17] px-3 py-2 font-mono text-sm text-white outline-none focus:border-[#00e5a0] focus:shadow-[0_0_8px_rgba(0,229,160,0.2)]"
              />
              <span className="text-[10px] text-[#2a3e55]">默认: 162 (需要 root 权限)</span>
            </div>
          </div>

          {/* v2c Communities */}
          <div className="rounded-xl border border-[#1a2332] bg-[#0f1624] p-5">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-white">SNMP v2c 社区字符串</h3>
              <button
                onClick={addCommunity}
                className="flex items-center gap-1 rounded-md bg-[#162030] px-2.5 py-1 text-xs text-[#4dd0e1] transition-all hover:bg-[#1a2a3d]"
              >
                <Plus className="h-3.5 w-3.5" />
                添加
              </button>
            </div>
            <div className="space-y-2">
              {config.v2c_communities.map((community, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Hash className="h-3.5 w-3.5 text-[#2a3e55]" />
                  <input
                    type="text"
                    value={community}
                    onChange={(e) => updateCommunity(i, e.target.value)}
                    placeholder="community string"
                    className="flex-1 rounded-lg border border-[#1a2332] bg-[#0a0e17] px-3 py-2 font-mono text-sm text-white outline-none focus:border-[#00e5a0] focus:shadow-[0_0_8px_rgba(0,229,160,0.2)]"
                  />
                  <button
                    onClick={() => removeCommunity(i)}
                    className="rounded-md p-1.5 text-[#ff4d6a] transition-all hover:bg-[#2a1520]"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
              {config.v2c_communities.length === 0 && (
                <p className="py-2 text-center text-xs text-[#2a3e55]">
                  未配置社区字符串
                </p>
              )}
            </div>
          </div>

          {/* v3 Users */}
          <div className="rounded-xl border border-[#1a2332] bg-[#0f1624] p-5">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-white">SNMP v3 用户</h3>
              <button
                onClick={addV3User}
                className="flex items-center gap-1 rounded-md bg-[#162030] px-2.5 py-1 text-xs text-[#b388ff] transition-all hover:bg-[#1a2a3d]"
              >
                <Plus className="h-3.5 w-3.5" />
                添加
              </button>
            </div>
            <div className="space-y-4">
              {config.v3_users.map((user, i) => (
                <div
                  key={i}
                  className="rounded-lg border border-[#1a2332] bg-[#0a0e17] p-4"
                >
                  <div className="mb-3 flex items-center justify-between">
                    <span className="text-xs font-medium text-[#b388ff]">
                      用户 #{i + 1}
                    </span>
                    <button
                      onClick={() => removeV3User(i)}
                      className="rounded-md p-1 text-[#ff4d6a] transition-all hover:bg-[#2a1520]"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="mb-1 block text-[10px] text-[#4a5e78]">
                        用户名
                      </label>
                      <input
                        type="text"
                        value={user.username}
                        onChange={(e) => updateV3User(i, "username", e.target.value)}
                        className="w-full rounded-lg border border-[#1a2332] bg-[#0d1320] px-3 py-1.5 font-mono text-xs text-white outline-none focus:border-[#b388ff]"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-[10px] text-[#4a5e78]">
                        认证协议
                      </label>
                      <select
                        value={user.auth_protocol}
                        onChange={(e) => updateV3User(i, "auth_protocol", e.target.value)}
                        className="w-full rounded-lg border border-[#1a2332] bg-[#0d1320] px-3 py-1.5 text-xs text-white outline-none focus:border-[#b388ff]"
                      >
                        <option value="NONE">NONE</option>
                        <option value="MD5">MD5</option>
                        <option value="SHA">SHA</option>
                      </select>
                    </div>
                    <div>
                      <label className="mb-1 block text-[10px] text-[#4a5e78]">
                        认证密钥
                      </label>
                      <input
                        type="password"
                        value={user.auth_key}
                        onChange={(e) => updateV3User(i, "auth_key", e.target.value)}
                        className="w-full rounded-lg border border-[#1a2332] bg-[#0d1320] px-3 py-1.5 font-mono text-xs text-white outline-none focus:border-[#b388ff]"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-[10px] text-[#4a5e78]">
                        加密协议
                      </label>
                      <select
                        value={user.priv_protocol}
                        onChange={(e) => updateV3User(i, "priv_protocol", e.target.value)}
                        className="w-full rounded-lg border border-[#1a2332] bg-[#0d1320] px-3 py-1.5 text-xs text-white outline-none focus:border-[#b388ff]"
                      >
                        <option value="NONE">NONE</option>
                        <option value="DES">DES</option>
                        <option value="AES">AES</option>
                      </select>
                    </div>
                    <div className="col-span-2">
                      <label className="mb-1 block text-[10px] text-[#4a5e78]">
                        加密密钥
                      </label>
                      <input
                        type="password"
                        value={user.priv_key}
                        onChange={(e) => updateV3User(i, "priv_key", e.target.value)}
                        className="w-full rounded-lg border border-[#1a2332] bg-[#0d1320] px-3 py-1.5 font-mono text-xs text-white outline-none focus:border-[#b388ff]"
                      />
                    </div>
                  </div>
                </div>
              ))}
              {config.v3_users.length === 0 && (
                <p className="py-2 text-center text-xs text-[#2a3e55]">
                  未配置 v3 用户
                </p>
              )}
            </div>
          </div>

          {/* v3 Engine ID Discovery */}
          <div className="rounded-xl border border-[#1a2332] bg-[#0f1624] p-5">
            <div className="mb-4 flex items-center gap-2">
              <Key className="h-4 w-4 text-[#b388ff]" />
              <h3 className="text-sm font-semibold text-white">SNMP v3 EngineID 发现</h3>
            </div>
            <p className="mb-4 text-xs text-[#4a5e78]">
              向目标设备发送 SNMP v3 Discovery 请求，获取其 EngineID
            </p>
            <div className="flex items-end gap-3">
              <div className="flex-1">
                <label className="mb-1 block text-[10px] text-[#4a5e78]">
                  目标 IP
                </label>
                <input
                  type="text"
                  value={discoverIp}
                  onChange={(e) => setDiscoverIp(e.target.value)}
                  placeholder="192.168.1.1"
                  className="w-full rounded-lg border border-[#1a2332] bg-[#0a0e17] px-3 py-2 font-mono text-sm text-white outline-none focus:border-[#b388ff]"
                />
              </div>
              <div className="w-24">
                <label className="mb-1 block text-[10px] text-[#4a5e78]">
                  端口
                </label>
                <input
                  type="number"
                  value={discoverPort}
                  onChange={(e) => setDiscoverPort(parseInt(e.target.value) || 161)}
                  className="w-full rounded-lg border border-[#1a2332] bg-[#0a0e17] px-3 py-2 font-mono text-sm text-white outline-none focus:border-[#b388ff]"
                />
              </div>
              <button
                onClick={handleDiscover}
                disabled={discovering}
                className="flex items-center gap-2 rounded-lg bg-[#b388ff] px-4 py-2 text-sm font-bold text-[#0a0e17] shadow-[0_0_20px_rgba(179,136,255,0.3)] transition-all hover:bg-[#c9a8ff] hover:shadow-[0_0_30px_rgba(179,136,255,0.5)] disabled:opacity-50"
              >
                <Search className="h-4 w-4" />
                {discovering ? "发现中..." : "发现"}
              </button>
            </div>
            {discoverResult && (
              <div
                className={
                  "mt-4 rounded-lg border p-3 " +
                  (discoverResult.success
                    ? "border-[#00e5a0]/30 bg-[#00e5a0]/5"
                    : "border-[#ff4d6a]/30 bg-[#ff4d6a]/5")
                }
              >
                {discoverResult.success ? (
                  <div>
                    <div className="mb-1 text-xs font-medium text-[#00e5a0]">
                      发现成功
                    </div>
                    <div className="font-mono text-sm text-white">
                      EngineID:{" "}
                      <span className="text-[#00e5a0]">
                        {discoverResult.engineId}
                      </span>
                    </div>
                  </div>
                ) : (
                  <div>
                    <div className="mb-1 text-xs font-medium text-[#ff4d6a]">
                      发现失败
                    </div>
                    <div className="text-xs text-[#6b7f99]">
                      {discoverResult.error}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Forward Targets */}
          <div className="rounded-xl border border-[#1a2332] bg-[#0f1624] p-5">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Send className="h-4 w-4 text-[#4dd0e1]" />
                <h3 className="text-sm font-semibold text-white">Trap 转发目标</h3>
              </div>
              <button
                onClick={addForwardTarget}
                className="flex items-center gap-1 rounded-md bg-[#162030] px-2.5 py-1 text-xs text-[#4dd0e1] transition-all hover:bg-[#1a2a3d]"
              >
                <Plus className="h-3.5 w-3.5" />
                添加
              </button>
            </div>
            <div className="space-y-4">
              {config.forward_targets.map((target, i) => (
                <div
                  key={target.id}
                  className="rounded-lg border border-[#1a2332] bg-[#0a0e17] p-4"
                >
                  <div className="mb-3 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-[#4dd0e1]">
                        目标 #{i + 1}
                      </span>
                      <input
                        type="text"
                        value={target.name}
                        onChange={(e) =>
                          updateForwardTarget(target.id, "name", e.target.value)
                        }
                        placeholder="目标名称"
                        className="rounded-md border border-[#1a2332] bg-[#0d1320] px-2 py-0.5 text-xs text-white outline-none focus:border-[#4dd0e1]"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <label className="flex items-center gap-1 text-xs text-[#6b7f99]">
                        <input
                          type="checkbox"
                          checked={target.enabled}
                          onChange={(e) =>
                            updateForwardTarget(target.id, "enabled", e.target.checked)
                          }
                          className="rounded"
                        />
                        启用
                      </label>
                      <button
                        onClick={() => removeForwardTarget(target.id)}
                        className="rounded-md p-1 text-[#ff4d6a] transition-all hover:bg-[#2a1520]"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="mb-1 block text-[10px] text-[#4a5e78]">
                        类型
                      </label>
                      <select
                        value={target.type}
                        onChange={(e) =>
                          updateForwardTarget(
                            target.id,
                            "type",
                            e.target.value as "syslog" | "http"
                          )
                        }
                        className="w-full rounded-lg border border-[#1a2332] bg-[#0d1320] px-3 py-1.5 text-xs text-white outline-none focus:border-[#4dd0e1]"
                      >
                        <option value="syslog">Syslog</option>
                        <option value="http">HTTP</option>
                      </select>
                    </div>
                    <div>
                      <label className="mb-1 block text-[10px] text-[#4a5e78]">
                        格式
                      </label>
                      <select
                        value={target.format}
                        onChange={(e) =>
                          updateForwardTarget(
                            target.id,
                            "format",
                            e.target.value as "syslog" | "json"
                          )
                        }
                        className="w-full rounded-lg border border-[#1a2332] bg-[#0d1320] px-3 py-1.5 text-xs text-white outline-none focus:border-[#4dd0e1]"
                      >
                        <option value="syslog">Syslog</option>
                        <option value="json">JSON</option>
                      </select>
                    </div>
                    {target.type === "syslog" ? (
                      <>
                        <div>
                          <label className="mb-1 block text-[10px] text-[#4a5e78]">
                            主机
                          </label>
                          <input
                            type="text"
                            value={target.host || ""}
                            onChange={(e) =>
                              updateForwardTarget(target.id, "host", e.target.value)
                            }
                            placeholder="127.0.0.1"
                            className="w-full rounded-lg border border-[#1a2332] bg-[#0d1320] px-3 py-1.5 font-mono text-xs text-white outline-none focus:border-[#4dd0e1]"
                          />
                        </div>
                        <div>
                          <label className="mb-1 block text-[10px] text-[#4a5e78]">
                            端口
                          </label>
                          <input
                            type="number"
                            value={target.port || 514}
                            onChange={(e) =>
                              updateForwardTarget(
                                target.id,
                                "port",
                                parseInt(e.target.value) || 514
                              )
                            }
                            className="w-full rounded-lg border border-[#1a2332] bg-[#0d1320] px-3 py-1.5 font-mono text-xs text-white outline-none focus:border-[#4dd0e1]"
                          />
                        </div>
                        <div>
                          <label className="mb-1 block text-[10px] text-[#4a5e78]">
                            Facility (0-23)
                          </label>
                          <input
                            type="number"
                            min={0}
                            max={23}
                            value={target.facility}
                            onChange={(e) =>
                              updateForwardTarget(
                                target.id,
                                "facility",
                                parseInt(e.target.value) || 16
                              )
                            }
                            className="w-full rounded-lg border border-[#1a2332] bg-[#0d1320] px-3 py-1.5 font-mono text-xs text-white outline-none focus:border-[#4dd0e1]"
                          />
                        </div>
                        <div>
                          <label className="mb-1 block text-[10px] text-[#4a5e78]">
                            Severity (0-7)
                          </label>
                          <input
                            type="number"
                            min={0}
                            max={7}
                            value={target.severity}
                            onChange={(e) =>
                              updateForwardTarget(
                                target.id,
                                "severity",
                                parseInt(e.target.value) || 6
                              )
                            }
                            className="w-full rounded-lg border border-[#1a2332] bg-[#0d1320] px-3 py-1.5 font-mono text-xs text-white outline-none focus:border-[#4dd0e1]"
                          />
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="col-span-2">
                          <label className="mb-1 block text-[10px] text-[#4a5e78]">
                            URL
                          </label>
                          <input
                            type="text"
                            value={target.url || ""}
                            onChange={(e) =>
                              updateForwardTarget(target.id, "url", e.target.value)
                            }
                            placeholder="http://example.com/webhook"
                            className="w-full rounded-lg border border-[#1a2332] bg-[#0d1320] px-3 py-1.5 font-mono text-xs text-white outline-none focus:border-[#4dd0e1]"
                          />
                        </div>
                        <div>
                          <label className="mb-1 block text-[10px] text-[#4a5e78]">
                            方法
                          </label>
                          <select
                            value={target.method || "POST"}
                            onChange={(e) =>
                              updateForwardTarget(
                                target.id,
                                "method",
                                e.target.value as "POST" | "GET"
                              )
                            }
                            className="w-full rounded-lg border border-[#1a2332] bg-[#0d1320] px-3 py-1.5 text-xs text-white outline-none focus:border-[#4dd0e1]"
                          >
                            <option value="POST">POST</option>
                            <option value="GET">GET</option>
                          </select>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              ))}
              {config.forward_targets.length === 0 && (
                <p className="py-4 text-center text-xs text-[#2a3e55]">
                  未配置转发目标
                </p>
              )}
            </div>
          </div>

          {/* OID Mappings */}
          <div className="rounded-xl border border-[#1a2332] bg-[#0f1624] p-5">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <BookOpen className="h-4 w-4 text-[#ffb447]" />
                <h3 className="text-sm font-semibold text-white">OID 名称映射</h3>
              </div>
              <button
                onClick={addOidMapping}
                className="flex items-center gap-1 rounded-md bg-[#162030] px-2.5 py-1 text-xs text-[#ffb447] transition-all hover:bg-[#1a2a3d]"
              >
                <Plus className="h-3.5 w-3.5" />
                添加
              </button>
            </div>
            <p className="mb-4 text-xs text-[#4a5e78]">
              将 OID 转换为易读的名称（支持前缀匹配），应用于 Trap 转发和显示
            </p>
            <div className="space-y-2">
              {config.oid_mappings.map((mapping, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={mapping.oid}
                    onChange={(e) => updateOidMapping(i, "oid", e.target.value)}
                    placeholder="OID (如 1.3.6.1.2.1.1.1)"
                    className="flex-1 rounded-lg border border-[#1a2332] bg-[#0a0e17] px-3 py-2 font-mono text-xs text-white outline-none focus:border-[#ffb447]"
                  />
                  <Link2 className="h-3.5 w-3.5 text-[#2a3e55]" />
                  <input
                    type="text"
                    value={mapping.name}
                    onChange={(e) => updateOidMapping(i, "name", e.target.value)}
                    placeholder="名称 (如 sysDescr)"
                    className="flex-1 rounded-lg border border-[#1a2332] bg-[#0a0e17] px-3 py-2 text-xs text-white outline-none focus:border-[#ffb447]"
                  />
                  <button
                    onClick={() => removeOidMapping(i)}
                    className="rounded-md p-1.5 text-[#ff4d6a] transition-all hover:bg-[#2a1520]"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
              {config.oid_mappings.length === 0 && (
                <p className="py-2 text-center text-xs text-[#2a3e55]">
                  未配置 OID 映射
                </p>
              )}
            </div>
          </div>

          {/* Save Button */}
          <div className="flex items-center gap-4">
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 rounded-lg bg-[#00e5a0] px-6 py-2.5 text-sm font-bold text-[#0a0e17] shadow-[0_0_20px_rgba(0,229,160,0.3)] transition-all hover:bg-[#00ffb4] hover:shadow-[0_0_30px_rgba(0,229,160,0.5)] disabled:opacity-50"
            >
              <Save className="h-4 w-4" />
              {saving ? "保存中..." : "保存并重启监听"}
            </button>
            {message && (
              <span
                className={
                  message.includes("失败")
                    ? "text-xs text-[#ff4d6a]"
                    : "text-xs text-[#00e5a0]"
                }
              >
                {message}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
