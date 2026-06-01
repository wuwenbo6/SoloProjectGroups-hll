const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const matterCommissioner = require('./matter-commissioner');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      enableRemoteModule: true
    }
  });

  mainWindow.loadFile('index.html');

  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

ipcMain.on('parse-qr-code', (event, qrData) => {
  try {
    const result = matterCommissioner.parseQRCode(qrData);
    event.reply('qr-parsed', { success: true, data: result });
  } catch (error) {
    event.reply('qr-parsed', { success: false, error: error.message });
  }
});

ipcMain.on('parse-manual-code', (event, manualCode) => {
  try {
    const result = matterCommissioner.parseManualCode(manualCode);
    event.reply('manual-code-parsed', { success: true, data: result });
  } catch (error) {
    event.reply('manual-code-parsed', { success: false, error: error.message });
  }
});

ipcMain.on('start-commissioning', async (event, deviceInfo) => {
  const sendLog = (level, message) => {
    event.reply('commissioning-log', { level, message, timestamp: new Date().toISOString() });
  };

  const sendStepUpdate = (step, status, details = {}) => {
    event.reply('step-update', { step, status, details, timestamp: new Date().toISOString() });
  };

  try {
    await matterCommissioner.startCommissioning(deviceInfo, sendLog, sendStepUpdate);
    event.reply('commissioning-complete', { success: true });
  } catch (error) {
    sendLog('error', `配网失败: ${error.message}`);
    event.reply('commissioning-complete', { success: false, error: error.message });
  }
});

ipcMain.on('reset-commissioning', (event) => {
  matterCommissioner.reset();
  event.reply('commissioning-reset');
});

ipcMain.handle('export-device-info', (event) => {
  try {
    const deviceInfo = matterCommissioner.exportDeviceInfoJSON();
    return { success: true, data: deviceInfo };
  } catch (error) {
    return { success: false, error: error.message };
  }
});
