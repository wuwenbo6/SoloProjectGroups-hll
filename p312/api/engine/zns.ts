import type { Zone, ZoneState, Namespace, NamespaceStatus, OperationLog } from './types.js'

class ZNSError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ZNSError'
  }
}

class ZNSEngine {
  private namespace: Namespace | null = null
  private logs: OperationLog[] = []

  initNamespace(zoneCount: number, zoneCapacity: number): Namespace {
    const now = new Date().toISOString()
    const zones: Zone[] = Array.from({ length: zoneCount }, (_, i) => ({
      id: i,
      state: 'empty' as ZoneState,
      writePointer: 0,
      capacity: zoneCapacity,
      createdAt: now,
      updatedAt: now,
    }))

    this.namespace = {
      id: crypto.randomUUID(),
      zoneCount,
      zoneCapacity,
      zones,
      createdAt: now,
    }

    this.logs = []

    return this.namespace
  }

  getNamespace(): Namespace | null {
    return this.namespace
  }

  getStatus(): NamespaceStatus | null {
    if (!this.namespace) return null

    const zones = this.namespace.zones
    return {
      totalZones: zones.length,
      zoneCapacity: this.namespace.zoneCapacity,
      emptyCount: zones.filter((z) => z.state === 'empty').length,
      implicitlyOpenedCount: zones.filter((z) => z.state === 'implicitly_opened').length,
      explicitlyOpenedCount: zones.filter((z) => z.state === 'explicitly_opened').length,
      closedCount: zones.filter((z) => z.state === 'closed').length,
      fullCount: zones.filter((z) => z.state === 'full').length,
    }
  }

  getZones(): Zone[] {
    if (!this.namespace) throw new ZNSError('Namespace not initialized')
    return this.namespace.zones
  }

  getZone(id: number): Zone {
    if (!this.namespace) throw new ZNSError('Namespace not initialized')
    const zone = this.namespace.zones.find((z) => z.id === id)
    if (!zone) throw new ZNSError(`Zone ${id} not found`)
    return zone
  }

  openZone(id: number): Zone {
    const zone = this.getZone(id)
    const fromState = zone.state

    if (zone.state === 'empty' || zone.state === 'closed') {
      zone.state = 'explicitly_opened'
      zone.updatedAt = new Date().toISOString()
      this.addLog(id, 'open', fromState, zone.state, `Zone ${id} opened`)
      return zone
    }

    throw new ZNSError(
      `Cannot open zone ${id}: invalid state transition from ${zone.state}`,
    )
  }

  closeZone(id: number): Zone {
    const zone = this.getZone(id)
    const fromState = zone.state

    if (
      zone.state === 'implicitly_opened' ||
      zone.state === 'explicitly_opened'
    ) {
      zone.state = 'closed'
      zone.updatedAt = new Date().toISOString()
      this.addLog(id, 'close', fromState, zone.state, `Zone ${id} closed`)
      return zone
    }

    throw new ZNSError(
      `Cannot close zone ${id}: invalid state transition from ${zone.state}`,
    )
  }

  finishZone(id: number): Zone {
    const zone = this.getZone(id)
    const fromState = zone.state

    if (
      zone.state === 'implicitly_opened' ||
      zone.state === 'explicitly_opened' ||
      zone.state === 'closed'
    ) {
      zone.state = 'full'
      zone.writePointer = zone.capacity
      zone.updatedAt = new Date().toISOString()
      this.addLog(id, 'finish', fromState, zone.state, `Zone ${id} finished`)
      return zone
    }

    throw new ZNSError(
      `Cannot finish zone ${id}: invalid state transition from ${zone.state}`,
    )
  }

  resetZone(id: number): Zone {
    const zone = this.getZone(id)
    const fromState = zone.state

    if (zone.state === 'full' || zone.state === 'closed') {
      zone.state = 'empty'
      zone.writePointer = 0
      zone.updatedAt = new Date().toISOString()
      this.addLog(id, 'reset', fromState, zone.state, `Zone ${id} reset`)
      return zone
    }

    throw new ZNSError(
      `Cannot reset zone ${id}: invalid state transition from ${zone.state}`,
    )
  }

  writeZone(id: number, size: number): Zone {
    const zone = this.getZone(id)
    const fromState = zone.state

    if (
      zone.state !== 'empty' &&
      zone.state !== 'implicitly_opened' &&
      zone.state !== 'explicitly_opened'
    ) {
      throw new ZNSError(
        `Cannot write to zone ${id}: zone is in ${zone.state} state (not writable)`,
      )
    }

    const remaining = zone.capacity - zone.writePointer
    if (size > remaining) {
      throw new ZNSError(
        `Cannot write ${size} LBAs to zone ${id}: only ${remaining} LBAs remaining`,
      )
    }

    if (size <= 0) {
      throw new ZNSError('Write size must be positive')
    }

    zone.writePointer += size
    zone.updatedAt = new Date().toISOString()

    if (zone.state === 'empty') {
      zone.state = 'implicitly_opened'
    }

    if (zone.writePointer >= zone.capacity) {
      zone.state = 'full'
      zone.writePointer = zone.capacity
    }

    this.addLog(
      id,
      'write',
      fromState,
      zone.state,
      `Wrote ${size} LBAs to zone ${id} (WP: ${zone.writePointer}/${zone.capacity})`,
    )

    return zone
  }

  appendZone(id: number, size?: number): Zone {
    const zone = this.getZone(id)
    const fromState = zone.state

    if (
      zone.state !== 'empty' &&
      zone.state !== 'implicitly_opened' &&
      zone.state !== 'explicitly_opened'
    ) {
      throw new ZNSError(
        `Cannot append to zone ${id}: zone is in ${zone.state} state (not writable)`,
      )
    }

    const remaining = zone.capacity - zone.writePointer
    const writeSize = size && size > 0 ? Math.min(size, remaining) : remaining

    if (writeSize <= 0) {
      throw new ZNSError('Zone is already full')
    }

    zone.writePointer += writeSize
    zone.updatedAt = new Date().toISOString()

    if (zone.state === 'empty') {
      zone.state = 'implicitly_opened'
    }

    if (zone.writePointer >= zone.capacity) {
      zone.state = 'full'
      zone.writePointer = zone.capacity
    }

    this.addLog(
      id,
      'append',
      fromState,
      zone.state,
      `Appended ${writeSize} LBAs to zone ${id} (WP: ${zone.writePointer}/${zone.capacity})`,
    )

    return zone
  }

  exportZonesCSV(): string {
    const zones = this.getZones()
    const headers = ['Zone ID', 'State', 'Write Pointer', 'Capacity', 'Usage (%)', 'Created At', 'Updated At']
    const rows = zones.map((zone) => [
      zone.id,
      zone.state.toUpperCase().replace(/_/g, ' '),
      zone.writePointer,
      zone.capacity,
      ((zone.writePointer / zone.capacity) * 100).toFixed(2),
      zone.createdAt,
      zone.updatedAt,
    ])

    const csv = [
      headers.join(','),
      ...rows.map((row) => row.join(',')),
    ].join('\n')

    return csv
  }

  getLogs(): OperationLog[] {
    return this.logs
  }

  clearLogs(): void {
    this.logs = []
  }

  private addLog(
    zoneId: number,
    operation: string,
    fromState: ZoneState,
    toState: ZoneState,
    detail: string,
  ): void {
    this.logs.push({
      timestamp: new Date().toISOString(),
      zoneId,
      operation,
      fromState,
      toState,
      detail,
    })
  }
}

export const znsEngine = new ZNSEngine()
export { ZNSError }
