const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const CANSimulator = require('./can-simulator');
const SDOProtocol = require('./sdo-protocol');
const CSVExporter = require('./csv-exporter');

let mainWindow;
let canSimulator;
let sdoProtocol;

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
  canSimulator = new CANSimulator();
  sdoProtocol = new SDOProtocol(canSimulator);

  canSimulator.on('message', (msg) => {
    if (mainWindow) {
      mainWindow.webContents.send('can-message', {
        id: msg.id,
        data: Array.from(msg.data),
        timestamp: msg.timestamp,
        direction: msg.direction,
        isSegment: msg.isSegment,
        segmentNum: msg.segmentNum
      });
    }
  });

  sdoProtocol.on('progress', (progress) => {
    if (mainWindow) {
      mainWindow.webContents.send('sdo-progress', progress);
    }
  });

  sdoProtocol.on('batch-progress', (progress) => {
    if (mainWindow) {
      mainWindow.webContents.send('batch-progress', progress);
    }
  });

  setupIPCHandlers();
  createWindow();

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});

function setupIPCHandlers() {
  ipcMain.handle('can-detect-devices', async () => {
    return await canSimulator.detectDevices();
  });

  ipcMain.handle('can-get-devices', () => {
    return canSimulator.getDetectedDevices();
  });

  ipcMain.handle('can-connect', async (_, deviceId) => {
    return await canSimulator.connect(deviceId);
  });

  ipcMain.handle('can-disconnect', async () => {
    return await canSimulator.disconnect();
  });

  ipcMain.handle('can-send', async (_, id, data) => {
    return await canSimulator.send(id, data);
  });

  ipcMain.handle('sdo-read', async (_, nodeId, index, subIndex) => {
    try {
      const result = await sdoProtocol.read(nodeId, index, subIndex);
      return { success: true, data: Array.from(result) };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('sdo-write', async (_, nodeId, index, subIndex, data) => {
    try {
      const result = await sdoProtocol.write(nodeId, index, subIndex, data);
      return { success: true, result };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('sdo-batch-read', async (_, nodeId, entries) => {
    try {
      const results = await sdoProtocol.batchRead(nodeId, entries);
      return { success: true, results };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('sdo-batch-write', async (_, nodeId, entries) => {
    try {
      const results = await sdoProtocol.batchWrite(nodeId, entries);
      return { success: true, results };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('export-csv', async (_, results, type) => {
    try {
      const csv = CSVExporter.generateBOM() + CSVExporter.exportObjectDictionary(results, {
        includeError: true
      });

      const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
        title: '导出对象字典为CSV',
        defaultPath: 'object-dictionary.csv',
        filters: [
          { name: 'CSV文件', extensions: ['csv'] },
          { name: '所有文件', extensions: ['*'] }
        ]
      });

      if (!canceled && filePath) {
        fs.writeFileSync(filePath, csv, 'utf8');
        return { success: true, filePath };
      }
      return { success: false, error: '用户取消' };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('export-csv-write', async (_, results) => {
    try {
      const csv = CSVExporter.generateBOM() + CSVExporter.exportBatchWriteResults(results);

      const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
        title: '导出写入结果为CSV',
        defaultPath: 'write-results.csv',
        filters: [
          { name: 'CSV文件', extensions: ['csv'] },
          { name: '所有文件', extensions: ['*'] }
        ]
      });

      if (!canceled && filePath) {
        fs.writeFileSync(filePath, csv, 'utf8');
        return { success: true, filePath };
      }
      return { success: false, error: '用户取消' };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('import-csv', async () => {
    try {
      const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
        title: '导入CSV对象字典',
        filters: [
          { name: 'CSV文件', extensions: ['csv'] },
          { name: '所有文件', extensions: ['*'] }
        ],
        properties: ['openFile']
      });

      if (!canceled && filePaths.length > 0) {
        const content = fs.readFileSync(filePaths[0], 'utf8');
        const entries = CSVExporter.parseCSV(content);
        return { success: true, entries, filePath: filePaths[0] };
      }
      return { success: false, error: '用户取消' };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });
}
