import coap from 'coap'
import type { WebSocket } from 'ws'

interface SensorReading {
  value: number
  timestamp: number
  sequence: number
}

interface CoapResource {
  uri: string
  name: string
  unit: string
  currentValue: number
  lastNotifiedValue: number
  lastUpdated: number
  min: number
  max: number
  sum: number
  count: number
  history: SensorReading[]
  range: { min: number; max: number }
  delta: number
  changeThreshold: number
}

interface ObserveFilter {
  lt?: number
  gt?: number
  lte?: number
  gte?: number
  eq?: number
  ne?: number
}

interface ObserverInfo {
  response: coap.CoapResponse
  sequence: number
  filter: ObserveFilter
  rawUrl: string
}

interface SensorPayload {
  type: 'sensor_data'
  resource: string
  value: number
  unit: string
  timestamp: number
  sequence: number
}

interface ConnectionPayload {
  type: 'connection_status'
  coapServer: 'online' | 'offline'
  observer: 'active' | 'inactive'
}

interface ResourceListPayload {
  type: 'resource_list'
  resources: Array<{ uri: string; name: string; unit: string; icon: string }>
}

interface ObserverListPayload {
  type: 'observer_list'
  observers: Array<{
    resource: string
    sequence: number
    filter: ObserveFilter | null
    url: string
  }>
}

type WsPayload = SensorPayload | ConnectionPayload | ResourceListPayload | ObserverListPayload

const MAX_HISTORY = 120

const resourceDefs: Omit<
  CoapResource,
  'currentValue' | 'lastNotifiedValue' | 'lastUpdated' | 'min' | 'max' | 'sum' | 'count' | 'history'
>[] = [
  {
    uri: '/sensors/temperature',
    name: 'Temperature',
    unit: '°C',
    range: { min: 18, max: 32 },
    delta: 1.5,
    changeThreshold: 0.5,
  },
  {
    uri: '/sensors/humidity',
    name: 'Humidity',
    unit: '%',
    range: { min: 30, max: 80 },
    delta: 3,
    changeThreshold: 0.5,
  },
]

function parseFilterFromUrl(rawUrl: string): { basePath: string; filter: ObserveFilter } {
  const [basePath, queryString] = rawUrl.split('?')
  const filter: ObserveFilter = {}

  if (!queryString) return { basePath, filter }

  const params = new URLSearchParams(queryString)
  const filterKeys: (keyof ObserveFilter)[] = ['lt', 'gt', 'lte', 'gte', 'eq', 'ne']

  for (const key of filterKeys) {
    const val = params.get(key)
    if (val !== null) {
      const num = parseFloat(val)
      if (!isNaN(num)) {
        filter[key] = num
      }
    }
  }

  return { basePath, filter }
}

function matchesFilter(value: number, filter: ObserveFilter): boolean {
  if (Object.keys(filter).length === 0) return true

  if (filter.lt !== undefined && !(value < filter.lt)) return false
  if (filter.gt !== undefined && !(value > filter.gt)) return false
  if (filter.lte !== undefined && !(value <= filter.lte)) return false
  if (filter.gte !== undefined && !(value >= filter.gte)) return false
  if (filter.eq !== undefined && !(value === filter.eq)) return false
  if (filter.ne !== undefined && !(value !== filter.ne)) return false

  return true
}

function filterDescription(filter: ObserveFilter): string {
  const parts: string[] = []
  if (filter.lt !== undefined) parts.push(`< ${filter.lt}`)
  if (filter.gt !== undefined) parts.push(`> ${filter.gt}`)
  if (filter.lte !== undefined) parts.push(`≤ ${filter.lte}`)
  if (filter.gte !== undefined) parts.push(`≥ ${filter.gte}`)
  if (filter.eq !== undefined) parts.push(`= ${filter.eq}`)
  if (filter.ne !== undefined) parts.push(`≠ ${filter.ne}`)
  return parts.length > 0 ? parts.join(', ') : 'none'
}

class CoapManager {
  private resources: Map<string, CoapResource> = new Map()
  private coapServer: coap.CoapServer | null = null
  private observers: Map<string, Set<ObserverInfo>> = new Map()
  private wsClients: Set<WebSocket> = new Set()
  private updateInterval: ReturnType<typeof setInterval> | null = null
  private coapServerOnline = false
  private observerActive = false
  private globalSequence = 0

  init() {
    this.initResources()
    this.startCoapServer()
    this.startSimulation()
  }

  private initResources() {
    for (const def of resourceDefs) {
      const initial = Math.round(((def.range.min + def.range.max) / 2) * 10) / 10
      this.resources.set(def.uri, {
        ...def,
        currentValue: initial,
        lastNotifiedValue: initial,
        lastUpdated: Date.now(),
        min: initial,
        max: initial,
        sum: 0,
        count: 0,
        history: [],
      })
    }
  }

