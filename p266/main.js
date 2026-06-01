const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const BlueZManager = require('./bluez');

let mainWindow;
let bluezManager;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 700,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile('index.html');
  mainWindow.webContents.openDevTools();
}

async function initBlueZ() {
  bluezManager = new BlueZManager();
  
  bluezManager.on('device-added', (device) => {
    if (mainWindow) {
      mainWindow.webContents.send('device-added', device);
    }
  });
  
  bluezManager.on('device-removed', (device) => {
    if (mainWindow) {
      mainWindow.webContents.send('device-removed', device);
    }
  });
  
  bluezManager.on('device-updated', (device) => {
    if (mainWindow) {
      mainWindow.webContents.send('device-updated', device);
    }
  });
  
  bluezManager.on('scanning-changed', (isScanning) => {
    if (mainWindow) {
      mainWindow.webContents.send('scanning-changed', isScanning);
    }
  });
  
  bluezManager.on('request-pin', (data) => {
    if (mainWindow) {
      mainWindow.webContents.send('request-pin', { device: data.device });
    }
  });
  
  bluezManager.on('request-passkey', (data) => {
    if (mainWindow) {
      mainWindow.webContents.send('request-passkey', { device: data.device });
    }
  });
  
  bluezManager.on('request-confirmation', (data) => {
    if (mainWindow) {
      mainWindow.webContents.send('request-confirmation', { device: data.device, passkey: data.passkey });
    }
  });
  
  bluezManager.on('display-pin', (data) => {
    if (mainWindow) {
      mainWindow.webContents.send('display-pin', { device: data.device, pinCode: data.pincode });
    }
  });
  
  bluezManager.on('display-passkey', (data) => {
    if (mainWindow) {
      mainWindow.webContents.send('display-passkey', { device: data.device, passkey: data.passkey, entered: data.entered });
    }
  });
  
  try {
    await bluezManager.init();
    console.log('BlueZ初始化成功');
    return true;
  } catch (error) {
    console.error('BlueZ初始化失败:', error);
    return false;
  }
}

app.whenReady().then(async () => {
  createWindow();
  await initBlueZ();
  
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', async () => {
  if (bluezManager) {
    await bluezManager.destroy();
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

ipcMain.handle('start-scan', async () => {
  try {
    if (!bluezManager) {
      throw new Error('BlueZ未初始化');
    }
    await bluezManager.startScan();
    return { success: true };
  } catch (error) {
    console.error('开始扫描失败:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('stop-scan', async () => {
  try {
    if (!bluezManager) {
      throw new Error('BlueZ未初始化');
    }
    await bluezManager.stopScan();
    return { success: true };
  } catch (error) {
    console.error('停止扫描失败:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('get-devices', () => {
  if (!bluezManager) {
    return { success: false, error: 'BlueZ未初始化', devices: [] };
  }
  return { 
    success: true, 
    devices: bluezManager.getDevices() 
  };
});

ipcMain.handle('get-adapter-info', () => {
  if (!bluezManager) {
    return { success: false, error: 'BlueZ未初始化', info: null };
  }
  return { 
    success: true, 
    info: bluezManager.getAdapterInfo() 
  };
});

ipcMain.handle('init-bluez', async () => {
  if (bluezManager) {
    await bluezManager.destroy();
  }
  const success = await initBlueZ();
  return { success, info: bluezManager ? bluezManager.getAdapterInfo() : null };
});

ipcMain.handle('pair-device', async (event, devicePath) => {
  try {
    if (!bluezManager) {
      throw new Error('BlueZ未初始化');
    }
    return await bluezManager.pairDevice(devicePath);
  } catch (error) {
    console.error('配对失败:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('cancel-pairing', async (event, devicePath) => {
  try {
    if (!bluezManager) {
      throw new Error('BlueZ未初始化');
    }
    return await bluezManager.cancelPairing(devicePath);
  } catch (error) {
    console.error('取消配对失败:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('remove-device', async (event, devicePath) => {
  try {
    if (!bluezManager) {
      throw new Error('BlueZ未初始化');
    }
    return await bluezManager.removeDevice(devicePath);
  } catch (error) {
    console.error('移除设备失败:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('connect-device', async (event, devicePath) => {
  try {
    if (!bluezManager) {
      throw new Error('BlueZ未初始化');
    }
    return await bluezManager.connectDevice(devicePath);
  } catch (error) {
    console.error('连接设备失败:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('disconnect-device', async (event, devicePath) => {
  try {
    if (!bluezManager) {
      throw new Error('BlueZ未初始化');
    }
    return await bluezManager.disconnectDevice(devicePath);
  } catch (error) {
    console.error('断开设备失败:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('provide-pin', async (event, devicePath, pinCode) => {
  try {
    if (!bluezManager) {
      throw new Error('BlueZ未初始化');
    }
    return await bluezManager.providePinCode(devicePath, pinCode);
  } catch (error) {
    console.error('提供PIN码失败:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('get-device-details', async (event, devicePath) => {
  try {
    if (!bluezManager) {
      throw new Error('BlueZ未初始化');
    }
    const device = await bluezManager.getDeviceDetails(devicePath);
    return { success: true, device };
  } catch (error) {
    console.error('获取设备详情失败:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('export-devices-csv', async () => {
  try {
    if (!bluezManager) {
      throw new Error('BlueZ未初始化');
    }
    const csvContent = bluezManager.exportDevicesCSV();
    return { success: true, content: csvContent };
  } catch (error) {
    console.error('导出CSV失败:', error);
    return { success: false, error: error.message };
  }
});
