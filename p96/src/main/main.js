const { app, BrowserWindow, ipcMain, Notification, shell } = require('electron');
const path = require('path');
const Database = require('./database');
const GNSSAnalyzer = require('./gnssAnalyzer');
const AlarmSystem = require('./alarmSystem');
const ReportGenerator = require('./reportGenerator');

let mainWindow;
let db;
let gnssAnalyzer;
let alarmSystem;
let reportGenerator;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      enableRemoteModule: true
    },
    icon: path.join(__dirname, '../../assets/icon.png')
  });

  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));

  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  db = new Database(path.join(app.getPath('userData'), 'gnss_data.db'));
  gnssAnalyzer = new GNSSAnalyzer(db);
  alarmSystem = new AlarmSystem(mainWindow);
  reportGenerator = new ReportGenerator(db);

  gnssAnalyzer.on('satellite-update', (data) => {
    mainWindow.webContents.send('satellite-update', data);
  });

  gnssAnalyzer.on('anomaly-detected', (anomaly) => {
    alarmSystem.triggerAlarm(anomaly);
    mainWindow.webContents.send('anomaly-detected', anomaly);
    db.insertAnomaly(anomaly);
  });

  gnssAnalyzer.on('doa-update', (data) => {
    mainWindow.webContents.send('doa-update', data);
  });

  gnssAnalyzer.on('auth-update', (data) => {
    mainWindow.webContents.send('auth-update', data);
  });

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (gnssAnalyzer) {
    gnssAnalyzer.stop();
  }
  if (db) {
    db.close();
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

ipcMain.handle('start-analysis', async () => {
  return await gnssAnalyzer.start();
});

ipcMain.handle('stop-analysis', async () => {
  return await gnssAnalyzer.stop();
});

ipcMain.handle('get-satellites', async () => {
  return db.getSatellites();
});

ipcMain.handle('get-anomalies', async (_, filter) => {
  return db.getAnomalies(filter);
});

ipcMain.handle('get-signal-history', async (_, satelliteId) => {
  return db.getSignalHistory(satelliteId);
});

ipcMain.handle('get-ephemeris', async (_, satelliteId) => {
  return db.getEphemeris(satelliteId);
});

ipcMain.handle('acknowledge-alarm', async (_, anomalyId) => {
  alarmSystem.acknowledge(anomalyId);
  return db.acknowledgeAnomaly(anomalyId);
});

ipcMain.handle('export-data', async (_, options) => {
  return db.exportData(options);
});

ipcMain.handle('generate-report', async (_, options) => {
  return await reportGenerator.generateHTMLReport(options);
});

ipcMain.handle('export-csv', async (_, options) => {
  return await reportGenerator.exportToCSV(options);
});

ipcMain.handle('open-report', async (_, reportPath) => {
  shell.openPath(reportPath);
  return true;
});

ipcMain.handle('get-doa-data', async (_, prn) => {
  return gnssAnalyzer.getDoAData(prn);
});

ipcMain.handle('get-auth-data', async (_, prn) => {
  return gnssAnalyzer.getAuthData(prn);
});

ipcMain.handle('get-detection-config', async () => {
  return gnssAnalyzer.getDetectionConfig();
});

ipcMain.handle('get-system-status', async () => {
  return {
    running: gnssAnalyzer.isRunning(),
    dbConnected: db.isConnected(),
    alarmActive: alarmSystem.isAlarmActive(),
    satelliteCount: gnssAnalyzer.getSatelliteCount(),
    anomalyCount: db.getAnomalyCount()
  };
});