import { app, BrowserWindow, ipcMain } from 'electron'
import path from 'node:path'
import { ModbusSlaveManager } from './modbus/ModbusSlaveManager'

process.env.APP_ROOT = path.join(import.meta.dirname, '../..')

export const MAIN_DIST = path.join(process.env.APP_ROOT, 'out/main')
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'out/renderer')
export const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL
  ? path.join(process.env.APP_ROOT, 'public')
  : RENDERER_DIST

let win: BrowserWindow | null
const slaveManager = new ModbusSlaveManager()

function createWindow(): void {
  const preloadPath = path.join(import.meta.dirname, '../preload/index.js')
  console.log('Preload path:', preloadPath)
  
  win = new BrowserWindow({
    icon: path.join(process.env.VITE_PUBLIC, 'favicon.ico'),
    width: 1400,
    height: 900,
    minWidth: 1200,
    minHeight: 700,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL)
    win.webContents.openDevTools()
  } else {
    win.loadFile(path.join(RENDERER_DIST, 'index.html'))
  }
}

app.whenReady().then(() => {
  ipcMain.handle('slave:list', () => slaveManager.getSlaves())
  ipcMain.handle('slave:add', (_e, config) => slaveManager.addSlave(config))
  ipcMain.handle('slave:update', (_e, id, config) => slaveManager.updateSlave(id, config))
  ipcMain.handle('slave:delete', (_e, id) => slaveManager.deleteSlave(id))
  ipcMain.handle('slave:start', (_e, id) => slaveManager.startSlave(id))
  ipcMain.handle('slave:stop', (_e, id) => slaveManager.stopSlave(id))
  
  ipcMain.handle('slave:getRegisters', (_e, id) => slaveManager.getRegisters(id))
  ipcMain.handle('slave:updateRegister', (_e, id, type, address, value) => 
    slaveManager.updateRegister(id, type, address, value))
  ipcMain.handle('slave:batchUpdateRegisters', (_e, id, type, startAddress, values) =>
    slaveManager.batchUpdateRegisters(id, type, startAddress, values))
  
  ipcMain.handle('slave:getIllegalAddresses', (_e, id) => slaveManager.getIllegalAddresses(id))
  ipcMain.handle('slave:addIllegalAddress', (_e, id, type, address) =>
    slaveManager.addIllegalAddress(id, type, address))
  ipcMain.handle('slave:removeIllegalAddress', (_e, id, type, address) =>
    slaveManager.removeIllegalAddress(id, type, address))

  ipcMain.handle('master:readHoldingRegisters', (_e, config, address, length) =>
    slaveManager.masterReadHoldingRegisters(config, address, length))
  ipcMain.handle('master:readInputRegisters', (_e, config, address, length) =>
    slaveManager.masterReadInputRegisters(config, address, length))
  ipcMain.handle('master:readCoils', (_e, config, address, length) =>
    slaveManager.masterReadCoils(config, address, length))
  ipcMain.handle('master:readDiscreteInputs', (_e, config, address, length) =>
    slaveManager.masterReadDiscreteInputs(config, address, length))
  ipcMain.handle('master:writeSingleRegister', (_e, config, address, value) =>
    slaveManager.masterWriteSingleRegister(config, address, value))
  ipcMain.handle('master:writeMultipleRegisters', (_e, config, address, values) =>
    slaveManager.masterWriteMultipleRegisters(config, address, values))
  ipcMain.handle('master:writeSingleCoil', (_e, config, address, value) =>
    slaveManager.masterWriteSingleCoil(config, address, value))

  ipcMain.handle('script:list', () => slaveManager.getScripts())
  ipcMain.handle('script:create', (_e, slaveId, name, code) => 
    slaveManager.createScript(slaveId, name, code))
  ipcMain.handle('script:update', (_e, id, updates) => 
    slaveManager.updateScript(id, updates))
  ipcMain.handle('script:delete', (_e, id) => slaveManager.deleteScript(id))
  ipcMain.handle('script:start', (_e, id) => slaveManager.startScript(id))
  ipcMain.handle('script:stop', (_e, id) => slaveManager.stopScript(id))

  ipcMain.handle('data:getHistory', (_e, slaveId) => 
    slaveManager.getDataHistory(slaveId))
  ipcMain.handle('data:clearHistory', (_e, slaveId) => 
    slaveManager.clearDataHistory(slaveId))
  ipcMain.handle('data:setRecording', (_e, enabled) => 
    slaveManager.setDataRecording(enabled))

  ipcMain.handle('config:export', () => slaveManager.exportConfig())
  ipcMain.handle('config:import', (_e, config) => slaveManager.importConfig(config))

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  slaveManager.stopAllSlaves()
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
