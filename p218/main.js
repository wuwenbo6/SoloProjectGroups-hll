const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const Vxi11Client = require('./vxi11-client');

let mainWindow;
let vxiClient = new Vxi11Client();

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 700,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile('index.html');
  mainWindow.webContents.openDevTools();
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
  if (vxiClient.isConnected()) {
    vxiClient.disconnect();
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

ipcMain.handle('connect', async (event, host, device) => {
  try {
    await vxiClient.connect(host, device);
    return { success: true, message: 'Connected successfully' };
  } catch (error) {
    return { success: false, message: error.message };
  }
});

ipcMain.handle('disconnect', async () => {
  try {
    vxiClient.disconnect();
    return { success: true, message: 'Disconnected successfully' };
  } catch (error) {
    return { success: false, message: error.message };
  }
});

ipcMain.handle('isConnected', () => {
  return vxiClient.isConnected();
});

ipcMain.handle('sendCommand', async (event, command) => {
  try {
    const response = await vxiClient.sendCommand(command);
    return { success: true, response: response, command: command };
  } catch (error) {
    return { success: false, response: error.message, command: command };
  }
});

ipcMain.handle('query', async (event, command) => {
  try {
    const response = await vxiClient.query(command);
    return { success: true, response: response, command: command };
  } catch (error) {
    return { success: false, response: error.message, command: command };
  }
});

ipcMain.handle('discoverDevices', async () => {
  try {
    const devices = await vxiClient.discoverDevices();
    return { success: true, devices: devices };
  } catch (error) {
    return { success: false, message: error.message };
  }
});

ipcMain.handle('takeSnapshot', async () => {
  try {
    const snapshot = await vxiClient.takeSnapshot();
    return { success: true, snapshot: snapshot };
  } catch (error) {
    return { success: false, message: error.message };
  }
});

ipcMain.handle('saveSnapshot', async (event, filePath) => {
  try {
    const snapshot = await vxiClient.saveSnapshot(filePath);
    return { success: true, snapshot: snapshot, path: filePath };
  } catch (error) {
    return { success: false, message: error.message };
  }
});

ipcMain.handle('loadSnapshot', async (event, filePath) => {
  try {
    const snapshot = await vxiClient.loadSnapshot(filePath);
    return { success: true, snapshot: snapshot };
  } catch (error) {
    return { success: false, message: error.message };
  }
});

ipcMain.handle('restoreSnapshot', async (event, snapshot) => {
  try {
    const results = await vxiClient.restoreSnapshot(snapshot);
    return { success: true, results: results };
  } catch (error) {
    return { success: false, message: error.message };
  }
});

ipcMain.handle('listSnapshots', async (event, directory) => {
  try {
    const snapshots = await vxiClient.listSnapshots(directory);
    return { success: true, snapshots: snapshots };
  } catch (error) {
    return { success: false, message: error.message };
  }
});

ipcMain.handle('generateSnapshotFilename', () => {
  return vxiClient.generateSnapshotFilename();
});

ipcMain.handle('getSnapshotDirectory', () => {
  return vxiClient._getSnapshotDirectory();
});

ipcMain.handle('showSaveDialog', async (event, defaultFilename) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    defaultPath: defaultFilename || vxiClient.generateSnapshotFilename(),
    filters: [
      { name: 'JSON Files', extensions: ['json'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  });
  return result;
});

ipcMain.handle('showOpenDialog', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [
      { name: 'JSON Files', extensions: ['json'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  });
  return result;
});
