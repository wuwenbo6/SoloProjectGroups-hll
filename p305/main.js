const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { parseGerber } = require('./src/parser/gerberParser');
const { runDRC } = require('./src/drc/drcEngine');
const { saveReportPdf } = require('./src/pdf/reportGenerator');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    title: 'SiP Gerber DRC Checker',
  });

  mainWindow.loadFile(path.join(__dirname, 'src', 'renderer', 'index.html'));
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  app.quit();
});

ipcMain.handle('open-files', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: 'Gerber Files', extensions: ['gbr', 'gtl', 'gbl', 'gts', 'gbs', 'gto', 'gbo', 'gko', 'gml', 'gm1', 'txt', 'drl', 'ger', 'pho'] }],
  });
  if (result.canceled) return null;
  return result.filePaths;
});

ipcMain.handle('parse-gerber', async (_event, filePath) => {
  const content = fs.readFileSync(filePath, 'utf-8');
  return parseGerber(content);
});

ipcMain.handle('run-drc', async (_event, { parsedData, rules }) => {
  return runDRC(parsedData, rules);
});

ipcMain.handle('save-pdf-report', async (_event, reportData) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    title: '导出 DRC 报告',
    defaultPath: `drc_report_${Date.now()}.pdf`,
    filters: [{ name: 'PDF 文件', extensions: ['pdf'] }],
  });

  if (result.canceled) return false;

  try {
    saveReportPdf(result.filePath, reportData);
    return true;
  } catch (err) {
    console.error('PDF export error:', err);
    return false;
  }
});
