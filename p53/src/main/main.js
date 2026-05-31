const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const ADSBReceiver = require('./adsbReceiver');
const Database = require('./database');
const ConflictDetector = require('./conflictDetector');
const WeatherService = require('./weatherService');
const CSVExporter = require('./csvExporter');

let mainWindow;
let adsbReceiver;
let database;
let conflictDetector;
let weatherService;
let csvExporter;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      enableRemoteModule: true
    }
  });

  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  
  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools();
  }
}

app.whenReady().then(() => {
  database = new Database(path.join(__dirname, '../../database/flights.db'));
  adsbReceiver = new ADSBReceiver(database);
  conflictDetector = new ConflictDetector();
  weatherService = new WeatherService();
  csvExporter = new CSVExporter(database);
  
  createWindow();
  
  setupEventListeners();
  
  conflictDetector.start(3000);
  weatherService.start(10000);
  
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

function setupEventListeners() {
  adsbReceiver.on('flightUpdate', (flightData) => {
    conflictDetector.updateFlight(flightData);
    
    if (mainWindow) {
      mainWindow.webContents.send('flightUpdate', flightData);
    }
  });
  
  conflictDetector.on('conflict', (conflict) => {
    if (mainWindow) {
      mainWindow.webContents.send('conflictAlert', conflict);
    }
  });
  
  conflictDetector.on('conflictResolved', (conflictId) => {
    if (mainWindow) {
      mainWindow.webContents.send('conflictResolved', conflictId);
    }
  });
  
  weatherService.on('weatherUpdate', (weatherData) => {
    if (mainWindow) {
      mainWindow.webContents.send('weatherUpdate', weatherData);
    }
  });
}

app.on('window-all-closed', () => {
  if (adsbReceiver) adsbReceiver.stop();
  if (conflictDetector) conflictDetector.stop();
  if (weatherService) weatherService.stop();
  if (database) database.close();
  
  if (process.platform !== 'darwin') app.quit();
});

ipcMain.on('start-receiver', (event, host, port) => {
  adsbReceiver.start(host, port);
});

ipcMain.on('stop-receiver', () => {
  adsbReceiver.stop();
});

ipcMain.handle('get-historical-flights', async (event, startTime, endTime) => {
  return database.getHistoricalFlights(startTime, endTime);
});

ipcMain.handle('get-flight-history', async (event, icao24) => {
  return database.getFlightHistory(icao24);
});

ipcMain.handle('get-all-flights', async () => {
  return database.getAllFlights();
});

ipcMain.handle('get-active-conflicts', async () => {
  return conflictDetector.getActiveConflicts();
});

ipcMain.handle('get-weather-data', async () => {
  return weatherService.getWeatherData();
});

ipcMain.handle('export-flights-csv', async (event, startTime, endTime) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    title: '导出航班数据',
    defaultPath: `flights_export_${Date.now()}.csv`,
    filters: [{ name: 'CSV 文件', extensions: ['csv'] }]
  });
  
  if (result.canceled) return null;
  
  return csvExporter.exportFlights(startTime, endTime, result.filePath);
});

ipcMain.handle('export-flight-history-csv', async (event, icao24) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    title: '导出航班轨迹',
    defaultPath: `flight_${icao24}_${Date.now()}.csv`,
    filters: [{ name: 'CSV 文件', extensions: ['csv'] }]
  });
  
  if (result.canceled) return null;
  
  return csvExporter.exportFlightHistory(icao24, result.filePath);
});

ipcMain.handle('export-report', async (event, startTime, endTime) => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: '选择报告保存目录',
    properties: ['openDirectory', 'createDirectory']
  });
  
  if (result.canceled) return null;
  
  return csvExporter.generateReport(startTime, endTime, result.filePaths[0]);
});

ipcMain.handle('export-conflicts-csv', async (event, conflicts) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    title: '导出冲突数据',
    defaultPath: `conflicts_${Date.now()}.csv`,
    filters: [{ name: 'CSV 文件', extensions: ['csv'] }]
  });
  
  if (result.canceled) return null;
  
  return csvExporter.exportConflicts(conflicts, result.filePath);
});
