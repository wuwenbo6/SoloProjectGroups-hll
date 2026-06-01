import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { pythonBridge } from './python-bridge';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow: BrowserWindow | null = null;
let pythonPort: number = 0;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1280,
    minHeight: 800,
    backgroundColor: '#0a1628',
    title: 'DICOM Workstation',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
  try {
    pythonPort = await pythonBridge.start();
    console.log(`Python backend started on port ${pythonPort}`);
    
    pythonBridge.onReady(() => {
      mainWindow?.webContents.send('python-ready');
    });
    
    pythonBridge.onError((error) => {
      mainWindow?.webContents.send('python-error', error);
    });
  } catch (error) {
    console.error('Failed to start Python backend:', error);
  }

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  pythonBridge.stop();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  pythonBridge.stop();
});

ipcMain.handle('select-dicom-folder', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory'],
    title: 'Select DICOM Series Folder',
  });
  
  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }
  
  return result.filePaths[0];
});

ipcMain.handle('select-export-path', async () => {
  const result = await dialog.showSaveDialog({
    title: 'Export RTSTRUCT',
    defaultPath: 'RTSTRUCT.dcm',
    filters: [{ name: 'DICOM RTSTRUCT', extensions: ['dcm'] }],
  });
  
  if (result.canceled || !result.filePath) {
    return null;
  }
  
  return result.filePath;
});

ipcMain.handle('get-python-port', () => {
  return pythonPort;
});
