const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const { PythonShell } = require('python-shell');
const fs = require('fs');

let mainWindow;
let pythonShell;

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
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

ipcMain.handle('select-images', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: 'Images & Videos', extensions: ['jpg', 'jpeg', 'png', 'bmp', 'tiff', 'mp4', 'avi', 'mov', 'mkv'] },
      { name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'bmp', 'tiff'] },
      { name: 'Videos', extensions: ['mp4', 'avi', 'mov', 'mkv'] }
    ]
  });
  return result.filePaths;
});

ipcMain.handle('save-image', async (event, defaultPath) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    defaultPath: defaultPath || 'panorama.jpg',
    filters: [
      { name: 'JPEG', extensions: ['jpg', 'jpeg'] },
      { name: 'PNG', extensions: ['png'] }
    ]
  });
  return result.filePath;
});

ipcMain.handle('start-stitching', async (event, imagePaths) => {
  return new Promise((resolve, reject) => {
    const options = {
      mode: 'json',
      pythonPath: 'python3',
      scriptPath: __dirname,
      args: [JSON.stringify(imagePaths)]
    };

    pythonShell = new PythonShell('stitcher.py', options);

    pythonShell.on('message', (message) => {
      if (message.type === 'progress') {
        mainWindow.webContents.send('stitching-progress', message);
      } else if (message.type === 'result') {
        resolve(message.data);
      } else if (message.type === 'error') {
        reject(new Error(message.message));
      }
    });

    pythonShell.on('error', (error) => {
      reject(error);
    });

    pythonShell.end((err) => {
      if (err) {
        reject(err);
      }
    });
  });
});

ipcMain.handle('read-image-base64', async (event, imagePath) => {
  try {
    const imageBuffer = fs.readFileSync(imagePath);
    return imageBuffer.toString('base64');
  } catch (error) {
    throw error;
  }
});
