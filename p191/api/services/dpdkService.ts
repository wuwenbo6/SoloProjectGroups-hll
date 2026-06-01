import { spawn } from 'child_process'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const SIM_BINARY = path.resolve(__dirname, '../../cpp/dpdk_sim')

export interface SimConfig {
  packetCount: number
  packetSize: number
  forwardMode: 'cut_through' | 'store_forward'
  baseLatencyNs: number
  jitterNs: number
}

export interface SimResult {
  testId: string
  config: SimConfig
  stats: {
    count: number
    mean: number
    min: number
    max: number
    p50: number
    p90: number
    p99: number
    p999: number
    stddev: number
  }
  portStats: {
    vport0: { received: number; sent: number }
    vport1: { received: number; sent: number }
  }
  throughputPps: number
  totalTimeS: number
  histogram: {
    buckets: { start: number; end: number; count: number }[]
  }
  latencies: number[]
}

export function runSimulation(config: SimConfig): Promise<SimResult> {
  return new Promise((resolve, reject) => {
    const args = [
      '--packet-count', String(config.packetCount),
      '--packet-size', String(config.packetSize),
      '--forward-mode', config.forwardMode,
      '--base-latency-ns', String(config.baseLatencyNs),
      '--jitter-ns', String(config.jitterNs),
    ]

    const proc = spawn(SIM_BINARY, args)
    let stdout = ''
    let stderr = ''

    proc.stdout.on('data', (data: Buffer) => {
      stdout += data.toString()
    })

    proc.stderr.on('data', (data: Buffer) => {
      stderr += data.toString()
    })

    proc.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`Simulation exited with code ${code}: ${stderr}`))
        return
      }
      try {
        const result: SimResult = JSON.parse(stdout.trim())
        resolve(result)
      } catch (e) {
        reject(new Error(`Failed to parse simulation output: ${stdout.substring(0, 200)}`))
      }
    })

    proc.on('error', (err) => {
      reject(new Error(`Failed to spawn simulation: ${err.message}`))
    })
  })
}
