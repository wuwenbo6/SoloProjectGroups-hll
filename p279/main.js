const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const IoLinkMaster = require('./src/iolink/master');

let mainWindow = null;
let master = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 900,
    minWidth: 960,
    minHeight: 700,
    title: 'IO-Link Master Station',
    backgroundColor: '#0a0e1a',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, 'src', 'renderer', 'index.html'));

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function initMaster() {
  master = new IoLinkMaster();

  master.onDeviceUpdate = (update) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('device-update', update);
    }
  };

  master.onEvent = (event) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('device-event', event);
    }
  };

  master.onStateChange = (change) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('state-change', change);
    }
  };

  master.onLog = (log) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('log', log);
    }
  };
}

function registerIpcHandlers() {
  ipcMain.handle('connect', async (_event, portPath, baudRate) => {
    return master.connect(portPath, baudRate);
  });

  ipcMain.handle('disconnect', async () => {
    return master.disconnect();
  });

  ipcMain.handle('list-ports', async () => {
    return master.listSerialPorts();
  });

  ipcMain.handle('wakeup-device', async (_event, portNumber, comSpeed) => {
    return master.wakeupDevice(portNumber, comSpeed);
  });

  ipcMain.handle('start-operate', async (_event, portNumber) => {
    return master.startOperate(portNumber);
  });

  ipcMain.handle('stop-operate', async (_event, portNumber) => {
    return master.stopOperate(portNumber);
  });

  ipcMain.handle('read-isdu', async (_event, portNumber, index, subindex) => {
    return master.readISDU(portNumber, index, subindex);
  });

  ipcMain.handle('write-isdu', async (_event, portNumber, index, subindex, value) => {
    return master.writeISDU(portNumber, index, subindex, value);
  });

  ipcMain.handle('read-page', async (_event, portNumber, pageNumber) => {
    return master.readPage(portNumber, pageNumber);
  });

  ipcMain.handle('get-device-list', async () => {
    return master.getDeviceList();
  });

  ipcMain.handle('get-device-info', async (_event, portNumber) => {
    const device = master.getDevice(portNumber);
    return device ? device.getDeviceInfo() : null;
  });

  ipcMain.handle('get-process-data', async (_event, portNumber) => {
    const device = master.getDevice(portNumber);
    return device ? device.getProcessData() : null;
  });

  ipcMain.handle('get-isdu-list', async (_event, portNumber) => {
    const device = master.getDevice(portNumber);
    return device ? device.getISDUList() : [];
  });

  ipcMain.handle('get-events', async (_event, portNumber) => {
    const device = master.getDevice(portNumber);
    return device ? device.getEvents() : [];
  });

  ipcMain.handle('get-mseq-stats', async () => {
    return master.getMSeqStats();
  });

  ipcMain.handle('get-mseq-history', async (_event, count) => {
    return master.getMSeqHistory(count);
  });

  ipcMain.handle('get-mseq-active', async (_event, portNumber) => {
    return master.getMSeqActiveTransaction(portNumber);
  });

  ipcMain.handle('get-device-mseq-stats', async (_event, portNumber) => {
    const device = master.getDevice(portNumber);
    return device ? device.getMSeqStats() : null;
  });

  ipcMain.handle('get-device-mseq-history', async (_event, portNumber, count) => {
    const device = master.getDevice(portNumber);
    return device ? device.getMSeqHistory(count) : [];
  });

  ipcMain.handle('get-cycle-count', async () => {
    return master.getCycleCount();
  });

  ipcMain.handle('get-alarms', async (_event, portNumber, activeOnly) => {
    const device = master.getDevice(portNumber);
    return device ? device.getAlarms(activeOnly) : [];
  });

  ipcMain.handle('get-alarm-summary', async (_event, portNumber) => {
    const device = master.getDevice(portNumber);
    return device ? device.getAlarmSummary() : null;
  });

  ipcMain.handle('acknowledge-alarm', async (_event, portNumber, alarmIndex) => {
    const device = master.getDevice(portNumber);
    return device ? device.acknowledgeAlarm(alarmIndex) : false;
  });

  ipcMain.handle('acknowledge-all-alarms', async (_event, portNumber) => {
    const device = master.getDevice(portNumber);
    if (device) { device.acknowledgeAllAlarms(); return true; }
    return false;
  });

  ipcMain.handle('export-isdu', async (_event, portNumber, format) => {
    const device = master.getDevice(portNumber);
    if (!device) return { success: false, error: 'No device' };

    let content;
    let ext;
    if (format === 'json') {
      content = device.exportISDUAsJSON();
      ext = 'json';
    } else {
      content = device.exportISDUAsCSV();
      ext = 'csv';
    }

    const result = await dialog.showSaveDialog(mainWindow, {
      title: `Export ISDU Parameters (${format.toUpperCase()})`,
      defaultPath: `isdu_parameters_port${portNumber}.${ext}`,
      filters: [{ name: format.toUpperCase(), extensions: [ext] }],
    });

    if (result.canceled) return { success: false, canceled: true };

    try {
      fs.writeFileSync(result.filePath, content, 'utf8');
      return { success: true, path: result.filePath };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });
}

app.whenReady().then(() => {
  initMaster();
  registerIpcHandlers();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (master) {
    master.disconnect();
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
