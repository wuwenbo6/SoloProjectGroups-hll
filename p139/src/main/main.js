const { app, BrowserWindow, ipcMain, Menu, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const InstrumentManager = require('../instrument/InstrumentManager');
const Database = require('../database/Database');
const ScriptEngine = require('../script/ScriptEngine');
const ReportGenerator = require('../report/ReportGenerator');

let mainWindow;
let instrumentManager;
let database;
let scriptEngine;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));

  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools();
  }
}

let reportGenerator;

function initialize() {
  const dbPath = path.join(app.getPath('userData'), 'instrument.db');
  database = new Database(dbPath);
  instrumentManager = new InstrumentManager();
  scriptEngine = new ScriptEngine({
    instrumentManager,
    database
  });
  reportGenerator = new ReportGenerator(database);
}

app.whenReady().then(() => {
  initialize();
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

ipcMain.handle('instrument:list', async () => {
  return instrumentManager.listDevices();
});

ipcMain.handle('instrument:connect', async (_, deviceId) => {
  return instrumentManager.connect(deviceId);
});

ipcMain.handle('instrument:disconnect', async (_, deviceId) => {
  return instrumentManager.disconnect(deviceId);
});

ipcMain.handle('instrument:send', async (_, deviceId, command, timeout) => {
  return instrumentManager.sendCommand(deviceId, command, timeout);
});

ipcMain.handle('instrument:query', async (_, deviceId, command, timeout) => {
  return instrumentManager.query(deviceId, command, timeout);
});

ipcMain.handle('instrument:batch', async (_, deviceId, commands, options) => {
  return instrumentManager.batchCommands(deviceId, commands, options);
});

ipcMain.handle('instrument:isBusy', async (_, deviceId) => {
  return instrumentManager.isBusy(deviceId);
});

ipcMain.handle('instrument:reset', async (_, deviceId) => {
  return instrumentManager.resetConnection(deviceId);
});

ipcMain.handle('instrument:setTimeout', async (_, deviceId, timeout) => {
  return instrumentManager.setTimeout(deviceId, timeout);
});

ipcMain.handle('commands:getAll', async () => {
  return database.getAllCommands();
});

ipcMain.handle('commands:add', async (_, command) => {
  return database.addCommand(command);
});

ipcMain.handle('commands:update', async (_, id, command) => {
  return database.updateCommand(id, command);
});

ipcMain.handle('commands:delete', async (_, id) => {
  return database.deleteCommand(id);
});

ipcMain.handle('sequences:getAll', async () => {
  return database.getAllSequences();
});

ipcMain.handle('sequences:add', async (_, sequence) => {
  return database.addSequence(sequence);
});

ipcMain.handle('sequences:update', async (_, id, sequence) => {
  return database.updateSequence(id, sequence);
});

ipcMain.handle('sequences:delete', async (_, id) => {
  return database.deleteSequence(id);
});

ipcMain.handle('script:run', async (_, code, language) => {
  return scriptEngine.run(code, language);
});

ipcMain.handle('script:runWithTest', async (_, code, language, testName) => {
  return scriptEngine.run(code, language, testName);
});

ipcMain.handle('script:runSequence', async (_, sequenceId) => {
  return scriptEngine.runSequence(sequenceId);
});

ipcMain.handle('script:stop', async () => {
  return scriptEngine.stop();
});

ipcMain.handle('testruns:getAll', async (_, limit) => {
  return database.getAllTestRuns(limit);
});

ipcMain.handle('testruns:get', async (_, testRunId) => {
  return database.getTestRun(testRunId);
});

ipcMain.handle('testruns:delete', async (_, testRunId) => {
  return database.deleteTestRun(testRunId);
});

ipcMain.handle('measurements:getHistory', async (_, deviceId, command, limit) => {
  return database.getMeasurementHistory(deviceId, command, limit);
});

ipcMain.handle('report:exportHTML', async (_, testRunId) => {
  const defaultPath = path.join(os.homedir(), 'Desktop', `test_report_${testRunId}.html`);
  const result = await dialog.showSaveDialog(mainWindow, {
    defaultPath,
    filters: [{ name: 'HTML Report', extensions: ['html'] }]
  });
  
  if (!result.canceled && result.filePath) {
    await reportGenerator.saveHTML(testRunId, result.filePath);
    shell.showItemInFolder(result.filePath);
    return { success: true, path: result.filePath };
  }
  return { success: false };
});

ipcMain.handle('report:exportCSV', async (_, testRunId) => {
  const defaultPath = path.join(os.homedir(), 'Desktop', `test_report_${testRunId}.csv`);
  const result = await dialog.showSaveDialog(mainWindow, {
    defaultPath,
    filters: [{ name: 'CSV Report', extensions: ['csv'] }]
  });
  
  if (!result.canceled && result.filePath) {
    await reportGenerator.saveCSV(testRunId, result.filePath);
    shell.showItemInFolder(result.filePath);
    return { success: true, path: result.filePath };
  }
  return { success: false };
});

ipcMain.handle('report:exportJSON', async (_, testRunId) => {
  const defaultPath = path.join(os.homedir(), 'Desktop', `test_report_${testRunId}.json`);
  const result = await dialog.showSaveDialog(mainWindow, {
    defaultPath,
    filters: [{ name: 'JSON Report', extensions: ['json'] }]
  });
  
  if (!result.canceled && result.filePath) {
    await reportGenerator.saveJSON(testRunId, result.filePath);
    shell.showItemInFolder(result.filePath);
    return { success: true, path: result.filePath };
  }
  return { success: false };
});

ipcMain.handle('report:previewHTML', async (_, testRunId) => {
  const html = await reportGenerator.generateHTML(testRunId);
  const tempPath = path.join(os.tmpdir(), `test_report_${testRunId}_${Date.now()}.html`);
  fs.writeFileSync(tempPath, html, 'utf8');
  shell.openExternal(`file://${tempPath}`);
  return { success: true, path: tempPath };
});
