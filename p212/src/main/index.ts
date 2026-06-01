import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { BACnetMonitor, CapturedFrame, DeviceInfo } from './monitor';
import { exportPcap } from './pcap';

let mainWindow: BrowserWindow | null = null;
const monitor = new BACnetMonitor();

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    title: 'BACnet MS/TP Monitor',
  });

  if (app.isPackaged) {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  } else {
    mainWindow.loadURL('http://localhost:9000');
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

monitor.onFrame((frame: CapturedFrame) => {
  mainWindow?.webContents.send('frame-captured', frame);
});

monitor.onDeviceUpdate((devices: DeviceInfo[]) => {
  mainWindow?.webContents.send('devices-updated', devices);
});

monitor.onError((error: string) => {
  mainWindow?.webContents.send('error', error);
});

ipcMain.handle('list-ports', async () => {
  return monitor.listPorts();
});

ipcMain.handle('connect', async (_event, port: string, baudRate: number) => {
  try {
    await monitor.connect(port, baudRate);
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('disconnect', async () => {
  await monitor.disconnect();
  return { success: true };
});

ipcMain.handle('is-connected', () => {
  return monitor.isConnected();
});

ipcMain.handle('clear-frames', () => {
  monitor.clearFrames();
  return { success: true };
});

ipcMain.handle('get-frames', () => {
  return monitor.getFrames();
});

ipcMain.handle('get-devices', () => {
  return monitor.getDevices();
});

ipcMain.handle('send-who-is', async (_event, lowLimit?: number, highLimit?: number) => {
  return monitor.sendWhoIs(lowLimit, highLimit);
});

ipcMain.handle('set-source-address', (_event, addr: number) => {
  monitor.setSourceAddress(addr);
  return { success: true };
});

ipcMain.handle('export-pcap', async () => {
  try {
    const frames = monitor.getFrames();
    if (frames.length === 0) {
      return { success: false, error: 'No frames to export' };
    }

    const result = await dialog.showSaveDialog(mainWindow!, {
      title: 'Export PCAP',
      defaultPath: `bacnet-mstp-${Date.now()}.pcap`,
      filters: [
        { name: 'PCAP Files', extensions: ['pcap'] },
        { name: 'All Files', extensions: ['*'] },
      ],
    });

    if (result.canceled || !result.filePath) {
      return { success: false, error: 'Cancelled' };
    }

    const pcapBuffer = exportPcap(frames);
    fs.writeFileSync(result.filePath, pcapBuffer);
    return { success: true, path: result.filePath };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
});

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  monitor.disconnect();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
