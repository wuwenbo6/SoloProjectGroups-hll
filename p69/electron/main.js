const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const { PythonShell } = require('python-shell');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      enableRemoteModule: true
    },
    icon: path.join(__dirname, '../assets/icon.png')
  });

  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));

  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
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

function runPythonScript(command, args) {
  return new Promise((resolve, reject) => {
    const options = {
      mode: 'text',
      pythonPath: 'python3',
      scriptPath: path.join(__dirname, '../python'),
      args: [command, ...args]
    };

    PythonShell.run('steganography.py', options, (err, results) => {
      if (err) {
        reject(err);
        return;
      }
      try {
        const result = JSON.parse(results[results.length - 1]);
        resolve(result);
      } catch (e) {
        resolve({ success: true, raw: results });
      }
    });
  });
}

function runDatabaseCommand(command, args) {
  return new Promise((resolve, reject) => {
    const options = {
      mode: 'text',
      pythonPath: 'python3',
      scriptPath: path.join(__dirname, '../python'),
      args: [command, ...args]
    };

    PythonShell.run('database.py', options, (err, results) => {
      if (err) {
        reject(err);
        return;
      }
      try {
        const result = JSON.parse(results[results.length - 1]);
        resolve(result);
      } catch (e) {
        resolve({ success: true, raw: results });
      }
    });
  });
}

ipcMain.handle('open-file-dialog', async (event, options) => {
  const result = await dialog.showOpenDialog(mainWindow, options);
  return result;
});

ipcMain.handle('save-file-dialog', async (event, options) => {
  const result = await dialog.showSaveDialog(mainWindow, options);
  return result;
});

ipcMain.handle('get-waveform', async (event, filePath) => {
  return await runPythonScript('get_waveform', [filePath]);
});

ipcMain.handle('get-spectrum', async (event, filePath) => {
  return await runPythonScript('get_spectrum', [filePath]);
});

ipcMain.handle('embed-image', async (event, audioPath, imagePath, outputPath) => {
  const result = await runPythonScript('embed', [audioPath, imagePath, outputPath]);
  
  if (result.success) {
    await runDatabaseCommand('add', [
      'embed',
      audioPath,
      imagePath,
      outputPath
    ]);
  }
  
  return result;
});

ipcMain.handle('extract-image', async (event, audioPath, outputImagePath) => {
  const result = await runPythonScript('extract', [audioPath, outputImagePath]);
  
  await runDatabaseCommand('add', [
    'extract',
    audioPath,
    '',
    result.success ? outputImagePath : ''
  ]);
  
  return result;
});

ipcMain.handle('robustness-test', async (event, audioPath, imagePath) => {
  return await runPythonScript('robustness_test', [audioPath, imagePath]);
});

ipcMain.handle('get-records', async (event, limit = 100) => {
  return await runDatabaseCommand('list', [limit.toString()]);
});

ipcMain.handle('search-records', async (event, keyword) => {
  return await runDatabaseCommand('search', [keyword || '']);
});

ipcMain.handle('delete-record', async (event, recordId) => {
  return await runDatabaseCommand('delete', [recordId.toString()]);
});
