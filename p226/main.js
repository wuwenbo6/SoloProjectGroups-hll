const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const ftpService = require('./ftpService');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 700,
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
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

ipcMain.handle('ftp-connect', async (event, config) => {
  try {
    await ftpService.connect(config);
    return { success: true, message: 'Connected successfully' };
  } catch (error) {
    return { success: false, message: error.message };
  }
});

ipcMain.handle('ftp-disconnect', async () => {
  try {
    await ftpService.disconnect();
    return { success: true, message: 'Disconnected successfully' };
  } catch (error) {
    return { success: false, message: error.message };
  }
});

ipcMain.handle('ftp-list', async (event, path) => {
  try {
    const list = await ftpService.list(path);
    return { success: true, data: list };
  } catch (error) {
    return { success: false, message: error.message };
  }
});

ipcMain.handle('ftp-upload', async (event, localPath, remotePath) => {
  try {
    const result = await ftpService.upload(localPath, remotePath, (progress) => {
      mainWindow.webContents.send('upload-progress', progress);
    });
    return { success: true, data: result };
  } catch (error) {
    return { success: false, message: error.message };
  }
});

ipcMain.handle('ftp-download', async (event, remotePath, localPath) => {
  try {
    const result = await ftpService.download(remotePath, localPath, (progress) => {
      mainWindow.webContents.send('download-progress', progress);
    });
    return { success: true, data: result };
  } catch (error) {
    return { success: false, message: error.message };
  }
});

ipcMain.handle('ftp-resume-upload', async (event, localPath, remotePath) => {
  try {
    const result = await ftpService.resumeUpload(localPath, remotePath, (progress) => {
      mainWindow.webContents.send('upload-progress', progress);
    });
    return { success: true, data: result };
  } catch (error) {
    return { success: false, message: error.message };
  }
});

ipcMain.handle('ftp-resume-download', async (event, remotePath, localPath) => {
  try {
    const result = await ftpService.resumeDownload(remotePath, localPath, (progress) => {
      mainWindow.webContents.send('download-progress', progress);
    });
    return { success: true, data: result };
  } catch (error) {
    return { success: false, message: error.message };
  }
});

ipcMain.handle('ftp-delete', async (event, remotePath) => {
  try {
    await ftpService.delete(remotePath);
    return { success: true, message: 'File deleted successfully' };
  } catch (error) {
    return { success: false, message: error.message };
  }
});

ipcMain.handle('ftp-mkdir', async (event, remotePath) => {
  try {
    await ftpService.mkdir(remotePath);
    return { success: true, message: 'Directory created successfully' };
  } catch (error) {
    return { success: false, message: error.message };
  }
});

ipcMain.handle('ftp-get-mtime', async (event, remotePath) => {
  try {
    const mtime = await ftpService.getRemoteMtime(remotePath);
    return { success: true, data: mtime };
  } catch (error) {
    return { success: false, message: error.message };
  }
});

ipcMain.handle('ftp-mirror-sync', async (event, localDir, remoteDir) => {
  try {
    const result = await ftpService.mirrorSync(localDir, remoteDir, (progress) => {
      mainWindow.webContents.send('mirror-progress', progress);
    }, (localPath, remotePath, direction) => {
      mainWindow.webContents.send('mirror-file-complete', { localPath, remotePath, direction });
    });
    return { success: true, data: result };
  } catch (error) {
    return { success: false, message: error.message };
  }
});
