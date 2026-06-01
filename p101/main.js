const { app, BrowserWindow, ipcMain } = require('electron');
const { fork } = require('child_process');
const path = require('path');

let mainWindow;
let backendServer;

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
}

function startBackendServer() {
  const serverPath = path.join(__dirname, 'server.js');
  
  backendServer = fork(serverPath, [], {
    cwd: __dirname,
    stdio: ['pipe', 'pipe', 'pipe', 'ipc']
  });

  backendServer.stdout.on('data', (data) => {
    console.log(`Backend: ${data}`);
  });

  backendServer.stderr.on('data', (data) => {
    console.error(`Backend Error: ${data}`);
  });

  backendServer.on('close', (code) => {
    console.log(`Backend server exited with code ${code}`);
  });
}

app.whenReady().then(() => {
  startBackendServer();
  setTimeout(createWindow, 1000);

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', function () {
  if (backendServer) {
    backendServer.kill();
  }
  if (process.platform !== 'darwin') app.quit();
});

ipcMain.on('app-quit', () => {
  if (backendServer) {
    backendServer.kill();
  }
  app.quit();
});
