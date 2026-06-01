import { useEffect, useRef, useState } from 'react'
import { useAppStore } from '@/store/useAppStore'
import {
  Server,
  FolderOpen,
  FileWarning,
  PieChart,
  Play,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Loader2,
  ArrowRight,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}

function AnimatedNumber({ value, duration = 800 }: { value: number; duration?: number }) {
  const [display, setDisplay] = useState(0)
  const prevValue = useRef(0)

  useEffect(() => {
    const start = prevValue.current
    const end = value
    const startTime = performance.now()

    function animate(now: number) {
      const elapsed = now - startTime
      const progress = Math.min(elapsed / duration, 1)
      const eased = 1 - Math.pow(1 - progress, 3)
      setDisplay(Math.round(start + (end - start) * eased))
      if (progress < 1) requestAnimationFrame(animate)
    }

    requestAnimationFrame(animate)
    prevValue.current = value
    return () => {}
  }, [value, duration])

  return <>{display.toLocaleString()}</>
}

export default function Dashboard() {
  const {
    connected,
    connecting,
    connectError,
    connection,
    scanStatus,
    setConnection,
    connect,
    startScan,
    pollScanStatus,
  } = useAppStore()

  const navigate = useNavigate()
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    useAppStore.getState().checkStatus()
  }, [])

  useEffect(() => {
    if (scanStatus.scanning) {
      pollRef.current = setInterval(() => {
        pollScanStatus()
      }, 1500)
    } else {
      if (pollRef.current) {
        clearInterval(pollRef.current)
        pollRef.current = null
      }
    }
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [scanStatus.scanning])

  const coldRatio =
    scanStatus.total_objects > 0
      ? ((scanStatus.cold_objects / scanStatus.total_objects) * 100).toFixed(1)
      : '0.0'

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-zinc-900 tracking-tight">存储概览</h2>
        <p className="text-sm text-zinc-500 mt-1">配置 Swift 连接，扫描并识别冷数据</p>
      </div>

      <div className="card p-6 mb-6">
        <div className="flex items-center gap-2 mb-5">
          <Server className="w-5 h-5 text-brand-600" />
          <h3 className="font-semibold text-zinc-900">Swift 连接配置</h3>
          {connected && (
            <span className="ml-auto flex items-center gap-1.5 text-xs font-medium text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-full">
              <CheckCircle2 className="w-3.5 h-3.5" />
              已连接
            </span>
          )}
          {!connected && connectError && (
            <span className="ml-auto flex items-center gap-1.5 text-xs font-medium text-danger-600 bg-danger-50 px-2.5 py-1 rounded-full">
              <XCircle className="w-3.5 h-3.5" />
              连接失败
            </span>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4 mb-5">
          <div>
            <label className="block text-xs font-medium text-zinc-500 mb-1.5">Auth URL</label>
            <input
              type="text"
              className="input-field font-mono text-xs"
              placeholder="https://auth.example.com/v3"
              value={connection.auth_url}
              onChange={(e) => setConnection({ auth_url: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-500 mb-1.5">用户名</label>
            <input
              type="text"
              className="input-field"
              placeholder="admin"
              value={connection.username}
              onChange={(e) => setConnection({ username: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-500 mb-1.5">密码</label>
            <input
              type="password"
              className="input-field"
              placeholder="••••••••"
              value={connection.password}
              onChange={(e) => setConnection({ password: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-500 mb-1.5">项目名称</label>
            <input
              type="text"
              className="input-field"
              placeholder="admin"
              value={connection.project_name}
              onChange={(e) => setConnection({ project_name: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-500 mb-1.5">项目域名</label>
            <input
              type="text"
              className="input-field"
              placeholder="Default"
              value={connection.project_domain_name}
              onChange={(e) => setConnection({ project_domain_name: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-500 mb-1.5">用户域名</label>
            <input
              type="text"
              className="input-field"
              placeholder="Default"
              value={connection.user_domain_name}
              onChange={(e) => setConnection({ user_domain_name: e.target.value })}
            />
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={connect}
            disabled={connecting}
            className="btn-primary flex items-center gap-2"
          >
            {connecting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                连接中...
              </>
            ) : connected ? (
              <>
                <RefreshCw className="w-4 h-4" />
                重新连接
              </>
            ) : (
              '测试连接'
            )}
          </button>
          {connectError && (
            <p className="text-xs text-danger-600">{connectError}</p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-4 gap-4 mb-6">
        {[
          {
            icon: FolderOpen,
            label: '容器数量',
            value: scanStatus.total_containers,
            color: 'brand',
            bg: 'bg-brand-50',
            iconColor: 'text-brand-600',
          },
          {
            icon: PieChart,
            label: '对象总数',
            value: scanStatus.total_objects,
            color: 'zinc',
            bg: 'bg-zinc-100',
            iconColor: 'text-zinc-600',
          },
          {
            icon: FileWarning,
            label: '冷数据数量',
            value: scanStatus.cold_objects,
            color: 'warn',
            bg: 'bg-warn-50',
            iconColor: 'text-warn-500',
          },
          {
            icon: PieChart,
            label: '冷数据占比',
            value: parseFloat(coldRatio),
            color: 'danger',
            bg: 'bg-danger-50',
            iconColor: 'text-danger-500',
            isPercent: true,
          },
        ].map((stat) => (
          <div key={stat.label} className="card p-5 animate-fade-in">
            <div className="flex items-center gap-3 mb-3">
              <div className={`w-9 h-9 rounded-lg ${stat.bg} flex items-center justify-center`}>
                <stat.icon className={`w-4.5 h-4.5 ${stat.iconColor}`} />
              </div>
              <span className="text-xs font-medium text-zinc-500">{stat.label}</span>
            </div>
            <div className="font-mono text-2xl font-bold text-zinc-900">
              {stat.isPercent ? (
                <>
                  <AnimatedNumber value={scanStatus.total_objects > 0 ? parseFloat(coldRatio) : 0} />
                  <span className="text-sm font-normal text-zinc-400 ml-1">%</span>
                </>
              ) : (
                <AnimatedNumber value={stat.value} />
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="card p-6">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h3 className="font-semibold text-zinc-900">扫描控制</h3>
            <p className="text-xs text-zinc-500 mt-1">
              {scanStatus.last_scan_time
                ? `上次扫描: ${new Date(scanStatus.last_scan_time).toLocaleString('zh-CN')}`
                : '尚未扫描'}
            </p>
          </div>
          <button
            onClick={startScan}
            disabled={!connected || scanStatus.scanning}
            className={`btn-primary flex items-center gap-2 ${
              scanStatus.scanning ? 'animate-pulse-glow' : ''
            }`}
          >
            {scanStatus.scanning ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                扫描中...
              </>
            ) : (
              <>
                <Play className="w-4 h-4" />
                开始扫描
              </>
            )}
          </button>
        </div>

        {scanStatus.scanning && (
          <div className="animate-fade-in">
            <div className="flex justify-between text-xs text-zinc-500 mb-2">
              <span>
                已扫描 {scanStatus.scanned_containers}/{scanStatus.total_containers} 个容器
              </span>
              <span>{scanStatus.progress}%</span>
            </div>
            <div className="w-full h-2.5 bg-zinc-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-brand-500 rounded-full transition-all duration-500 ease-out"
                style={{ width: `${scanStatus.progress}%` }}
              />
            </div>
            <p className="text-xs text-zinc-400 mt-2">
              已发现 {scanStatus.cold_objects} 个冷数据对象
            </p>
          </div>
        )}

        {scanStatus.error && (
          <div className="mt-3 p-3 bg-danger-50 border border-danger-100 rounded-lg text-xs text-danger-700">
            {scanStatus.error}
          </div>
        )}

        {!scanStatus.scanning && scanStatus.cold_objects > 0 && (
          <div className="mt-4 flex items-center justify-between p-4 bg-warn-50 border border-warn-100 rounded-xl">
            <div className="flex items-center gap-3">
              <FileWarning className="w-5 h-5 text-warn-500" />
              <div>
                <p className="text-sm font-medium text-warn-600">
                  发现 {scanStatus.cold_objects} 个冷数据对象
                </p>
                <p className="text-xs text-warn-500 mt-0.5">超过 90 天未访问，建议清理</p>
              </div>
            </div>
            <button
              onClick={() => navigate('/cleanup')}
              className="flex items-center gap-1.5 text-sm font-medium text-warn-600 hover:text-warn-700 transition-colors"
            >
              查看详情
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
