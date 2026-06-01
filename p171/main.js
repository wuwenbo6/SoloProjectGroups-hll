const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const PDController = require('./pd-controller');

let mainWindow;
let pdController;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile('index.html');
  
  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on('closed', () => {
    if (pdController) {
      pdController.stopMonitoring();
    }
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  pdController = new PDController();
  setupIPC();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (pdController) {
    pdController.stopMonitoring();
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

function setupIPC() {
  ipcMain.handle('connect-device', async () => {
    try {
      const result = await pdController.connect();
      return { success: true, ...result };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('disconnect-device', async () => {
    try {
      await pdController.disconnect();
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('set-pps', async (event, voltage, current) => {
    try {
      const result = await pdController.setPPS(voltage, current);
      return { success: true, ...result };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('get-status', async () => {
    try {
      const status = pdController.getStatus();
      return { success: true, ...status };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('start-monitoring', async () => {
    try {
      pdController.startMonitoring((data) => {
        if (mainWindow) {
          mainWindow.webContents.send('monitoring-data', data);
        }
      });
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('stop-monitoring', async () => {
    try {
      pdController.stopMonitoring();
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('execute-curve', async (event, curvePoints) => {
    try {
      await pdController.executeCurve(curvePoints, (progress, data) => {
        if (mainWindow) {
          mainWindow.webContents.send('curve-progress', { progress, data });
        }
      });
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('stop-curve', async () => {
    try {
      pdController.stopCurve();
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('get-pps-capabilities', async () => {
    try {
      const capabilities = pdController.getPPSCapabilities();
      return { success: true, capabilities };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('run-load-transient-test', async (event, config) => {
    try {
      const result = await pdController.runLoadTransientTest(
        config,
        null,
        (progress) => {
          if (mainWindow) {
            mainWindow.webContents.send('load-test-progress', progress);
          }
        }
      );
      return { success: true, testData: result };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('run-ripple-test', async (event, config) => {
    try {
      const result = await pdController.runRippleTest(
        config,
        (sample) => {
          if (mainWindow) {
            mainWindow.webContents.send('ripple-sample', sample);
          }
        }
      );
      return { success: true, ...result };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('generate-report', async (event, type, testData, statistics) => {
    try {
      const report = pdController.generateTestReport(type, testData, statistics);
      return { success: true, report };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('save-report', async (event, report) => {
    try {
      const fs = require('fs');
      const { dialog } = require('electron');
      
      const filePath = await dialog.showSaveDialog(mainWindow, {
        title: '保存测试报告',
        defaultPath: `test-report-${Date.now()}.json`,
        filters: [
          { name: 'JSON', extensions: ['json'] },
          { name: 'CSV', extensions: ['csv'] }
        ]
      });

      if (filePath.canceled) {
        return { success: false, canceled: true };
      }

      if (filePath.filePath.endsWith('.csv')) {
        let csvContent = 'timestamp,voltage,current,power\n';
        if (report.testData && report.testData.samples) {
          report.testData.samples.forEach(sample => {
            csvContent += `${sample.timestamp},${sample.voltage},${sample.current},${sample.power}\n`;
          });
        }
        fs.writeFileSync(filePath.filePath, csvContent);
      } else {
        fs.writeFileSync(filePath.filePath, JSON.stringify(report, null, 2));
      }

      return { success: true, filePath: filePath.filePath };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });
}