import { Router, type Request, type Response } from 'express'
import { runSimulation, type SimConfig, type SimResult } from '../services/dpdkService.js'

const router = Router()

let currentTest: {
  status: 'idle' | 'running' | 'completed'
  testId: string | null
  result: SimResult | null
  error: string | null
} = { status: 'idle', testId: null, result: null, error: null }

let multiSizeResults: SimResult[] = []

router.post('/start', async (req: Request, res: Response) => {
  try {
    const config: SimConfig = {
      packetCount: Math.min(Math.max(Number(req.body.packetCount) || 1000, 100), 100000),
      packetSize: Math.min(Math.max(Number(req.body.packetSize) || 64, 64), 9000),
      forwardMode: req.body.forwardMode === 'cut_through' ? 'cut_through' : 'store_forward',
      baseLatencyNs: Math.min(Math.max(Number(req.body.baseLatencyNs) || 5000, 100), 1000000),
      jitterNs: Math.min(Math.max(Number(req.body.jitterNs) || 2000, 0), 500000),
    }
    currentTest = { status: 'running', testId: null, result: null, error: null }
    const result = await runSimulation(config)
    currentTest = { status: 'completed', testId: result.testId, result, error: null }
    res.json({ testId: result.testId, status: 'completed' })
  } catch (err: any) {
    currentTest = { status: 'idle', testId: null, result: null, error: err.message }
    res.status(500).json({ error: err.message })
  }
})

router.post('/multi-size', async (req: Request, res: Response) => {
  try {
    const baseConfig: SimConfig = {
      packetCount: Math.min(Math.max(Number(req.body.packetCount) || 1000, 100), 100000),
      packetSize: 64,
      forwardMode: req.body.forwardMode === 'cut_through' ? 'cut_through' : 'store_forward',
      baseLatencyNs: Math.min(Math.max(Number(req.body.baseLatencyNs) || 5000, 100), 1000000),
      jitterNs: Math.min(Math.max(Number(req.body.jitterNs) || 2000, 0), 500000),
    }
    const sizes: number[] = req.body.packetSizes || [64, 128, 256, 512, 1024, 1280, 1518]
    currentTest = { status: 'running', testId: null, result: null, error: null }
    multiSizeResults = []
    for (const size of sizes) {
      const config = { ...baseConfig, packetSize: size }
      const result = await runSimulation(config)
      multiSizeResults.push(result)
    }
    currentTest = {
      status: 'completed',
      testId: 'multi_' + Date.now(),
      result: multiSizeResults[multiSizeResults.length - 1] || null,
      error: null,
    }
    res.json({ status: 'completed', count: multiSizeResults.length })
  } catch (err: any) {
    currentTest = { status: 'idle', testId: null, result: null, error: err.message }
    res.status(500).json({ error: err.message })
  }
})

router.get('/multi-size', (_req: Request, res: Response) => {
  res.json(multiSizeResults)
})

router.post('/stop', (_req: Request, res: Response) => {
  currentTest = { status: 'idle', testId: null, result: null, error: null }
  res.json({ status: 'stopped' })
})

router.get('/status', (_req: Request, res: Response) => {
  res.json({
    status: currentTest.status,
    testId: currentTest.testId,
    progress: currentTest.status === 'completed' ? 100 : currentTest.status === 'running' ? 50 : 0,
    packetsProcessed: currentTest.result?.stats.count ?? 0,
    error: currentTest.error,
  })
})

router.get('/latency', (_req: Request, res: Response) => {
  if (!currentTest.result) {
    res.status(404).json({ error: 'No test results available' })
    return
  }
  res.json(currentTest.result)
})