  private startCoapServer() {
    const server = coap.createServer((req, res) => {
      const { basePath, filter } = parseFilterFromUrl(req.url)

      if (!this.resources.has(basePath)) {
        res.code = '4.04'
        res.end(JSON.stringify({ error: 'Not Found' }))
        return
      }

      if (req.headers['Observe'] !== undefined) {
        if (!this.observers.has(basePath)) {
          this.observers.set(basePath, new Set())
        }

        const observerInfo: ObserverInfo = {
          response: res,
          sequence: 0,
          filter,
          rawUrl: req.url,
        }
        this.observers.get(basePath)!.add(observerInfo)
        this.observerActive = true

        const resource = this.resources.get(basePath)!
        const filterDesc = filterDescription(filter)

        res.setOption('Observe', observerInfo.sequence)
        res.write(JSON.stringify({
          value: resource.currentValue,
          unit: resource.unit,
          sequence: observerInfo.sequence,
          filter: Object.keys(filter).length > 0 ? filter : undefined,
        }))
        observerInfo.sequence++

        console.log(
          `[CoAP] Client observing ${basePath} (filter: ${filterDesc}), initial seq=0`
        )

        res.on('finish', () => {
          const obs = this.observers.get(basePath)
          if (obs) {
            obs.delete(observerInfo)
            if (obs.size === 0) this.observers.delete(basePath)
          }
          console.log(`[CoAP] Client stopped observing ${basePath}`)
        })
      } else {
        const resource = this.resources.get(basePath)!
        const responseData: Record<string, unknown> = {
          value: resource.currentValue,
          unit: resource.unit,
        }
        if (Object.keys(filter).length > 0) {
          responseData.filter = filter
          responseData.matches = matchesFilter(resource.currentValue, filter)
        }
        res.end(JSON.stringify(responseData))
      }
    })

    server.listen(5683, () => {
      this.coapServerOnline = true
      this.broadcastConnectionStatus()
      console.log('[CoAP] Server listening on port 5683')
    })

    this.coapServer = server
  }

  private shouldNotify(resource: CoapResource): boolean {
    const range = resource.range.max - resource.range.min
    const absoluteChange = Math.abs(resource.currentValue - resource.lastNotifiedValue)
    const percentageChange = (absoluteChange / range) * 100

    const shouldNotify = percentageChange >= resource.changeThreshold
    if (shouldNotify) {
      console.log(
        `[CoAP] Threshold triggered for ${resource.uri}: ` +
          `${resource.lastNotifiedValue} → ${resource.currentValue} ` +
          `(change: ${percentageChange.toFixed(2)}%, threshold: ${resource.changeThreshold}%)`
      )
    }
    return shouldNotify
  }

  private notifyCoapObservers(uri: string, value: number, unit: string, seq: number) {
    const obs = this.observers.get(uri)
    if (!obs || obs.size === 0) return

    for (const observer of obs) {
      const filterMatch = matchesFilter(value, observer.filter)

      if (!filterMatch) {
        console.log(
          `[CoAP] Skipped ${uri} observer (seq=${observer.sequence}): ` +
            `value ${value} does not match filter [${filterDescription(observer.filter)}]`
        )
        continue
      }

      try {
        observer.response.setOption('Observe', observer.sequence)
        const notifiedPayload = JSON.stringify({
          value,
          unit,
          sequence: observer.sequence,
          globalSeq: seq,
          filter: Object.keys(observer.filter).length > 0 ? observer.filter : undefined,
        })
        observer.response.write(notifiedPayload)
        console.log(
          `[CoAP] Notified ${uri} observer with seq=${observer.sequence} ` +
            `(filter: ${filterDescription(observer.filter)})`
        )
        observer.sequence++
      } catch {
        obs.delete(observer)
        console.log(`[CoAP] Observer removed for ${uri} due to error`)
      }
    }
  }

  private startSimulation() {
    setTimeout(() => {
      for (const [uri, resource] of this.resources) {
        const now = Date.now()
        const seq = this.globalSequence++
        resource.count = 1
        resource.sum = resource.currentValue
        resource.lastUpdated = now
        resource.history.push({ value: resource.currentValue, timestamp: now, sequence: seq })
        this.broadcastSensorData(uri, resource.currentValue, resource.unit, now, seq)
      }
    }, 500)

    this.updateInterval = setInterval(() => {
      for (const [uri, resource] of this.resources) {
        const fluctuation = (Math.random() - 0.5) * 2 * resource.delta
        let newValue = resource.currentValue + fluctuation
        newValue = Math.max(resource.range.min, Math.min(resource.range.max, newValue))
        newValue = Math.round(newValue * 10) / 10

        const now = Date.now()
        const seq = this.globalSequence++
        resource.currentValue = newValue
        resource.lastUpdated = now
        resource.count++
        resource.sum += newValue
        if (newValue < resource.min) resource.min = newValue
        if (newValue > resource.max) resource.max = newValue
        resource.history.push({ value: newValue, timestamp: now, sequence: seq })
        if (resource.history.length > MAX_HISTORY) {
          resource.history.shift()
        }

        if (this.shouldNotify(resource)) {
          this.notifyCoapObservers(uri, newValue, resource.unit, seq)
          resource.lastNotifiedValue = newValue
        }

        this.broadcastSensorData(uri, newValue, resource.unit, now, seq)
      }
    }, 2000)
  }

