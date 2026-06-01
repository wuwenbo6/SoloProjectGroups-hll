const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const { PythonShell } = require('python-shell');

let mainWindow;
let pythonShell;
let pythonResponseHandlers = new Map();
let requestIdCounter = 0;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      enableRemoteModule: true
    },
    icon: path.join(__dirname, '..', 'assets', 'icon.png')
  });

  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));

  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function startPythonBackend() {
  const pythonPath = 'python3';
  const scriptPath = path.join(__dirname, '..', '..', 'python', 'main.py');

  pythonShell = new PythonShell(scriptPath, {
    pythonPath: pythonPath,
    mode: 'text'
  });

  pythonShell.on('message', (message) => {
    try {
      const response = JSON.parse(message);
      const requestId = response._requestId;
      if (requestId && pythonResponseHandlers.has(requestId)) {
        const handler = pythonResponseHandlers.get(requestId);
        pythonResponseHandlers.delete(requestId);
        if (response.success) {
          handler.resolve(response);
        } else {
          handler.reject(new Error(response.error || 'Unknown error'));
        }
      }
    } catch (e) {
      console.error('Failed to parse Python response:', e);
    }
  });

  pythonShell.on('error', (error) => {
    console.error('Python shell error:', error);
  });

  pythonShell.end((err) => {
    if (err) {
      console.error('Python shell ended with error:', err);
    }
  });
}

function sendToPython(command, data = {}) {
  return new Promise((resolve, reject) => {
    if (!pythonShell) {
      reject(new Error('Python backend not started'));
      return;
    }

    const requestId = ++requestIdCounter;
    const request = {
      _requestId: requestId,
      command,
      data
    };

    pythonResponseHandlers.set(requestId, { resolve, reject });
    pythonShell.send(JSON.stringify(request));

    setTimeout(() => {
      if (pythonResponseHandlers.has(requestId)) {
        pythonResponseHandlers.delete(requestId);
        reject(new Error('Request timeout'));
      }
    }, 30000);
  });
}

app.whenReady().then(() => {
  createWindow();
  startPythonBackend();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (pythonShell) {
    pythonShell.end();
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

ipcMain.handle('create-project', async (event, data) => {
  return sendToPython('create_project', data);
});

ipcMain.handle('get-projects', async () => {
  return sendToPython('get_projects');
});

ipcMain.handle('delete-project', async (event, data) => {
  return sendToPython('delete_project', data);
});

ipcMain.handle('select-project', async (event, data) => {
  return sendToPython('select_project', data);
});

ipcMain.handle('start-capture', async (event, data) => {
  return sendToPython('start_capture', data);
});

ipcMain.handle('stop-capture', async () => {
  return sendToPython('stop_capture');
});

ipcMain.handle('get-messages', async (event, data) => {
  return sendToPython('get_messages', data);
});

ipcMain.handle('analyze-signals', async (event, data) => {
  return sendToPython('analyze_signals', data);
});

ipcMain.handle('get-signals', async (event, data) => {
  return sendToPython('get_signals', data);
});

ipcMain.handle('add-manual-signal', async (event, data) => {
  return sendToPython('add_manual_signal', data);
});

ipcMain.handle('update-signal', async (event, data) => {
  return sendToPython('update_signal', data);
});

ipcMain.handle('delete-signal', async (event, data) => {
  return sendToPython('delete_signal', data);
});

ipcMain.handle('generate-dbc', async (event, data) => {
  return sendToPython('generate_dbc', data);
});

ipcMain.handle('get-dbc-files', async () => {
  return sendToPython('get_dbc_files');
});

ipcMain.handle('get-signal-values', async (event, data) => {
  return sendToPython('get_signal_values', data);
});

ipcMain.handle('save-file-dialog', async (event, data) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    title: data.title || 'Save File',
    defaultPath: data.defaultPath || 'file.dbc',
    filters: data.filters || [{ name: 'All Files', extensions: ['*'] }]
  });
  return result;
});

ipcMain.handle('connect-canoe', async (event, data) => {
  return sendToPython('connect_canoe', data);
});

ipcMain.handle('disconnect-canoe', async () => {
  return sendToPython('disconnect_canoe');
});

ipcMain.handle('start-canoe', async (event, data) => {
  return sendToPython('start_canoe', data);
});

ipcMain.handle('stop-canoe', async () => {
  return sendToPython('stop_canoe');
});

ipcMain.handle('get-canoe-signals', async () => {
  return sendToPython('get_canoe_signals');
});

ipcMain.handle('add-trigger', async (event, data) => {
  return sendToPython('add_trigger', data);
});

ipcMain.handle('remove-trigger', async (event, data) => {
  return sendToPython('remove_trigger', data);
});

ipcMain.handle('get-triggers', async () => {
  return sendToPython('get_triggers');
});

ipcMain.handle('start-trigger-recording', async () => {
  return sendToPython('start_trigger_recording');
});

ipcMain.handle('stop-trigger-recording', async () => {
  return sendToPython('stop_trigger_recording');
});

ipcMain.handle('export-excel', async (event, data) => {
  return sendToPython('export_excel', data);
});
