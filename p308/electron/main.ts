import { app, shell, BrowserWindow, ipcMain, dialog } from 'electron'
import { join } from 'path'
import { writeFile, readFile } from 'fs/promises'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { MifareCard } from './modules/card'
import { AuthenticationModule } from './modules/auth'
import { VirtualReader } from './modules/virtual'

let mainWindow: BrowserWindow | null = null
let card: MifareCard | null = null
let authModule: AuthenticationModule | null = null
let virtualReader: VirtualReader | null = null

function getCardDump(): number[] {
  if (!card) return []
  const sectors = card.getAllSectors()
  const dump: number[] = []
  for (const sector of sectors) {
    for (const block of sector.blocks) {
      dump.push(...block.data)
    }
  }
  return dump
}

function importCardDump(data: number[]): boolean {
  if (!card || data.length !== 1024) return false
  const sectors = card.getAllSectors()
  for (let s = 0; s < 16; s++) {
    for (let b = 0; b < 4; b++) {
      const blockNum = s * 4 + b
      const offset = blockNum * 16
      const blockData = data.slice(offset, offset + 16)
      const block = sectors[s].blocks[b]
      if (!block.isReadOnly) {
        card.writeBlock(blockNum, blockData)
      }
    }
  }
  return true
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 900,
    minWidth: 1024,
    show: false,
    title: 'MIFARE Classic 1K Simulator',
    backgroundColor: '#0a0e17',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow!.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function initModules(): void {
  card = new MifareCard()
  authModule = new AuthenticationModule(card)
  virtualReader = new VirtualReader(card, authModule)
  virtualReader.connect()
}

function setupIpc(): void {
  ipcMain.handle('reader:list', () => {
    return virtualReader ? [virtualReader.getInfo()] : []
  })

  ipcMain.handle('reader:connect', (_event, readerId: string) => {
    if (virtualReader && virtualReader.getInfo().id === readerId) {
      virtualReader.connect()
      return { success: true }
    }
    return { success: false, error: 'Reader not found' }
  })

  ipcMain.handle('reader:disconnect', () => {
    if (virtualReader) {
      virtualReader.disconnect()
      return { success: true }
    }
    return { success: false, error: 'No active reader' }
  })

  ipcMain.handle('auth:authenticate', (_event, params: { sector: number; keyType: 'A' | 'B'; key: number[] }) => {
    if (!authModule || !card) {
      return { success: false, sector: params.sector, keyType: params.keyType, error: 'Card not initialized' }
    }
    return authModule.authenticate(params.sector, params.keyType, params.key)
  })

  ipcMain.handle('card:read', (_event, params: { block: number }) => {
    if (!card) return { success: false, error: 'Card not initialized' }
    const blockData = card.readBlock(params.block)
    if (blockData === null) {
      return { success: false, error: 'Block read failed - authentication required' }
    }
    return { success: true, data: blockData }
  })

  ipcMain.handle('card:write', (_event, params: { block: number; data: number[] }) => {
    if (!card) return { success: false, error: 'Card not initialized' }
    const result = card.writeBlock(params.block, params.data)
    return result
  })

  ipcMain.handle('card:getAll', () => {
    if (!card) return []
    return card.getAllSectors()
  })

  ipcMain.handle('card:reset', () => {
    if (card) {
      card.reset()
      authModule = new AuthenticationModule(card)
      virtualReader = new VirtualReader(card, authModule)
      virtualReader.connect()
    }
    return { success: true }
  })

  ipcMain.handle('auth:deauthenticate', (_event, params: { sector: number }) => {
    if (!card) return { success: false, error: 'Card not initialized' }
    card.deauthenticateSector(params.sector)
    return { success: true }
  })

  ipcMain.handle('auth:deauthenticateAll', () => {
    if (!card) return { success: false, error: 'Card not initialized' }
    card.deauthenticateAll()
    return { success: true }
  })

  ipcMain.handle('card:exportDump', async () => {
    if (!card) return { success: false, error: 'Card not initialized' }

    try {
      const dump = getCardDump()
      const buffer = Buffer.from(dump)

      const result = await dialog.showSaveDialog(mainWindow!, {
        title: 'Export Card Dump',
        defaultPath: 'mifare-classic-1k-dump.bin',
        filters: [
          { name: 'Binary Dump', extensions: ['bin', 'mfd', 'dump'] },
          { name: 'All Files', extensions: ['*'] }
        ]
      })

      if (result.canceled || !result.filePath) {
        return { success: false, error: 'Export cancelled' }
      }

      await writeFile(result.filePath, buffer)
      return { success: true, path: result.filePath, size: buffer.length }
    } catch (e: any) {
      return { success: false, error: e.message || 'Export failed' }
    }
  })

  ipcMain.handle('card:importDump', async (_event, params: { data: number[] }) => {
    if (!card) return { success: false, error: 'Card not initialized' }

    try {
      const result = await dialog.showOpenDialog(mainWindow!, {
        title: 'Import Card Dump',
        filters: [
          { name: 'Binary Dump', extensions: ['bin', 'mfd', 'dump'] },
          { name: 'All Files', extensions: ['*'] }
        ],
        properties: ['openFile']
      })

      if (result.canceled || result.filePaths.length === 0) {
        return { success: false, error: 'Import cancelled' }
      }

      const filePath = result.filePaths[0]
      const buffer = await readFile(filePath)

      if (buffer.length !== 1024) {
        return { success: false, error: `Invalid dump size: ${buffer.length} bytes (expected 1024)` }
      }

      const data = Array.from(buffer)
      card.reset()
      importCardDump(data)

      return { success: true, path: filePath, size: buffer.length }
    } catch (e: any) {
      return { success: false, error: e.message || 'Import failed' }
    }
  })

  ipcMain.handle('keys:save', async (_event, params: { entries: any[] }) => {
    try {
      const result = await dialog.showSaveDialog(mainWindow!, {
        title: 'Export Key Dictionary',
        defaultPath: 'mifare-keys.json',
        filters: [{ name: 'JSON', extensions: ['json'] }]
      })

      if (result.canceled || !result.filePath) {
        return { success: false, error: 'Export cancelled' }
      }

      const json = JSON.stringify(params.entries, null, 2)
      await writeFile(result.filePath, json, 'utf-8')
      return { success: true, path: result.filePath }
    } catch (e: any) {
      return { success: false, error: e.message || 'Save failed' }
    }
  })

  ipcMain.handle('keys:load', async () => {
    try {
      const result = await dialog.showOpenDialog(mainWindow!, {
        title: 'Import Key Dictionary',
        filters: [{ name: 'JSON', extensions: ['json'] }],
        properties: ['openFile']
      })

      if (result.canceled || result.filePaths.length === 0) {
        return { success: false, error: 'Import cancelled' }
      }

      const filePath = result.filePaths[0]
      const content = await readFile(filePath, 'utf-8')
      const entries = JSON.parse(content)
      return { success: true, entries, path: filePath }
    } catch (e: any) {
      return { success: false, error: e.message || 'Load failed' }
    }
  })
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.mifare.simulator')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  initModules()
  setupIpc()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
