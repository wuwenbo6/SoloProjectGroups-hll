const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

let mainWindow;
let dbPath;

function initDatabase() {
  dbPath = path.join(app.getPath('userData'), 'radar_history.json');
  if (!fs.existsSync(dbPath)) {
    fs.writeFileSync(dbPath, JSON.stringify([]));
  }
}

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

app.whenReady().then(() => {
  initDatabase();
  createWindow();
  
  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});

function readDatabase() {
  const data = fs.readFileSync(dbPath, 'utf-8');
  return JSON.parse(data);
}

function writeDatabase(data) {
  fs.writeFileSync(dbPath, JSON.stringify(data, null, 2));
}

ipcMain.handle('process-radar', async (event, params) => {
  return new Promise((resolve, reject) => {
    const pythonProcess = spawn('python3', [
      path.join(__dirname, 'radar_processing.py')
    ]);
    
    let dataBuffer = '';
    
    pythonProcess.stdout.on('data', (data) => {
      dataBuffer += data.toString();
      if (dataBuffer.includes('\n')) {
        try {
          const result = JSON.parse(dataBuffer.trim());
          resolve(result);
        } catch (e) {
          reject(new Error('Failed to parse Python output: ' + e.message));
        }
      }
    });
    
    pythonProcess.stderr.on('data', (data) => {
      console.error('Python error:', data.toString());
    });
    
    pythonProcess.on('close', (code) => {
      if (code !== 0 && dataBuffer === '') {
        reject(new Error(`Python process exited with code ${code}`));
      }
    });
    
    pythonProcess.stdin.write(JSON.stringify(params) + '\n');
    pythonProcess.stdin.end();
  });
});

ipcMain.handle('save-measurement', async (event, data) => {
  const measurements = readDatabase();
  const newId = measurements.length > 0 ? Math.max(...measurements.map(m => m.id)) + 1 : 1;
  
  const newMeasurement = {
    id: newId,
    timestamp: new Date().toISOString(),
    bandwidth: data.bandwidth,
    sweep_time: data.sweep_time,
    sample_rate: data.sample_rate,
    true_distances: data.true_distances,
    true_rcs: data.true_rcs,
    peak_distances: data.peak_distances,
    peak_magnitudes: data.peak_magnitudes
  };
  
  measurements.unshift(newMeasurement);
  if (measurements.length > 50) {
    measurements.splice(50);
  }
  
  writeDatabase(measurements);
  return { id: newId };
});

ipcMain.handle('get-history', async () => {
  const measurements = readDatabase();
  return measurements.slice(0, 50);
});

ipcMain.handle('delete-measurement', async (event, id) => {
  let measurements = readDatabase();
  const initialLength = measurements.length;
  measurements = measurements.filter(m => m.id !== id);
  writeDatabase(measurements);
  return { success: measurements.length < initialLength };
});

ipcMain.handle('export-iq-csv', async (event, data) => {
  try {
    const { iq_data, params, filepath } = data;
    const { rx_real, rx_imag } = iq_data;
    const num_chirps = rx_real.length;
    const num_samples = rx_real[0].length;
    
    let csvContent = 'FMCW Radar IQ Data Export\\n';
    csvContent += `Bandwidth (MHz),${(params.bandwidth / 1e6).toFixed(2)}\\n`;
    csvContent += `Sweep Time (ms),${(params.sweep_time * 1000).toFixed(2)}\\n`;
    csvContent += `Sample Rate (MHz),${(params.sample_rate / 1e6).toFixed(2)}\\n`;
    csvContent += `Number of Chirps,${num_chirps}\\n`;
    csvContent += `Samples per Chirp,${num_samples}\\n\\n`;
    csvContent += 'Chirp,Sample,I,Q\\n';
    
    for (let chirp = 0; chirp < num_chirps; chirp++) {
      for (let sample = 0; sample < num_samples; sample++) {
        csvContent += `${chirp},${sample},${rx_real[chirp][sample]},${rx_imag[chirp][sample]}\\n`;
      }
    }
    
    fs.writeFileSync(filepath, csvContent);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('export-iq-json', async (event, data) => {
  try {
    const { filepath, content } = data;
    fs.writeFileSync(filepath, JSON.stringify(content, null, 2));
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('export-detections-csv', async (event, data) => {
  try {
    const { detections, true_targets, params, filepath } = data;
    
    let csvContent = 'FMCW Radar Detection Results\n';
    csvContent += `Timestamp,${new Date().toISOString()}\n`;
    csvContent += `Bandwidth (MHz),${(params.bandwidth / 1e6).toFixed(2)}\n`;
    csvContent += `Sweep Time (ms),${(params.sweep_time * 1000).toFixed(2)}\n`;
    csvContent += `Sample Rate (MHz),${(params.sample_rate / 1e6).toFixed(2)}\n\n`;
    
    csvContent += '=== True Targets ===\n';
    csvContent += 'Distance (m),Velocity (m/s),RCS\n';
    for (let i = 0; i < true_targets.distances.length; i++) {
      csvContent += `${true_targets.distances[i]},${true_targets.velocities[i]},${true_targets.rcs[i]}\n`;
    }
    
    csvContent += '\n=== Detected Targets ===\n';
    csvContent += 'Distance (m),Velocity (m/s),Power (dB)\n';
    for (const det of detections) {
      csvContent += `${det.range.toFixed(2)},${det.velocity.toFixed(2)},${det.power.toFixed(2)}\n`;
    }
    
    fs.writeFileSync(filepath, csvContent);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('show-save-dialog', async (event, options) => {
  const result = await dialog.showSaveDialog(mainWindow, options);
  return result;
});
