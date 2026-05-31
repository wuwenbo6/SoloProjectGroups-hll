const { app, BrowserWindow, ipcMain } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const { io } = require('socket.io-client');

let mainWindow;
let pythonProcess;
let socket;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  mainWindow.loadFile('index.html');

  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools();
  }
}

function startPythonBackend() {
  const scriptPath = path.join(__dirname, 'backend', 'main.py');
  pythonProcess = spawn('python3', [scriptPath]);

  pythonProcess.stdout.on('data', (data) => {
    console.log(`Python stdout: ${data}`);
  });

  pythonProcess.stderr.on('data', (data) => {
    console.error(`Python stderr: ${data}`);
  });

  pythonProcess.on('close', (code) => {
    console.log(`Python process exited with code ${code}`);
  });
}

function connectToBackend() {
  socket = io('http://localhost:5000');

  socket.on('connect', () => {
    console.log('Connected to Python backend');
  });

  socket.on('pd_data', (data) => {
    if (mainWindow) {
      mainWindow.webContents.send('pd_data', data);
    }
  });

  socket.on('pps_analysis', (data) => {
    if (mainWindow) {
      mainWindow.webContents.send('pps_analysis', data);
    }
  });

  socket.on('device_status', (data) => {
    if (mainWindow) {
      mainWindow.webContents.send('device_status', data);
    }
  });

  socket.on('disconnect', () => {
    console.log('Disconnected from Python backend');
  });

  socket.on('port_changed', (data) => {
    if (mainWindow) {
      mainWindow.webContents.send('port_changed', data);
    }
  });

  socket.on('test_progress', (data) => {
    if (mainWindow) {
      mainWindow.webContents.send('test_progress', data);
    }
  });

  socket.on('test_complete', (data) => {
    if (mainWindow) {
      mainWindow.webContents.send('test_complete', data);
    }
  });
}

ipcMain.handle('start-capture', async () => {
  if (socket) {
    socket.emit('start_capture');
    return { success: true };
  }
  return { success: false, error: 'Not connected to backend' };
});

ipcMain.handle('stop-capture', async () => {
  if (socket) {
    socket.emit('stop_capture');
    return { success: true };
  }
  return { success: false, error: 'Not connected to backend' };
});

ipcMain.handle('set-voltage', async (event, voltage) => {
  if (socket) {
    socket.emit('set_voltage', { voltage });
    return { success: true };
  }
  return { success: false, error: 'Not connected to backend' };
});

ipcMain.handle('connect-device', async () => {
  if (socket) {
    socket.emit('connect_device');
    return { success: true };
  }
  return { success: false, error: 'Not connected to backend' };
});

ipcMain.handle('export-report', async (event, format) => {
  if (socket) {
    return new Promise((resolve) => {
      socket.emit('export_report', { format: format });
      socket.once('report_exported', (data) => {
        resolve({ success: true, path: data.path });
      });
    });
  }
  return { success: false, error: 'Not connected to backend' };
});

ipcMain.handle('get-pdos', async () => {
  if (socket) {
    return new Promise((resolve) => {
      socket.emit('get_pdos');
      socket.once('pdos_list', (data) => {
        resolve({ success: true, pdos: data.pdos });
      });
    });
  }
  return { success: false, error: 'Not connected to backend' };
});

ipcMain.handle('select-port', async (event, portIndex) => {
  if (socket) {
    return new Promise((resolve) => {
      socket.emit('select_port', { port_index: portIndex });
      socket.once('select_port_response', (data) => {
        resolve(data);
      });
    });
  }
  return { success: false, error: 'Not connected to backend' };
});

ipcMain.handle('set-polling', async (event, enabled, interval) => {
  if (socket) {
    return new Promise((resolve) => {
      socket.emit('set_polling', { enabled, interval });
      socket.once('set_polling_response', (data) => {
        resolve(data);
      });
    });
  }
  return { success: false, error: 'Not connected to backend' };
});

ipcMain.handle('get-ports-status', async () => {
  if (socket) {
    return new Promise((resolve) => {
      socket.emit('get_ports_status');
      socket.once('get_ports_status_response', (data) => {
        resolve(data);
      });
    });
  }
  return { success: false, error: 'Not connected to backend' };
});

ipcMain.handle('start-compliance-test', async () => {
  if (socket) {
    return new Promise((resolve) => {
      socket.emit('start_compliance_test');
      socket.once('start_compliance_test_response', (data) => {
        resolve(data);
      });
    });
  }
  return { success: false, error: 'Not connected to backend' };
});

ipcMain.handle('stop-compliance-test', async () => {
  if (socket) {
    return new Promise((resolve) => {
      socket.emit('stop_compliance_test');
      socket.once('stop_compliance_test_response', (data) => {
        resolve(data);
      });
    });
  }
  return { success: false, error: 'Not connected to backend' };
});

ipcMain.handle('get-test-summary', async () => {
  if (socket) {
    return new Promise((resolve) => {
      socket.emit('get_test_summary');
      socket.once('get_test_summary_response', (data) => {
        resolve(data);
      });
    });
  }
  return { success: false, error: 'Not connected to backend' };
});

ipcMain.handle('export-waveform-csv', async () => {
  if (socket) {
    return new Promise((resolve) => {
      socket.emit('export_waveform_csv');
      socket.once('waveform_exported', (data) => {
        resolve(data);
      });
    });
  }
  return { success: false, error: 'Not connected to backend' };
});

app.whenReady().then(() => {
  createWindow();
  startPythonBackend();
  
  setTimeout(() => {
    connectToBackend();
  }, 2000);

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

app.on('before-quit', () => {
  if (pythonProcess) {
    pythonProcess.kill();
  }
});
