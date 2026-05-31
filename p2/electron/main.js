const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const axios = require('axios');

let mainWindow;
let pythonProcess;
const PYTHON_SERVER_URL = 'http://localhost:5001';

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

  mainWindow.loadFile(path.join(__dirname, '../frontend/index.html'));
  mainWindow.webContents.openDevTools();
}

function startPythonServer() {
  const pythonScript = path.join(__dirname, '../backend/server.py');
  pythonProcess = spawn('python', [pythonScript]);

  pythonProcess.stdout.on('data', (data) => {
    console.log(`Python Server: ${data}`);
  });

  pythonProcess.stderr.on('data', (data) => {
    console.error(`Python Server Error: ${data}`);
  });

  pythonProcess.on('close', (code) => {
    console.log(`Python Server exited with code ${code}`);
  });
}

app.whenReady().then(() => {
  startPythonServer();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (pythonProcess) {
    pythonProcess.kill();
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

ipcMain.handle('open-image', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'bmp', 'tiff'] }]
  });
  return result.filePaths[0];
});

ipcMain.handle('recognize-text', async (event, imageData, x, y, width, height) => {
  try {
    const response = await axios.post(`${PYTHON_SERVER_URL}/recognize`, {
      image_data: imageData,
      x: x,
      y: y,
      width: width,
      height: height
    });
    return response.data;
  } catch (error) {
    console.error('Recognition error:', error);
    throw error;
  }
});

ipcMain.handle('compare-versions', async (event, texts) => {
  try {
    const response = await axios.post(`${PYTHON_SERVER_URL}/compare`, {
      texts: texts
    });
    return response.data;
  } catch (error) {
    console.error('Comparison error:', error);
    throw error;
  }
});

ipcMain.handle('save-collation', async (event, collationData) => {
  try {
    const response = await axios.post(`${PYTHON_SERVER_URL}/collation/save`, collationData);
    return response.data;
  } catch (error) {
    console.error('Save collation error:', error);
    throw error;
  }
});

ipcMain.handle('get-collations', async () => {
  try {
    const response = await axios.get(`${PYTHON_SERVER_URL}/collation/list`);
    return response.data;
  } catch (error) {
    console.error('Get collations error:', error);
    throw error;
  }
});

ipcMain.handle('export-collation', async (event, collationId, format) => {
  try {
    let url = `${PYTHON_SERVER_URL}/collation/export/${collationId}`;
    let params = { format: format };
    
    if (format === 'tex') {
      url = `${PYTHON_SERVER_URL}/collation/export/${collationId}/latex`;
      params = {};
    }
    
    const response = await axios.get(url, {
      params: params,
      responseType: 'blob'
    });
    
    const ext = format === 'tex' ? 'tex' : format;
    const result = await dialog.showSaveDialog(mainWindow, {
      defaultPath: `collation_${collationId}.${ext}`,
      filters: [
        { name: 'Text', extensions: ['txt'] },
        { name: 'JSON', extensions: ['json'] },
        { name: 'HTML', extensions: ['html'] },
        { name: 'LaTeX', extensions: ['tex'] }
      ]
    });

    if (!result.canceled) {
      const fs = require('fs');
      fs.writeFileSync(result.filePath, response.data);
      return { success: true, path: result.filePath };
    }
    return { success: false };
  } catch (error) {
    console.error('Export collation error:', error);
    throw error;
  }
});
