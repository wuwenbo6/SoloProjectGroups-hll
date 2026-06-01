import { app, BrowserWindow, ipcMain } from 'electron'
import path from 'path'
import { fileURLToPath } from 'url'
import { PDSimulator } from './pd-simulator'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

let mainWindow: BrowserWindow | null = null
let pdSimulator: PDSimulator | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    backgroundColor: '#0F1923',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  const isDev = !app.isPackaged

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173')
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  mainWindow.on('closed', () => {
    if (pdSimulator) {
      pdSimulator.stop()
      pdSimulator.removeAllListeners()
      pdSimulator = null
    }
    mainWindow = null
  })
}

function setupSimulator(): void {
  pdSimulator = new PDSimulator()

  pdSimulator.on('message', (message: any) => {
    if (mainWindow) {
      mainWindow.webContents.send('pd:message', message)
    }
  })

  pdSimulator.on('negotiation-update', (update: any) => {
    if (mainWindow) {
      mainWindow.webContents.send('pd:negotiation-update', update)
    }
  })

  pdSimulator.on('power-curve-point', (point: any) => {
    if (mainWindow) {
      mainWindow.webContents.send('pd:power-curve-point', point)
    }
  })

  pdSimulator.on('device-status', (status: any) => {
    if (mainWindow) {
      mainWindow.webContents.send('pd:device-status', status)
    }
  })

  pdSimulator.on('message-id-gap', (gapEvent: any) => {
    if (mainWindow) {
      mainWindow.webContents.send('pd:message-id-gap', gapEvent)
    }
  })

  pdSimulator.on('hard-reset', (resetEvent: any) => {
    if (mainWindow) {
      mainWindow.webContents.send('pd:hard-reset', resetEvent)
    }
  })
}

function setupIPC(): void {
  ipcMain.on('pd:start-simulation', (_event, scenario: string, speed: number) => {
    if (pdSimulator) {
      pdSimulator.start(scenario, speed)
    }
  })

  ipcMain.on('pd:stop-simulation', () => {
    if (pdSimulator) {
      pdSimulator.stop()
    }
  })
}

app.whenReady().then(() => {
  setupSimulator()
  setupIPC()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