router.get('/export-csv', (_req: Request, res: Response) => {
  const allResults = multiSizeResults.length > 0 ? multiSizeResults : (currentTest.result ? [currentTest.result] : [])
  if (allResults.length === 0) {
    res.status(404).json({ error: 'No data to export' })
    return
  }
  const headers = [
    'packet_size_bytes', 'packet_count', 'forward_mode', 'base_latency_ns', 'jitter_ns',
    'mean_latency_ns', 'min_latency_ns', 'max_latency_ns',
    'p50_latency_ns', 'p90_latency_ns', 'p99_latency_ns', 'p999_latency_ns', 'stddev_ns',
    'throughput_pps', 'total_time_s', 'vport0_sent', 'vport1_received',
  ]
  const rows = allResults.map((r) =>
    [
      r.config.packetSize, r.stats.count, r.config.forwardMode,
      r.config.baseLatencyNs, r.config.jitterNs,
      r.stats.mean.toFixed(2), r.stats.min.toFixed(2), r.stats.max.toFixed(2),
      r.stats.p50.toFixed(2), r.stats.p90.toFixed(2), r.stats.p99.toFixed(2), r.stats.p999.toFixed(2), r.stats.stddev.toFixed(2),
      r.throughputPps.toFixed(2), r.totalTimeS.toFixed(6),
      r.portStats.vport0.sent, r.portStats.vport1.received,
    ].join(',')
  )
  const csv = [headers.join(','), ...rows].join('\n')
  res.setHeader('Content-Type', 'text/csv; charset=utf-8')
  res.setHeader('Content-Disposition', 'attachment; filename=dpdk_latency_' + Date.now() + '.csv')
  res.send(csv)
})

export default router
    'p50_latency_ns',
    'p90_latency_ns',
    'p99_latency_ns',
    'p999_latency_ns',
    'stddev_ns',
    'throughput_pps',
    'total_time_s',
    'vport0_sent',
    'vport1_received',
  ]

  const rows = allResults.map((r) =>
    [
      r.config.packetSize,
      r.stats.count,
      r.config.forwardMode,
      r.config.baseLatencyNs,
      r.config.jitterNs,
      r.stats.mean.toFixed(2),
      r.stats.min.toFixed(2),
      r.stats.max.toFixed(2),
      r.stats.p50.toFixed(2),
      r.stats.p90.toFixed(2),
      r.stats.p99.toFixed(2),
      r.stats.p999.toFixed(2),
      r.stats.stddev.toFixed(2),
      r.throughputPps.toFixed(2),
      r.totalTimeS.toFixed(6),
      r.portStats.vport0.sent,
      r.portStats.vport1.received,
    ].join(',')
  )

  const csv = [headers.join(','), ...rows].join('\n')

  res.setHeader('Content-Type', 'text/csv; charset=utf-8')
  res.setHeader('Content-Disposition', `attachment; filename=dpdk_latency_${Date.now()}.csv`)
  res.send(csv)
})

export default router
    status: currentTest.status,
    testId: currentTest.testId,
    progress: currentTest.status === 'completed' ? 100 : currentTest.status === 'running' ? 50 : 0,
    packetsProcessed: currentTest.result?.stats.count ?? 0,
    error: currentTest.error,
  })
})

router.get('/latency', (_req: Request, res: Response) => {
  if (!currentTest.result) {
    res.status(404).json({ error: 'No test results available' })
    return
  }
  res.json(currentTest.result)
})

router.get('/export-csv', (_req: Request, res: Response) => {
  const allResults = multiSizeResults.length > 0 ? multiSizeResults : (currentTest.result ? [currentTest.result] : [])

  if (allResults.length === 0) {
    res.status(404).json({ error: 'No data to export' })
    return
  }

  const headers = [
    'packet_size_bytes',
    'packet_count',
    'forward_mode',
    'base_latency_ns',
    'jitter_ns',
    'mean_latency_ns',
    'min_latency_ns',
    'max_latency_ns',
    'p50_latency_ns',
    'p90_latency_ns',
    'p99_latency_ns',
    'p999_latency_ns',
    'stddev_ns',
    'throughput_pps',
    'total_time_s',
    'vport0_sent',
    'vport1_received',
  ]

  const rows = allResults.map((r) =>
    [
      r.config.packetSize,
      r.stats.count,
      r.config.forwardMode,
      r.config.baseLatencyNs,
      r.config.jitterNs,
      r.stats.mean.toFixed(2),
      r.stats.min.toFixed(2),
      r.stats.max.toFixed(2),
      r.stats.p50.toFixed(2),
      r.stats.p90.toFixed(2),
      r.stats.p99.toFixed(2),
      r.stats.p999.toFixed(2),
      r.stats.stddev.toFixed(2),
      r.throughputPps.toFixed(2),
      r.totalTimeS.toFixed(6),
      r.portStats.vport0.sent,
      r.portStats.vport1.received,
    ].join(',')
  )

  const csv = [headers.join(','), ...rows].join('\n')

  res.setHeader('Content-Type', 'text/csv; charset=utf-8')
  res.setHeader('Content-Disposition', `attachment; filename=dpdk_latency_${Date.now()}.csv`)
  res.send(csv)
})

export default router
