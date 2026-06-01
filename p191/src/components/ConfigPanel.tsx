import { useDpdkStore } from '../store/dpdkStore'
import { startTest, startMultiSizeTest, fetchLatency, fetchMultiSizeResults, exportCsv } from '../api/dpdkApi'
import { Play, RotateCcw, Download } from 'lucide-react'

const DEFAULT_SIZE_LIST = [64, 128, 256, 512, 1024, 1280, 1518]

export default function ConfigPanel() {
  const { config, setConfig, setResult, setMultiSizeResults, setStatus, status, reset } = useDpdkStore()

  const handleStartTest = async () => {
    try {
      setStatus('running')
      
      if (config.packetSize === -1) {
        await startMultiSizeTest({
          packetCount: config.packetCount,
          forwardMode: config.forwardMode,
          baseLatencyNs: config.baseLatencyNs,
          jitterNs: config.jitterNs,
          packetSizes: DEFAULT_SIZE_LIST,
        })
        const results = await fetchMultiSizeResults()
        setMultiSizeResults(results)
        if (results.length > 0) {
          setResult(results[0])
        }
      } else {
        await startTest(config)
        const result = await fetchLatency()
        setResult(result)
        setMultiSizeResults([])
      }
      
      setStatus('completed')
    } catch (err: any) {
      setStatus('error')
      console.error('Test failed:', err)
    }
  }

  const handleExportCsv = async () => {
    try {
      await exportCsv()
    } catch (err: any) {
      console.error('Export failed:', err)
    }
  }

  const handleReset = () => {
    reset()
  }

  const isRunning = status === 'running'

  return (
    <div
      className='rounded-xl border p-5 space-y-5'
      style={{
        background: 'var(--bg-card)',
        borderColor: 'var(--border)',
      }}
    >
      <h2 className='text-sm font-semibold tracking-wider uppercase' style={{ color: 'var(--accent-cyan)' }}>
        测试配置
      </h2>

      <div className='space-y-4'>
        <div className='space-y-2'>
          <div className='flex items-center justify-between'>
            <label className='text-xs font-medium' style={{ color: 'var(--text-secondary)' }}>
              报文数量
            </label>
            <span className='text-xs font-mono' style={{ color: 'var(--accent-cyan)' }}>
              {config.packetCount.toLocaleString()}
            </span>
          </div>
          <input
            type='range'
            min='100'
            max='100000'
            step='100'
            value={config.packetCount}
            onChange={(e) => setConfig({ packetCount: Number(e.target.value) })}
            disabled={isRunning}
            className='w-full h-1.5 rounded-full appearance-none cursor-pointer'
            style={{
              background: 'var(--border)',
              accentColor: 'var(--accent-cyan)',
            }}
          />
          <div className='flex justify-between text-[10px] font-mono' style={{ color: 'var(--text-dim)' }}>
            <span>100</span>
            <span>100K</span>
          </div>
        </div>

        <div className='space-y-2'>
          <div className='flex items-center justify-between'>
            <label className='text-xs font-medium' style={{ color: 'var(--text-secondary)' }}>
              报文大小 (bytes)
            </label>
            <span className='text-xs font-mono' style={{ color: 'var(--accent-cyan)' }}>
              {config.packetSize === -1 ? '多尺寸测试' : config.packetSize}
            </span>
          </div>
          <input
            type='range'
            min='-1'
            max='9000'
            step='1'
            value={config.packetSize}
            onChange={(e) => setConfig({ packetSize: Number(e.target.value) })}
            disabled={isRunning}
            className='w-full h-1.5 rounded-full appearance-none cursor-pointer'
            style={{
              background: 'var(--border)',
              accentColor: 'var(--accent-cyan)',
            }}
          />
          <div className='flex justify-between text-[10px] font-mono' style={{ color: 'var(--text-dim)' }}>
            <span>多尺寸</span>
            <span>64</span>
            <span>1518</span>
            <span>9000</span>
          </div>
        </div>

        <div className='space-y-2'>
          <label className='text-xs font-medium' style={{ color: 'var(--text-secondary)' }}>
            转发模式
          </label>
          <select
            value={config.forwardMode}
            onChange={(e) => setConfig({ forwardMode: e.target.value as 'cut_through' | 'store_forward' })}
            disabled={isRunning}
            className='w-full px-3 py-2 rounded-lg text-sm border outline-none transition-colors'
            style={{
              background: 'var(--bg-deep)',
              borderColor: 'var(--border)',
              color: 'var(--text-primary)',
            }}
          >
            <option value='store_forward'>存储转发 (Store & Forward)</option>
            <option value='cut_through'>直通转发 (Cut Through)</option>
          </select>
        </div>

        <div className='space-y-2'>
          <div className='flex items-center justify-between'>
            <label className='text-xs font-medium' style={{ color: 'var(--text-secondary)' }}>
              基础延迟
            </label>
            <span className='text-xs font-mono' style={{ color: 'var(--accent-green)' }}>
              {config.baseLatencyNs} ns
            </span>
          </div>
          <input
            type='range'
            min='100'
            max='1000000'
            step='100'
            value={config.baseLatencyNs}
            onChange={(e) => setConfig({ baseLatencyNs: Number(e.target.value) })}
            disabled={isRunning}
            className='w-full h-1.5 rounded-full appearance-none cursor-pointer'
            style={{
              background: 'var(--border)',
              accentColor: 'var(--accent-green)',
            }}
          />
          <div className='flex justify-between text-[10px] font-mono' style={{ color: 'var(--text-dim)' }}>
            <span>100ns</span>
            <span>1ms</span>
          </div>
        </div>

        <div className='space-y-2'>
          <div className='flex items-center justify-between'>
            <label className='text-xs font-medium' style={{ color: 'var(--text-secondary)' }}>
              抖动范围
            </label>
            <span className='text-xs font-mono' style={{ color: '#a78bfa' }}>
              ±{config.jitterNs} ns
            </span>
          </div>
          <input
            type='range'
            min='0'
            max='500000'
            step='100'
            value={config.jitterNs}
            onChange={(e) => setConfig({ jitterNs: Number(e.target.value) })}
            disabled={isRunning}
            className='w-full h-1.5 rounded-full appearance-none cursor-pointer'
            style={{
              background: 'var(--border)',
              accentColor: '#a78bfa',
            }}
          />
          <div className='flex justify-between text-[10px] font-mono' style={{ color: 'var(--text-dim)' }}>
            <span>0ns</span>
            <span>500μs</span>
          </div>
        </div>
      </div>

      <div className='space-y-2 pt-2'>
        <button
          onClick={handleStartTest}
          disabled={isRunning}
          className='w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:hover:scale-100'
          style={{
            background: 'var(--accent-cyan)',
            color: '#000',
          }}
        >
          <Play className='w-4 h-4' />
          {isRunning ? '测试运行中...' : '启动测试'}
        </button>

        <div className='flex gap-2'>
          <button
            onClick={handleExportCsv}
            disabled={isRunning}
            className='flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:hover:scale-100'
            style={{
              background: 'var(--bg-deep)',
              borderColor: 'var(--border)',
              color: 'var(--text-secondary)',
            }}
          >
            <Download className='w-4 h-4' />
            导出CSV
          </button>

          <button
            onClick={handleReset}
            disabled={isRunning}
            className='flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:hover:scale-100'
            style={{
              background: 'var(--bg-deep)',
              borderColor: 'var(--border)',
              color: 'var(--text-secondary)',
            }}
          >
            <RotateCcw className='w-4 h-4' />
            重置
          </button>
        </div>
      </div>
    </div>
  )
}
