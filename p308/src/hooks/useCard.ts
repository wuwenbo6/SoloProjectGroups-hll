import { useCardStore } from '../store/cardStore'
import { hexToBytes, bytesToHex } from '../utils/hex'
import type { SectorData } from '../types'

declare global {
  interface Window {
    electronAPI?: {
      reader: {
        list: () => Promise<any[]>
        connect: (readerId: string) => Promise<any>
        disconnect: () => Promise<any>
      }
      auth: {
        authenticate: (sector: number, keyType: 'A' | 'B', key: number[]) => Promise<any>
        deauthenticate: (sector: number) => Promise<any>
        deauthenticateAll: () => Promise<any>
      }
      card: {
        read: (block: number) => Promise<any>
        write: (block: number, data: number[]) => Promise<any>
        getAll: () => Promise<any[]>
        reset: () => Promise<any>
        exportDump: () => Promise<any>
        importDump: (data: number[]) => Promise<any>
      }
      keys: {
        save: (entries: any[]) => Promise<any>
        load: () => Promise<any>
      }
    }
  }
}

function getApi() {
  return window.electronAPI!
}

export function useCard() {
  const store = useCardStore()

  async function refreshCardData() {
    try {
      const api = getApi()
      const sectors: SectorData[] = await api.card.getAll()
      store.setSectors(sectors)
    } catch (e) {
      store.addLog({ direction: 'error', message: `Failed to refresh card data: ${e}` })
    }
  }

  async function connectReader() {
    store.setIsConnecting(true)
    try {
      const api = getApi()
      const readers = await api.reader.list()
      if (readers.length > 0) {
        const result = await api.reader.connect(readers[0].id)
        if (result.success) {
          store.setReaderInfo(readers[0])
          store.addLog({ direction: 'info', message: `Connected to ${readers[0].name}` })
          await refreshCardData()
        }
      }
    } catch (e) {
      store.addLog({ direction: 'error', message: `Connection failed: ${e}` })
    } finally {
      store.setIsConnecting(false)
    }
  }

  async function disconnectReader() {
    try {
      const api = getApi()
      await api.reader.disconnect()
      store.setReaderInfo({ id: '', name: '', isVirtual: true, connected: false })
      store.addLog({ direction: 'info', message: 'Reader disconnected' })
    } catch (e) {
      store.addLog({ direction: 'error', message: `Disconnect failed: ${e}` })
    }
  }

  async function authenticate(sector: number) {
    const keyBytes = hexToBytes(store.authKey)
    if (keyBytes.length !== 6) {
      store.addLog({ direction: 'error', message: 'Invalid key: must be 6 bytes (12 hex characters)' })
      return
    }

    try {
      const api = getApi()
      store.addLog({
        direction: 'send',
        message: `AUTH Sector ${sector} Key ${store.authKeyType}`,
        data: `${store.authKeyType} ${store.authKey}`
      })

      const result = await api.auth.authenticate(sector, store.authKeyType, keyBytes)

      if (result.success) {
        store.addLog({
          direction: 'recv',
          message: `Auth SUCCESS Sector ${sector} (Key ${store.authKeyType})`
        })
        await refreshCardData()
      } else {
        store.addLog({
          direction: 'error',
          message: `Auth FAILED Sector ${sector}: ${result.error}`
        })
      }
    } catch (e) {
      store.addLog({ direction: 'error', message: `Auth error: ${e}` })
    }
  }

  async function authenticateAllSectors() {
    const keyBytes = hexToBytes(store.authKey)
    if (keyBytes.length !== 6) {
      store.addLog({ direction: 'error', message: 'Invalid key: must be 6 bytes' })
      return
    }

    try {
      const api = getApi()
      for (let s = 0; s < 16; s++) {
        const result = await api.auth.authenticate(s, store.authKeyType, keyBytes)
        store.addLog({
          direction: result.success ? 'recv' : 'error',
          message: `Sector ${s}: ${result.success ? 'OK' : result.error}`
        })
      }
      await refreshCardData()
    } catch (e) {
      store.addLog({ direction: 'error', message: `Batch auth error: ${e}` })
    }
  }

  async function deauthenticate(sector: number) {
    try {
      const api = getApi()
      await api.auth.deauthenticate(sector)
      store.addLog({ direction: 'info', message: `Deauthenticated sector ${sector}` })
      await refreshCardData()
    } catch (e) {
      store.addLog({ direction: 'error', message: `Deauth error: ${e}` })
    }
  }

  async function readBlock(block: number) {
    try {
      const api = getApi()
      store.addLog({ direction: 'send', message: `READ Block ${block}` })
      const result = await api.card.read(block)
      if (result.success) {
        store.addLog({
          direction: 'recv',
          message: `Block ${block} data:`,
          data: bytesToHex(result.data)
        })
      } else {
        store.addLog({ direction: 'error', message: `Read failed: ${result.error}` })
      }
    } catch (e) {
      store.addLog({ direction: 'error', message: `Read error: ${e}` })
    }
  }

  async function writeBlock(block: number) {
    const dataBytes = hexToBytes(store.writeData)
    if (dataBytes.length !== 16) {
      store.addLog({ direction: 'error', message: 'Write data must be 16 bytes (32 hex characters)' })
      return
    }

    try {
      const api = getApi()
      store.addLog({
        direction: 'send',
        message: `WRITE Block ${block}`,
        data: bytesToHex(dataBytes)
      })
      const result = await api.card.write(block, dataBytes)
      if (result.success) {
        store.addLog({ direction: 'recv', message: `Write SUCCESS Block ${block}` })
        await refreshCardData()
      } else {
        store.addLog({ direction: 'error', message: `Write failed: ${result.error}` })
      }
    } catch (e) {
      store.addLog({ direction: 'error', message: `Write error: ${e}` })
    }
  }

  async function resetCard() {
    try {
      const api = getApi()
      await api.card.reset()
      store.addLog({ direction: 'info', message: 'Card reset to defaults' })
      await refreshCardData()
    } catch (e) {
      store.addLog({ direction: 'error', message: `Reset error: ${e}` })
    }
  }

  async function exportDump() {
    try {
      const api = getApi()
      store.addLog({ direction: 'send', message: 'EXPORT DUMP' })
      const result = await api.card.exportDump()
      if (result.success) {
        store.addLog({
          direction: 'recv',
          message: `Dump exported: ${result.path}`,
          data: `${result.size} bytes`
        })
      } else {
        store.addLog({ direction: 'error', message: `Export failed: ${result.error}` })
      }
      return result
    } catch (e) {
      store.addLog({ direction: 'error', message: `Export error: ${e}` })
      return { success: false, error: String(e) }
    }
  }

  async function importDump() {
    try {
      const api = getApi()
      store.addLog({ direction: 'send', message: 'IMPORT DUMP' })
      const result = await api.card.importDump([])
      if (result.success) {
        store.addLog({
          direction: 'recv',
          message: `Dump imported: ${result.path}`,
          data: `${result.size} bytes`
        })
        await refreshCardData()
      } else {
        store.addLog({ direction: 'error', message: `Import failed: ${result.error}` })
      }
      return result
    } catch (e) {
      store.addLog({ direction: 'error', message: `Import error: ${e}` })
      return { success: false, error: String(e) }
    }
  }

  async function authenticateWithDictionary(sector: number) {
    const candidates = store.keyEntries.filter((k) => k.sector === sector)
    if (candidates.length === 0) {
      store.addLog({ direction: 'error', message: `No keys in dictionary for sector ${sector}` })
      return { success: false }
    }

    try {
      const api = getApi()
      for (const candidate of candidates) {
        store.addLog({
          direction: 'send',
          message: `TRY Sector ${sector} Key ${candidate.keyType} [${candidate.name}]`,
          data: bytesToHex(candidate.key)
        })
        const result = await api.auth.authenticate(sector, candidate.keyType, candidate.key)
        if (result.success) {
          store.addLog({
            direction: 'recv',
            message: `FOUND Key for Sector ${sector} [${candidate.name}]`,
            data: bytesToHex(candidate.key)
          })
          store.setAuthKey(bytesToHex(candidate.key))
          store.setAuthKeyType(candidate.keyType)
          await refreshCardData()
          return { success: true, key: candidate }
        }
      }
      store.addLog({ direction: 'error', message: `No matching key for sector ${sector} in dictionary` })
      return { success: false }
    } catch (e) {
      store.addLog({ direction: 'error', message: `Dictionary auth error: ${e}` })
      return { success: false, error: String(e) }
    }
  }

  async function authenticateAllWithDictionary() {
    let successCount = 0
    for (let s = 0; s < 16; s++) {
      const result = await authenticateWithDictionary(s)
      if (result.success) successCount++
    }
    store.addLog({
      direction: 'info',
      message: `Dictionary attack complete: ${successCount}/16 sectors authenticated`
    })
  }

  async function exportKeys() {
    try {
      const api = getApi()
      const result = await api.keys.save(store.keyEntries)
      if (result.success) {
        store.addLog({ direction: 'recv', message: `Keys exported: ${result.path}` })
      } else {
        store.addLog({ direction: 'error', message: `Key export failed: ${result.error}` })
      }
      return result
    } catch (e) {
      store.addLog({ direction: 'error', message: `Key export error: ${e}` })
      return { success: false, error: String(e) }
    }
  }

  async function importKeys() {
    try {
      const api = getApi()
      const result = await api.keys.load()
      if (result.success) {
        store.importKeyEntries(result.entries)
        store.addLog({
          direction: 'recv',
          message: `Keys imported: ${result.path}`,
          data: `${result.entries.length} entries`
        })
      } else {
        store.addLog({ direction: 'error', message: `Key import failed: ${result.error}` })
      }
      return result
    } catch (e) {
      store.addLog({ direction: 'error', message: `Key import error: ${e}` })
      return { success: false, error: String(e) }
    }
  }

  function addCurrentKeyToDictionary() {
    const keyBytes = hexToBytes(store.authKey)
    if (keyBytes.length !== 6) {
      store.addLog({ direction: 'error', message: 'Invalid key: must be 6 bytes' })
      return false
    }
    if (store.selectedSector === null) {
      store.addLog({ direction: 'error', message: 'Select a sector first' })
      return false
    }

    const exists = store.keyEntries.some(
      (k) =>
        k.sector === store.selectedSector &&
        k.keyType === store.authKeyType &&
        k.key.every((b, i) => b === keyBytes[i])
    )
    if (exists) {
      store.addLog({ direction: 'info', message: 'Key already exists in dictionary' })
      return false
    }

    store.addKeyEntry({
      name: `Sector ${store.selectedSector} Key ${store.authKeyType}`,
      sector: store.selectedSector,
      keyType: store.authKeyType,
      key: keyBytes
    })
    store.addLog({
      direction: 'info',
      message: `Added to dictionary: Sector ${store.selectedSector} Key ${store.authKeyType}`
    })
    return true
  }

  return {
    ...store,
    refreshCardData,
    connectReader,
    disconnectReader,
    authenticate,
    authenticateAllSectors,
    deauthenticate,
    readBlock,
    writeBlock,
    resetCard,
    exportDump,
    importDump,
    authenticateWithDictionary,
    authenticateAllWithDictionary,
    exportKeys,
    importKeys,
    addCurrentKeyToDictionary
  }
}
