const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  mainWindow.loadFile('index.html');
  mainWindow.webContents.openDevTools();
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

ipcMain.handle('select-dicom-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
    title: 'Select DICOM Series Folder'
  });
  
  if (!result.canceled && result.filePaths.length > 0) {
    const folderPath = result.filePaths[0];
    const files = fs.readdirSync(folderPath)
      .filter(f => f.toLowerCase().endsWith('.dcm') || !f.includes('.'))
      .map(f => path.join(folderPath, f));
    
    return { success: true, folderPath, files };
  }
  return { success: false };
});

ipcMain.handle('save-annotation', async (event, data) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Save Annotation',
    defaultPath: `annotation_${Date.now()}.json`,
    filters: [{ name: 'JSON', extensions: ['json'] }]
  });
  
  if (!result.canceled) {
    fs.writeFileSync(result.filePath, JSON.stringify(data, null, 2));
    return { success: true, path: result.filePath };
  }
  return { success: false };
});

ipcMain.handle('export-nifti', async (event, data) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Export NIfTI',
    defaultPath: `segmentation_${Date.now()}.nii.gz`,
    filters: [{ name: 'NIfTI', extensions: ['nii.gz', 'nii'] }]
  });
  
  if (!result.canceled) {
    return { success: true, path: result.filePath };
  }
  return { success: false };
});
