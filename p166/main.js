const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const fs = require('fs');
const path = require('path');

const CHUNK_SIZE = 10 * 1024 * 1024;

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
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});

ipcMain.handle('open-file-dialog', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [
      { name: 'CSV Files', extensions: ['csv'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  });

  if (!result.canceled && result.filePaths.length > 0) {
    const filePath = result.filePaths[0];
    try {
      const stats = fs.statSync(filePath);
      return {
        success: true,
        filePath: filePath,
        fileName: path.basename(filePath),
        fileSize: stats.size
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }
  return { success: false, canceled: true };
});

ipcMain.handle('read-file-chunk', async (event, { filePath, start, length }) => {
  return new Promise((resolve, reject) => {
    const buffer = Buffer.alloc(length);
    fs.open(filePath, 'r', (err, fd) => {
      if (err) {
        reject({ success: false, error: err.message });
        return;
      }
      
      fs.read(fd, buffer, 0, length, start, (err, bytesRead, buffer) => {
        fs.close(fd, (closeErr) => {
          if (closeErr) {
            console.error('Error closing file:', closeErr);
          }
          
          if (err) {
            reject({ success: false, error: err.message });
            return;
          }
          
          resolve({
            success: true,
            data: buffer.toString('utf-8', 0, bytesRead),
            bytesRead: bytesRead,
            isLastChunk: bytesRead < length
          });
        });
      });
    });
  });
});

ipcMain.handle('read-entire-file', async (event, filePath) => {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    return {
      success: true,
      content: content
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
});

ipcMain.handle('count-file-lines', async (event, filePath) => {
  return new Promise((resolve, reject) => {
    let lineCount = 0;
    const stream = fs.createReadStream(filePath, { encoding: 'utf-8' });
    
    stream.on('data', (chunk) => {
      const lines = chunk.split('\n');
      lineCount += lines.length - 1;
    });
    
    stream.on('end', () => {
      resolve({
        success: true,
        lineCount: lineCount + 1
      });
    });
    
    stream.on('error', (err) => {
      reject({
        success: false,
        error: err.message
      });
    });
  });
});

ipcMain.handle('read-sample-file', async () => {
  const samplePath = path.join(__dirname, 'sample-i3c-data.csv');
  try {
    const content = fs.readFileSync(samplePath, 'utf-8');
    return {
      success: true,
      fileName: 'sample-i3c-data.csv',
      content: content
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
});

module.exports = {
  CHUNK_SIZE
};
