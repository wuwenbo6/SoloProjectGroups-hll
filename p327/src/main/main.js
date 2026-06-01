const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const fs = require('fs');
const path = require('path');
const BleScanner = require('./ble-scanner');
const SimulatedBleScanner = require('./simulated-scanner');

let mainWindow = null;
let scanner = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 750,
    minWidth: 800,
    minHeight: 600,
    title: 'BLE Beacon Scanner',
    webPreferences: {
      preload: path.join(__dirname, '..', 'renderer', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
}

async function initScanner(useSimulation = false) {
  if (scanner) {
    scanner.stopScanning();
  }

  if (useSimulation) {
    scanner = new SimulatedBleScanner();
    await scanner.init();
    return { mode: 'simulation', available: true };
  }

  scanner = new BleScanner();
  const available = await scanner.init();

  if (!available) {
    scanner = new SimulatedBleScanner();
    await scanner.init();
    return { mode: 'simulation', available: true, fallback: true };
  }

  return { mode: 'hardware', available: true };
}

function handleBeaconUpdate(beacons) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('beacons-update', beacons);
  }
}

ipcMain.handle('start-scan', async (_event, useSimulation) => {
  const result = await initScanner(useSimulation);
  scanner.startScanning(handleBeaconUpdate);
  return result;
});

ipcMain.handle('stop-scan', async () => {
  if (scanner) {
    scanner.stopScanning();
    return { success: true };
  }
  return { success: false };
});

ipcMain.handle('clear-devices', async () => {
  if (scanner) {
    scanner.clearDevices();
    return { success: true };
  }
  return { success: false };
});

ipcMain.handle('export-time-series', async () => {
  if (!scanner) return { success: false, error: 'No scanner' };

  const data = scanner.exportTimeSeries();
  const defaultPath = path.join(app.getPath('documents'), `beacon-timeseries-${Date.now()}.json`);

  const result = await dialog.showSaveDialog(mainWindow, {
    title: '导出时间序列数据',
    defaultPath,
    filters: [{ name: 'JSON 文件', extensions: ['json'] }]
  });

  if (result.canceled) return { success: false, canceled: true };

  try {
    fs.writeFileSync(result.filePath, JSON.stringify(data, null, 2));
    return { success: true, path: result.filePath };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (scanner) {
    scanner.stopScanning();
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
