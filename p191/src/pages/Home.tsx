import ConfigPanel from '../components/ConfigPanel'
import StatsPanel from '../components/StatsPanel'
import LatencyHistogram from '../components/LatencyHistogram'
import MultiSizeChart from '../components/MultiSizeChart'
import { useDpdkStore } from '../store/dpdkStore'

export default function Home() {
  const { multiSizeResults } = useDpdkStore()
  const hasMultiSizeData = multiSizeResults.length > 0

  return (
    <div className='min-h-screen' style={{ background: 'var(--bg-main)' }}>
      <header
        className='border-b sticky top-0 z-10'
        style={{ background: 'var(--bg-header)', borderColor: 'var(--border)' }}
      >
        <div className='max-w-7xl mx-auto px-6 py-4'>
          <div className='flex items-center justify-between'>
            <div className='flex items-center gap-3'>
              <div
                className='w-9 h-9 rounded-lg flex items-center justify-center'
                style={{ background: 'var(--accent-cyan)' }}
              >
                <span className='text-lg'>⚡</span>
              </div>
              <div>
                <h1 className='text-lg font-semibold' style={{ color: 'var(--text-primary)' }}>
                  DPDK 延迟分析器
                </h1>
                <p className='text-xs' style={{ color: 'var(--text-dim)' }}>
                  虚拟端口转发性能测试
                </p>
              </div>
            </div>
            <div className='flex items-center gap-2'>
              <span
                className='px-3 py-1 rounded-full text-xs font-mono'
                style={{ background: 'var(--bg-deep)', color: 'var(--text-secondary)' }}
              >
                v0.1.0
              </span>
            </div>
          </div>
        </div>
      </header>

      <main className='max-w-7xl mx-auto px-6 py-8'>
        <div className='grid grid-cols-1 lg:grid-cols-12 gap-6'>
          <div className='lg:col-span-4 space-y-6'>
            <ConfigPanel />
          </div>

          <div className='lg:col-span-8 space-y-6'>
            <StatsPanel />
            
            {hasMultiSizeData ? (
              <MultiSizeChart />
            ) : (
              <LatencyHistogram />
            )}
          </div>
        </div>
      </main>

      <footer className='border-t mt-12' style={{ borderColor: 'var(--border)' }}>
        <div className='max-w-7xl mx-auto px-6 py-4'>
          <p className='text-xs text-center' style={{ color: 'var(--text-dim)' }}>
            DPDK Latency Analyzer - 基于软件模拟的网络性能测试工具
          </p>
        </div>
      </footer>
    </div>
  )
}