  private broadcastSensorData(resource: string, value: number, unit: string, timestamp: number, sequence: number) {
    const payload: SensorPayload = { type: 'sensor_data', resource, value, unit, timestamp, sequence }
    const data = JSON.stringify(payload)
    for (const client of this.wsClients) {
      if (client.readyState === 1) {
        client.send(data)
      }
    }
  }

  private broadcastConnectionStatus() {
    const payload: ConnectionPayload = {
      type: 'connection_status',
      coapServer: this.coapServerOnline ? 'online' : 'offline',
      observer: this.observerActive ? 'active' : 'inactive',
    }
    const data = JSON.stringify(payload)
    for (const client of this.wsClients) {
      if (client.readyState === 1) {
        client.send(data)
      }
    }
  }

  getObserverList() {
    const result: Array<{
      resource: string
      sequence: number
      filter: ObserveFilter | null
      url: string
    }> = []
    for (const [uri, observers] of this.observers) {
      for (const obs of observers) {
        result.push({
          resource: uri,
          sequence: obs.sequence,
          filter: Object.keys(obs.filter).length > 0 ? obs.filter : null,
          url: obs.rawUrl,
        })
      }
    }
    return result
  }

  addWsClient(ws: WebSocket) {
    this.wsClients.add(ws)

    const resourceList: ResourceListPayload = {
      type: 'resource_list',
      resources: Array.from(this.resources.values()).map((r) => ({
        uri: r.uri,
        name: r.name,
        unit: r.unit,
        icon: r.uri.includes('temperature') ? 'thermometer' : 'droplets',
      })),
    }
    ws.send(JSON.stringify(resourceList))

    const statusPayload: ConnectionPayload = {
      type: 'connection_status',
      coapServer: this.coapServerOnline ? 'online' : 'offline',
      observer: this.observerActive ? 'active' : 'inactive',
    }
    if (ws.readyState === 1) {
      ws.send(JSON.stringify(statusPayload))
    }

    for (const resource of this.resources.values()) {
      if (resource.history.length > 0) {
        for (const reading of resource.history) {
          const sensorPayload: SensorPayload = {
            type: 'sensor_data',
            resource: resource.uri,
            value: reading.value,
            unit: resource.unit,
            timestamp: reading.timestamp,
            sequence: reading.sequence,
          }
          if (ws.readyState === 1) {
            ws.send(JSON.stringify(sensorPayload))
          }
        }
      }
    }

    ws.on('close', () => {
      this.wsClients.delete(ws)
    })
  }

  getResources() {
    return Array.from(this.resources.values()).map((r) => ({
      uri: r.uri,
      name: r.name,
      unit: r.unit,
      currentValue: r.currentValue,
      lastNotifiedValue: r.lastNotifiedValue,
      lastUpdated: r.lastUpdated,
      min: r.min,
      max: r.max,
      avg: r.count > 0 ? Math.round((r.sum / r.count) * 10) / 10 : 0,
      changeThreshold: r.changeThreshold,
      history: r.history,
    }))
  }

  getResourceHistory(uri: string, limit = 60) {
    const resource = this.resources.get(uri)
    if (!resource) return null
    return resource.history.slice(-limit)
  }

  exportCsv(): string {
    const lines: string[] = ['Resource,Name,Value,Unit,Timestamp,Sequence']

    for (const resource of this.resources.values()) {
      for (const reading of resource.history) {
        const time = new Date(reading.timestamp).toISOString()
        lines.push(
          `${resource.uri},${resource.name},${reading.value},${resource.unit},${time},${reading.sequence}`
        )
      }
    }

    return lines.join('\n')
  }

  exportResourceCsv(uri: string): string | null {
    const resource = this.resources.get(uri)
    if (!resource) return null

    const lines: string[] = ['Timestamp,Value,Unit,Sequence']
    for (const reading of resource.history) {
      const time = new Date(reading.timestamp).toISOString()
      lines.push(`${time},${reading.value},${resource.unit},${reading.sequence}`)
    }

    return lines.join('\n')
  }

  destroy() {
    if (this.updateInterval) clearInterval(this.updateInterval)
    if (this.coapServer) this.coapServer.close()
  }
}

const coapManager = new CoapManager()
export default coapManager
export { matchesFilter, filterDescription, parseFilterFromUrl }
export type { ObserveFilter }
