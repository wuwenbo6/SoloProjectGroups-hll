const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const express = require('express');
const bodyParser = require('body-parser');
const sqlite3 = require('sqlite3').verbose();

let mainWindow;
let pythonProcess;
let expressApp;
let expressServer;

function initDatabase() {
  const dbPath = path.join(app.getPath('userData'), 'presets.db');
  const db = new sqlite3.Database(dbPath);
  
  db.run(`
    CREATE TABLE IF NOT EXISTS presets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      style TEXT NOT NULL,
      chord_progression TEXT NOT NULL,
      bpm INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  return db;
}

function startPythonBackend() {
  return new Promise((resolve, reject) => {
    const pythonPath = 'python3';
    const scriptPath = path.join(__dirname, 'backend', 'app.py');
    
    pythonProcess = spawn(pythonPath, [scriptPath], {
      cwd: path.join(__dirname, 'backend')
    });
    
    pythonProcess.stdout.on('data', (data) => {
      console.log(`Python: ${data}`);
      if (data.toString().includes('Running on')) {
        resolve();
      }
    });
    
    pythonProcess.stderr.on('data', (data) => {
      console.error(`Python Error: ${data}`);
    });
    
    pythonProcess.on('close', (code) => {
      console.log(`Python process exited with code ${code}`);
    });
    
    setTimeout(resolve, 3000);
  });
}

function startExpressServer() {
  expressApp = express();
  expressApp.use(bodyParser.json());
  
  const db = initDatabase();
  
  expressApp.get('/api/presets', (req, res) => {
    db.all('SELECT * FROM presets ORDER BY created_at DESC', (err, rows) => {
      if (err) {
        res.status(500).json({ error: err.message });
      } else {
        res.json(rows);
      }
    });
  });
  
  expressApp.post('/api/presets', (req, res) => {
    const { name, style, chord_progression, bpm } = req.body;
    db.run(
      'INSERT INTO presets (name, style, chord_progression, bpm) VALUES (?, ?, ?, ?)',
      [name, style, chord_progression, bpm],
      function(err) {
        if (err) {
          res.status(500).json({ error: err.message });
        } else {
          res.json({ id: this.lastID });
        }
      }
    );
  });
  
  expressApp.delete('/api/presets/:id', (req, res) => {
    db.run('DELETE FROM presets WHERE id = ?', [req.params.id], (err) => {
      if (err) {
        res.status(500).json({ error: err.message });
      } else {
        res.json({ success: true });
      }
    });
  });
  
  expressServer = expressApp.listen(3001, () => {
    console.log('Express server running on port 3001');
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });
  
  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  
  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools();
  }
}

app.whenReady().then(async () => {
  startExpressServer();
  await startPythonBackend();
  createWindow();
  
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (pythonProcess) pythonProcess.kill();
  if (expressServer) expressServer.close();
  if (process.platform !== 'darwin') app.quit();
});

ipcMain.handle('export-midi', async (event, midiData) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    filters: [{ name: 'MIDI Files', extensions: ['mid'] }],
    defaultPath: 'accompaniment.mid'
  });
  
  if (!result.canceled && result.filePath) {
    fs.writeFileSync(result.filePath, Buffer.from(midiData, 'base64'));
    return { success: true, path: result.filePath };
  }
  return { success: false };
});

function createSingleTrackMidi(events, program, bpm, isDrum = false) {
  const midi = new MidiWriter.Writer();
  const track = new MidiWriter.Track();
  
  track.setTempo(bpm);
  track.addEvent(new MidiWriter.ProgramChangeEvent({ instrument: program, channel: isDrum ? 9 : 0 }));
  
  const sortedEvents = [...events].sort((a, b) => a.time - b.time);
  
  sortedEvents.forEach(event => {
    if (event.type === 'noteon') {
      const tick = Math.round(event.time * 128);
      track.addEvent(new MidiWriter.NoteOnEvent({
        pitch: event.note,
        velocity: event.velocity,
        wait: `T${tick}`,
        channel: isDrum ? 9 : 0
      }));
    }
  });
  
  midi.addTrack(track);
  return midi.buildFile();
}

ipcMain.handle('export-stems', async (event, data) => {
  const { tracks, bpm } = data;
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
    message: '选择导出分轨的文件夹'
  });
  
  if (!result.canceled && result.filePaths.length > 0) {
    const outputDir = result.filePaths[0];
    
    try {
      const MidiWriter = require('midi-writer-js');
      
      const trackConfigs = [
        { key: 'drums', name: 'Drums', program: 0, isDrum: true },
        { key: 'bass', name: 'Bass', program: 33, isDrum: false },
        { key: 'piano', name: 'Piano', program: 0, isDrum: false }
      ];
      
      trackConfigs.forEach(config => {
        const trackData = tracks[config.key];
        if (trackData && trackData.events) {
          const track = new MidiWriter.Track();
          track.setTempo(bpm);
          track.addEvent(new MidiWriter.ProgramChangeEvent({ 
            instrument: config.program, 
            channel: config.isDrum ? 9 : 0 
          }));
          
          const noteOffEvents = {};
          
          trackData.events
            .filter(e => e.type === 'noteon')
            .sort((a, b) => a.time - b.time)
            .forEach(event => {
              const tick = Math.round(event.time * 128);
              track.addEvent(new MidiWriter.NoteEvent({
                pitch: event.note,
                velocity: event.velocity,
                duration: '8',
                wait: tick > 0 ? `T${tick}` : 0,
                channel: config.isDrum ? 9 : 0
              }));
            });
          
          const writer = new MidiWriter.Writer([track]);
          const filePath = path.join(outputDir, `${config.name}.mid`);
          fs.writeFileSync(filePath, Buffer.from(writer.buildFile()));
        }
      });
      
      return { success: true, path: outputDir };
    } catch (err) {
      console.error('Export stems error:', err);
      return { success: false, error: err.message };
    }
  }
  return { success: false };
});
