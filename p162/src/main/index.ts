import { app, BrowserWindow, ipcMain } from 'electron'
import path from 'node:path'

process.env.DIST_ELECTRON = path.join(__dirname, '..')
process.env.DIST = path.join(process.env.DIST_ELECTRON, '../dist')
process.env.VITE_PUBLIC = process.env.VITE_DEV_SERVER_URL
  ? path.join(process.env.DIST_ELECTRON, '../public')
  : process.env.DIST

let win: BrowserWindow | null
const preload = path.join(__dirname, '../preload/index.js')
const url = process.env.VITE_DEV_SERVER_URL
const indexHtml = path.join(process.env.DIST, 'index.html')

function createWindow() {
  win = new BrowserWindow({
    title: 'HART FSK Modem',
    icon: path.join(process.env.VITE_PUBLIC, 'favicon.ico'),
    width: 1400,
    height: 900,
    minWidth: 1200,
    minHeight: 700,
    backgroundColor: '#1D2129',
    webPreferences: {
      preload,
      nodeIntegration: false,
      contextIsolation: true,
    },
  })

  win.setMenuBarVisibility(false)

  if (url) {
    win.loadURL(url)
  } else {
    win.loadFile(indexHtml)
  }
}

app.whenReady().then(createWindow)

app.on('window-all-closed', () => {
  win = null
  if (process.platform !== 'darwin') app.quit()
})

app.on('second-instance', () => {
  if (win) {
    if (win.isMinimized()) win.restore()
    win.focus()
  }
})

app.on('activate', () => {
  const allWindows = BrowserWindow.getAllWindows()
  if (allWindows.length) {
    allWindows[0].focus()
  } else {
    createWindow()
  }
})

ipcMain.handle('minimize-window', () => {
  win?.minimize()
})

ipcMain.handle('maximize-window', () => {
  if (win?.isMaximized()) {
    win.unmaximize()
  } else {
    win?.maximize()
  }
  return win?.isMaximized() ?? false
})

ipcMain.handle('close-window', () => {
  win?.close()
})
