import type { ParsedUbxFile } from '../services/ubxParser.js'
import type { SatelliteMWResult } from '../services/mwCycleSlip.js'
import type { SppResult } from '../services/sppSolver.js'

interface StoredData {
  parsed: ParsedUbxFile
  rinex: string
  fileName: string
  mwData: SatelliteMWResult[]
  sppResults: SppResult[]
}

const store = new Map<string, StoredData>()

export function set(fileId: string, data: StoredData) {
  store.set(fileId, data)
}

export function get(fileId: string): StoredData | undefined {
  return store.get(fileId)
}

export function has(fileId: string): boolean {
  return store.has(fileId)
}

export function remove(fileId: string): boolean {
  return store.delete(fileId)
}

export function getAllKeys(): string[] {
  return Array.from(store.keys())
}
