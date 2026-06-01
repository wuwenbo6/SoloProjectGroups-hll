const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { RadioController } = require('./src/radioController');

let mainWindow;
let radioController;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 900,
    minWidth: 900,
    minHeight: 700,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    icon: path.join(__dirname, 'public', 'icon.png'),
    title: 'FM Radio Player'
  });

  mainWindow.loadFile(path.join(__dirname, 'public', 'index.html'));

  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

async function initRadioController() {
  radioController = new RadioController();
  
  radioController.on('started', (data) => {
    if (mainWindow) {
      mainWindow.webContents.send('radio:started', data);
    }
  });

  radioController.on('stopped', () => {
    if (mainWindow) {
      mainWindow.webContents.send('radio:stopped');
    }
  });

  radioController.on('stationName', (name) => {
    if (mainWindow) {
      mainWindow.webContents.send('radio:stationName', name);
    }
  });

  radioController.on('programType', (type) => {
    if (mainWindow) {
      mainWindow.webContents.send('radio:programType', type);
    }
  });

  radioController.on('radioText', (text) => {
    if (mainWindow) {
      mainWindow.webContents.send('radio:radioText', text);
    }
  });

  radioController.on('metadata', (metadata) => {
    if (mainWindow) {
      mainWindow.webContents.send('radio:metadata', metadata);
    }
  });

  radioController.on('signalDetected', (data) => {
    if (mainWindow) {
      mainWindow.webContents.send('radio:signalDetected', data);
    }
  });

  radioController.on('silenceDetected', (data) => {
    if (mainWindow) {
      mainWindow.webContents.send('radio:silenceDetected', data);
    }
  });

  radioController.on('spectrumData', (data) => {
    if (mainWindow) {
      mainWindow.webContents.send('spectrum:data', data);
    }
  });

  radioController.on('recordStarted', (data) => {
    if (mainWindow) {
      mainWindow.webContents.send('record:started', data);
    }
  });

  radioController.on('recordStopped', (data) => {
    if (mainWindow) {
      mainWindow.webContents.send('record:stopped', data);
    }
  });

  radioController.on('recordPaused', () => {
    if (mainWindow) {
      mainWindow.webContents.send('record:paused');
    }
  });

  radioController.on('recordResumed', () => {
    if (mainWindow) {
      mainWindow.webContents.send('record:resumed');
    }
  });

  radioController.on('recordProgress', (data) => {
    if (mainWindow) {
      mainWindow.webContents.send('record:progress', data);
    }
  });

  radioController.on('timerStarted', (data) => {
    if (mainWindow) {
      mainWindow.webContents.send('timer:started', data);
    }
  });

  radioController.on('timerStopped', () => {
    if (mainWindow) {
      mainWindow.webContents.send('timer:stopped');
    }
  });

  radioController.on('timerTick', (data) => {
    if (mainWindow) {
      mainWindow.webContents.send('timer:tick', data);
    }
  });

  radioController.on('scanProgress', (progress) => {
    if (mainWindow) {
      mainWindow.webContents.send('scan:progress', progress);
    }
  });

  radioController.on('stationFound', (station) => {
    if (mainWindow) {
      mainWindow.webContents.send('scan:stationFound', station);
    }
  });

  radioController.on('scanComplete', (stations) => {
    if (mainWindow) {
      mainWindow.webContents.send('scan:complete', stations);
    }
  });

  await radioController.init();
}

app.whenReady().then(async () => {
  await initRadioController();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', async () => {
  if (radioController) {
    await radioController.shutdown();
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

ipcMain.handle('radio:start', async (event, frequency, options) => {
  try {
    const result = await radioController.startRadio(frequency, options);
    return { success: true, ...result };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('radio:stop', async () => {
  radioController.stopRadio();
  return { success: true };
});

ipcMain.handle('radio:status', () => {
  return radioController.getStatus();
});

ipcMain.handle('radio:streamUrl', () => {
  return radioController.getStreamUrl();
});

ipcMain.handle('radio:signalLevel', () => {
  return radioController.getSignalLevel();
});

ipcMain.handle('radio:isSilent', () => {
  return radioController.getIsSilent();
});

ipcMain.handle('radio:rdsStats', () => {
  return radioController.getRDSStats();
});

ipcMain.handle('radio:setNoiseThreshold', (event, threshold) => {
  radioController.setNoiseThreshold(threshold);
  return { success: true };
});

ipcMain.handle('record:start', async (event, options) => {
  try {
    const result = await radioController.startRecording(options);
    return { success: true, ...result };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('record:pause', () => {
  radioController.pauseRecording();
  return { success: true };
});

ipcMain.handle('record:resume', () => {
  radioController.resumeRecording();
  return { success: true };
});

ipcMain.handle('record:stop', async () => {
  try {
    const result = await radioController.stopRecording();
    return { success: true, ...result };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('record:status', () => {
  return radioController.getRecordingStatus();
});

ipcMain.handle('record:list', async () => {
  try {
    const recordings = await radioController.getRecordingsList();
    return { success: true, recordings };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('record:delete', async (event, filePath) => {
  try {
    await radioController.deleteRecording(filePath);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('record:setOutputDir', (event, dir) => {
  radioController.setRecordingOutputDir(dir);
  return { success: true };
});

ipcMain.handle('record:getOutputDir', () => {
  return radioController.getRecordingOutputDir();
});

ipcMain.handle('record:getTimerPresets', () => {
  return radioController.getTimerPresets();
});

ipcMain.handle('record:startTimer', async (event, durationSeconds, options) => {
  try {
    const result = await radioController.startTimerRecording(durationSeconds, options);
    return { success: true, ...result };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('record:stopTimer', async () => {
  try {
    const result = await radioController.stopTimerRecording();
    return { success: true, ...result };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('dialog:selectOutputDir', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory', 'createDirectory'],
    title: '选择录音保存目录'
  });
  
  if (!result.canceled && result.filePaths.length > 0) {
    return { success: true, path: result.filePaths[0] };
  }
  return { success: false, canceled: true };
});

ipcMain.handle('dialog:saveFile', async (event, defaultPath) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    defaultPath: defaultPath || 'recording.mp3',
    filters: [
      { name: 'MP3 Audio', extensions: ['mp3'] },
      { name: 'WAV Audio', extensions: ['wav'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  });
  
  if (!result.canceled) {
    return { success: true, path: result.filePath };
  }
  return { success: false, canceled: true };
});

ipcMain.handle('file:copy', async (event, sourcePath, destPath) => {
  return new Promise((resolve) => {
    fs.copyFile(sourcePath, destPath, (err) => {
      if (err) {
        resolve({ success: false, error: err.message });
      } else {
        resolve({ success: true });
      }
    });
  });
});

ipcMain.handle('scan:start', async (event, startFreq, endFreq, step) => {
  try {
    radioController.startScan(startFreq, endFreq, step);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('scan:stop', () => {
  radioController.stopScan();
  return { success: true };
});

ipcMain.handle('scan:isScanning', () => {
  return radioController.isScanning();
});
