const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const winston = require('winston');

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.printf(({ timestamp, level, message }) => {
      return `[${timestamp}] [${level.toUpperCase()}] ${message}`;
    })
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ 
      filename: path.join(app.getPath('userData'), 'logs', 'app.log'),
      maxsize: 5 * 1024 * 1024,
      maxFiles: 5
    })
  ]
});

const logsDir = path.join(app.getPath('userData'), 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

let mainWindow;

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

  mainWindow.loadFile('index.html');

  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  logger.info('Application started');
}

app.whenReady().then(() => {
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});

ipcMain.on('log', (event, level, message) => {
  logger.log(level, message);
});

ipcMain.handle('export-csv', async (event, data) => {
  try {
    const { filePath } = await dialog.showSaveDialog(mainWindow, {
      title: '导出CSV文件',
      defaultPath: `load_test_${new Date().toISOString().slice(0, 10)}.csv`,
      filters: [{ name: 'CSV Files', extensions: ['csv'] }]
    });

    if (!filePath) return { success: false, canceled: true };

    const csvContent = generateCSV(data);
    fs.writeFileSync(filePath, csvContent, 'utf8');
    
    logger.info(`CSV exported to: ${filePath}`);
    return { success: true, path: filePath };
  } catch (error) {
    logger.error(`CSV export failed: ${error.message}`);
    return { success: false, error: error.message };
  }
});

function generateCSV(data) {
  const headers = ['Timestamp', 'Voltage (V)', 'Current (A)', 'Power (W)', 'Mode'];
  const rows = data.map(row => {
    return [
      row.timestamp,
      row.voltage.toFixed(4),
      row.current.toFixed(4),
      row.power.toFixed(4),
      row.mode
    ].join(',');
  });
  return [headers.join(','), ...rows].join('\n');
}

ipcMain.on('get-log-path', (event) => {
  event.returnValue = path.join(app.getPath('userData'), 'logs');
});

ipcMain.handle('save-sequence', async (event, sequence) => {
  try {
    const { filePath } = await dialog.showSaveDialog(mainWindow, {
      title: '保存测试序列',
      defaultPath: 'sequence.json',
      filters: [{ name: 'JSON Files', extensions: ['json'] }]
    });

    if (!filePath) return { success: false, canceled: true };

    fs.writeFileSync(filePath, JSON.stringify(sequence, null, 2), 'utf8');
    logger.info(`Sequence saved to: ${filePath}`);
    return { success: true, path: filePath };
  } catch (error) {
    logger.error(`Save sequence failed: ${error.message}`);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('load-sequence', async () => {
  try {
    const { filePaths } = await dialog.showOpenDialog(mainWindow, {
      title: '加载测试序列',
      filters: [{ name: 'JSON Files', extensions: ['json'] }],
      properties: ['openFile']
    });

    if (!filePaths || filePaths.length === 0) return { success: false, canceled: true };

    const content = fs.readFileSync(filePaths[0], 'utf8');
    const sequence = JSON.parse(content);
    logger.info(`Sequence loaded from: ${filePaths[0]}`);
    return { success: true, sequence };
  } catch (error) {
    logger.error(`Load sequence failed: ${error.message}`);
    return { success: false, error: error.message };
  }
});
