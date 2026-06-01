const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const Database = require('./database');
const NFCReader = require('./nfc-reader');
const APIServer = require('./api-server');

let mainWindow;
let displayWindow;
let db;
let nfcReader;
let apiServer;

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 700,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, '../public/manager.html'));
  
  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools();
  }
}

function createDisplayWindow() {
  displayWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    },
    title: 'Poster Display'
  });

  displayWindow.loadFile(path.join(__dirname, '../public/display.html'));
  
  displayWindow.on('closed', () => {
    displayWindow = null;
  });
}

app.whenReady().then(async () => {
  db = new Database();
  await db.init();

  nfcReader = new NFCReader(db);
  
  apiServer = new APIServer(db, nfcReader);
  apiServer.start(3000);

  createMainWindow();
  createDisplayWindow();

  nfcReader.on('tag-read', (tagData) => {
    if (mainWindow) {
      mainWindow.webContents.send('tag-read', tagData);
    }
    if (displayWindow) {
      displayWindow.webContents.send('poster-change', tagData);
    }
  });

  nfcReader.start();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

ipcMain.handle('get-posters', async () => {
  return await db.getAllPosters();
});

ipcMain.handle('add-poster', async (event, poster) => {
  return await db.addPoster(poster);
});

ipcMain.handle('update-poster', async (event, id, poster) => {
  return await db.updatePoster(id, poster);
});

ipcMain.handle('delete-poster', async (event, id) => {
  return await db.deletePoster(id);
});

ipcMain.handle('get-statistics', async () => {
  return await db.getStatistics();
});

ipcMain.handle('simulate-tag', async (event, tagId) => {
  await nfcReader.simulateTagRead(tagId);
  return { success: true };
});

ipcMain.handle('get-current-poster', async () => {
  return nfcReader.getCurrentPoster();
});

ipcMain.handle('open-display', () => {
  if (!displayWindow) {
    createDisplayWindow();
  } else {
    displayWindow.focus();
  }
});

ipcMain.handle('write-tag', async (event, tagId, posterData) => {
  return await nfcReader.writeTagData(tagId, posterData);
});

ipcMain.handle('set-debounce', (event, delayMs) => {
  nfcReader.setDebounceDelay(delayMs);
  return { success: true };
});

ipcMain.handle('start-carousel', async (event, interval) => {
  await nfcReader.startCarousel(interval);
  return { success: true };
});

ipcMain.handle('stop-carousel', () => {
  nfcReader.stopCarousel();
  return { success: true };
});

ipcMain.handle('get-carousel-status', () => {
  return nfcReader.getCarouselStatus();
});

ipcMain.handle('refresh-carousel', async () => {
  await nfcReader.refreshCarouselPosters();
  return { success: true };
});

ipcMain.handle('export-report', async (event, format, startDate, endDate) => {
  return await db.exportReport(format, startDate, endDate);
});