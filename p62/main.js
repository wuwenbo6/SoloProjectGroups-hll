const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 700,
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

ipcMain.handle('save-srt', async (event, subtitles, language) => {
  try {
    const { filePath } = await dialog.showSaveDialog(mainWindow, {
      title: '保存字幕文件',
      defaultPath: `subtitle_${language}_${Date.now()}.srt`,
      filters: [{ name: 'SRT Files', extensions: ['srt'] }]
    });

    if (filePath) {
      fs.writeFileSync(filePath, subtitles, 'utf-8');
      return { success: true, path: filePath };
    }
    return { success: false, cancelled: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('select-model-path', async (event, type) => {
  try {
    const { filePaths } = await dialog.showOpenDialog(mainWindow, {
      title: `选择${type === 'english' ? '英文' : '中文'}模型文件`,
      filters: [{ name: 'Model Files', extensions: ['pbmm'] }],
      properties: ['openFile']
    });

    if (filePaths && filePaths.length > 0) {
      return { success: true, path: filePaths[0] };
    }
    return { success: false, cancelled: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('select-scorer-path', async (event, type) => {
  try {
    const { filePaths } = await dialog.showOpenDialog(mainWindow, {
      title: `选择${type === 'english' ? '英文' : '中文'}Scorer文件`,
      filters: [{ name: 'Scorer Files', extensions: ['scorer'] }],
      properties: ['openFile']
    });

    if (filePaths && filePaths.length > 0) {
      return { success: true, path: filePaths[0] };
    }
    return { success: false, cancelled: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});
