const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const { NTFSParser } = require('./ntfs-parser');
const { SignatureScanner } = require('./signature-scanner');
const { RecoveryAnalyzer } = require('./recovery-analyzer');
const { FilePreview } = require('./file-preview');
const { ReportExporter } = require('./report-exporter');

let mainWindow = null;
let parser = null;
let scanner = null;
let analyzer = null;
let lastAnalysis = null;
let lastSignatureResults = [];

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: 'NTFS Recovery Tool',
    backgroundColor: '#0f172a',
    webPreferences: {
      preload: path.join(__dirname, '..', '..', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

ipcMain.handle('open-file-dialog', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [{ name: 'Disk Images', extensions: ['dd', 'img', 'raw'] }],
  });
  if (result.canceled) return null;
  return result.filePaths[0];
});

ipcMain.handle('load-image', async (_event, filePath) => {
  try {
    parser = new NTFSParser(filePath);
    const bootSector = parser.parseBootSector();
    return { success: true, bootSector };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('parse-mft', async (_event, options) => {
  try {
    if (!parser) throw new Error('No image loaded');
    const entries = await parser.parseMFT(options, (progress) => {
      mainWindow.webContents.send('mft-progress', progress);
    });
    return { success: true, entries };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('scan-signatures', async (_event, options) => {
  try {
    if (!parser) throw new Error('No image loaded');
    scanner = new SignatureScanner(parser);
    const results = await scanner.scan(options, (progress) => {
      mainWindow.webContents.send('scan-progress', progress);
    });
    return { success: true, results };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('analyze-recovery', async (_event, entries) => {
  try {
    if (!parser) throw new Error('No image loaded');
    analyzer = new RecoveryAnalyzer(parser);
    const analysis = analyzer.analyze(entries);
    return { success: true, analysis };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('recover-file', async (_event, entry, outputPath) => {
  try {
    if (!parser) throw new Error('No image loaded');
    const data = await parser.readFileData(entry);
    require('fs').writeFileSync(outputPath, data);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('save-file-dialog', async () => {
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Save Recovered File',
  });
  if (result.canceled) return null;
  return result.filePath;
});

ipcMain.handle('get-file-preview', async (_event, entry) => {
  try {
    if (!parser) throw new Error('No image loaded');
    const data = await parser.readFileData(entry);
    const preview = FilePreview.generatePreview(data, entry.fileName || '');
    return { success: true, preview };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('export-csv-report', async (_event, entries, outputPath) => {
  try {
    const result = ReportExporter.exportCSV(entries, outputPath);
    return result;
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('export-signature-report', async (_event, results, outputPath) => {
  try {
    const result = ReportExporter.exportSignatureResults(results, outputPath);
    return result;
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('export-full-report', async (_event, analysis, signatures, outputPath) => {
  try {
    const result = ReportExporter.exportFullReport(analysis, signatures, outputPath);
    return result;
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('save-csv-dialog', async (_event, defaultName) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Export Report',
    defaultPath: defaultName || 'recovery_report.csv',
    filters: [
      { name: 'CSV Files', extensions: ['csv'] },
      { name: 'Text Files', extensions: ['txt'] },
      { name: 'All Files', extensions: ['*'] },
    ],
  });
  if (result.canceled) return null;
  return result.filePath;
});
