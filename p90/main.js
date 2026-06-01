const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();

let mainWindow;
let db;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      enableBlinkFeatures: 'WebUSB'
    }
  });

  mainWindow.loadFile('index.html');

  mainWindow.webContents.session.on('select-usb-device', (event, details, callback) => {
    event.preventDefault();
    if (details.deviceList && details.deviceList.length > 0) {
      callback(details.deviceList[0].deviceId);
    }
  });

  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools();
  }
}

function initDatabase() {
  const dbPath = path.join(app.getPath('userData'), 'dna_samples.db');
  db = new sqlite3.Database(dbPath);
  
  db.run(`
    CREATE TABLE IF NOT EXISTS samples (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      sequence TEXT NOT NULL,
      quality_scores TEXT,
      signal_data TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

app.whenReady().then(() => {
  createWindow();
  initDatabase();

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

ipcMain.handle('save-sample', async (event, sample) => {
  return new Promise((resolve) => {
    db.run(
      'INSERT INTO samples (name, sequence, quality_scores, signal_data) VALUES (?, ?, ?, ?)',
      [sample.name, sample.sequence, JSON.stringify(sample.qualityScores), JSON.stringify(sample.signalData)],
      function(err) {
        if (err) {
          resolve({ success: false, error: err.message });
        } else {
          resolve({ success: true, id: this.lastID });
        }
      }
    );
  });
});

ipcMain.handle('get-samples', async () => {
  return new Promise((resolve) => {
    db.all('SELECT * FROM samples ORDER BY created_at DESC', [], (err, rows) => {
      if (err) {
        resolve({ success: false, error: err.message });
      } else {
        resolve({ success: true, samples: rows });
      }
    });
  });
});

ipcMain.handle('delete-sample', async (event, id) => {
  return new Promise((resolve) => {
    db.run('DELETE FROM samples WHERE id = ?', [id], (err) => {
      if (err) {
        resolve({ success: false, error: err.message });
      } else {
        resolve({ success: true });
      }
    });
  });
});

ipcMain.handle('export-fasta', async (event, sample) => {
  try {
    const { filePath } = await dialog.showSaveDialog(mainWindow, {
      filters: [{ name: 'FASTA Files', extensions: ['fasta', 'fa'] }],
      defaultPath: `${sample.name}.fasta`
    });

    if (filePath) {
      const fastaContent = `>${sample.name}\n${sample.sequence.match(/.{1,80}/g).join('\n')}\n`;
      fs.writeFileSync(filePath, fastaContent);
      return { success: true, path: filePath };
    }
    return { success: false, canceled: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('export-abi', async (event, data) => {
  try {
    const { filePath } = await dialog.showSaveDialog(mainWindow, {
      filters: [{ name: 'ABI Files', extensions: ['abi', 'json'] }],
      defaultPath: `${data.name}.abi.json`
    });

    if (filePath) {
      fs.writeFileSync(filePath, data.content);
      return { success: true, path: filePath };
    }
    return { success: false, canceled: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});
