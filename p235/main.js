const { app, BrowserWindow, ipcMain, usb } = require('electron');
const path = require('path');
const fs = require('fs');

const PICkit2Protocol = require('./src/pickit2-protocol');
const HexParser = require('./src/hex-parser');

let mainWindow;
let pickit2;
let isSimulationMode = false;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 700,
    minWidth: 700,
    minHeight: 500,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false,
      preload: path.join(__dirname, 'src/preload.js')
    },
    icon: path.join(__dirname, 'assets/icon.png')
  });

  mainWindow.loadFile(path.join(__dirname, 'src/index.html'));

  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
    if (pickit2) {
      pickit2.disconnect();
    }
  });
}

app.whenReady().then(() => {
  createWindow();

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

ipcMain.handle('connect-device', async () => {
  try {
    pickit2 = new PICkit2Protocol();
    const connected = await pickit2.connect();
    
    if (connected) {
      isSimulationMode = false;
      const info = await pickit2.getDeviceInfo();
      return { success: true, info, simulation: false };
    } else {
      isSimulationMode = true;
      const info = {
        firmwareVersion: '模拟模式',
        hardwareVersion: 'N/A',
        deviceName: 'PICkit2 Simulator'
      };
      return { success: true, info, simulation: true };
    }
  } catch (error) {
    isSimulationMode = true;
    const info = {
      firmwareVersion: '模拟模式',
      hardwareVersion: 'N/A',
      deviceName: 'PICkit2 Simulator'
    };
    return { success: true, info, simulation: true };
  }
});

ipcMain.handle('disconnect-device', async () => {
  if (pickit2) {
    await pickit2.disconnect();
    pickit2 = null;
  }
  isSimulationMode = false;
  return { success: true };
});

ipcMain.handle('parse-hex', async (event, filePath) => {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const parser = new HexParser();
    const hexData = parser.parse(content);
    return { success: true, data: hexData };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('set-target-device', async (event, device) => {
  if (pickit2) {
    await pickit2.setTargetDevice(device);
    return { success: true };
  }
  return { success: true, simulation: true };
});

ipcMain.handle('erase-device', async (event) => {
  const progressCallback = (progress, message) => {
    mainWindow.webContents.send('program-progress', { progress, message });
  };

  try {
    if (isSimulationMode) {
      for (let i = 0; i <= 100; i += 10) {
        await new Promise(resolve => setTimeout(resolve, 100));
        progressCallback(i, `擦除中... ${i}%`);
      }
      return { success: true };
    }

    if (pickit2) {
      await pickit2.erase(progressCallback);
      return { success: true };
    }
    return { success: false, error: '设备未连接' };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('program-device', async (event, hexData) => {
  const progressCallback = (progress, message) => {
    mainWindow.webContents.send('program-progress', { progress, message });
  };

  try {
    if (isSimulationMode) {
      const totalSteps = 100;
      for (let i = 0; i <= totalSteps; i += 5) {
        await new Promise(resolve => setTimeout(resolve, 80));
        let message = '';
        if (i < 20) message = '准备编程...';
        else if (i < 50) message = `写入程序存储器... ${i}%`;
        else if (i < 80) message = `写入配置位... ${i}%`;
        else message = `编程完成... ${i}%`;
        progressCallback(i, message);
      }
      return { success: true };
    }

    if (pickit2) {
      await pickit2.program(hexData, progressCallback);
      return { success: true };
    }
    return { success: false, error: '设备未连接' };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('verify-device', async (event, hexData) => {
  const progressCallback = (progress, message) => {
    mainWindow.webContents.send('program-progress', { progress, message });
  };

  try {
    if (isSimulationMode) {
      for (let i = 0; i <= 100; i += 8) {
        await new Promise(resolve => setTimeout(resolve, 60));
        progressCallback(i, `校验中... ${i}%`);
      }
      return { success: true, match: true };
    }

    if (pickit2) {
      const result = await pickit2.verify(hexData, progressCallback);
      return { success: true, match: result };
    }
    return { success: false, error: '设备未连接' };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('read-device', async (event) => {
  const progressCallback = (progress, message) => {
    mainWindow.webContents.send('program-progress', { progress, message });
  };

  try {
    if (isSimulationMode) {
      for (let i = 0; i <= 100; i += 10) {
        await new Promise(resolve => setTimeout(resolve, 100));
        progressCallback(i, `读取中... ${i}%`);
      }
      const mockData = {
        program: new Array(0x2000).fill(0x3FFF),
        eeprom: new Array(256).fill(0xFF),
        config: new Array(8).fill(0xFFFF)
      };
      return { success: true, data: mockData };
    }

    if (pickit2) {
      const data = await pickit2.read(progressCallback);
      return { success: true, data };
    }
    return { success: false, error: '设备未连接' };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('get-device-list', async () => {
  const devices = [
    { name: 'PIC16F84A', family: 'PIC16', programSize: 0x400, eepromSize: 64, chipID: 0x05E0 },
    { name: 'PIC16F877A', family: 'PIC16', programSize: 0x2000, eepromSize: 256, chipID: 0x0F91 },
    { name: 'PIC16F887', family: 'PIC16', programSize: 0x2000, eepromSize: 256, chipID: 0x10C0 },
    { name: 'PIC16F1829', family: 'PIC16', programSize: 0x2000, eepromSize: 256, chipID: 0x27E0 },
    { name: 'PIC18F452', family: 'PIC18', programSize: 0x8000, eepromSize: 256, chipID: 0x1004 },
    { name: 'PIC18F4550', family: 'PIC18', programSize: 0x8000, eepromSize: 256, chipID: 0x1204 },
    { name: 'PIC18F46K22', family: 'PIC18', programSize: 0x10000, eepromSize: 1024, chipID: 0x4580 },
    { name: 'PIC18F25K80', family: 'PIC18', programSize: 0x8000, eepromSize: 256, chipID: 0x4980 }
  ];
  return { success: true, devices };
});

ipcMain.handle('read-chip-id', async () => {
  const progressCallback = (progress, message) => {
    mainWindow.webContents.send('program-progress', { progress, message });
  };

  try {
    if (isSimulationMode) {
      progressCallback(50, '读取芯片ID...');
      await new Promise(resolve => setTimeout(resolve, 500));
      const mockID = {
        deviceID: 0x0F91,
        revision: 0x0001,
        hexID: '0x0F91'
      };
      progressCallback(100, '读取完成');
      return { success: true, chipID: mockID };
    }

    if (pickit2) {
      const chipID = await pickit2.readChipID();
      return { success: true, chipID };
    }
    return { success: false, error: '设备未连接' };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('verify-chip-id', async (event, expectedID) => {
  const progressCallback = (progress, message) => {
    mainWindow.webContents.send('program-progress', { progress, message });
  };

  try {
    if (isSimulationMode) {
      progressCallback(50, '验证芯片ID...');
      await new Promise(resolve => setTimeout(resolve, 500));
      const mockID = {
        deviceID: 0x0F91,
        revision: 0x0001,
        hexID: '0x0F91'
      };
      progressCallback(100, '验证完成');
      return { success: true, match: expectedID ? mockID.deviceID === expectedID : true, chipID: mockID };
    }

    if (pickit2) {
      const result = await pickit2.verifyChipID(expectedID);
      return result;
    }
    return { success: false, error: '设备未连接' };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('get-offline-status', async () => {
  try {
    if (isSimulationMode) {
      return { 
        success: true, 
        status: { 
          hasData: false, 
          programSize: 0, 
          eepromSize: 0, 
          checksum: 0 
        } 
      };
    }

    if (pickit2) {
      const status = await pickit2.getOfflineStatus();
      return { success: true, status };
    }
    return { success: false, error: '设备未连接' };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('offline-write', async (event, hexData) => {
  const progressCallback = (progress, message) => {
    mainWindow.webContents.send('program-progress', { progress, message });
  };

  try {
    if (isSimulationMode) {
      const totalSteps = 100;
      for (let i = 0; i <= totalSteps; i += 5) {
        await new Promise(resolve => setTimeout(resolve, 60));
        let message = '';
        if (i < 10) message = '擦除编程器内部存储...';
        else if (i < 70) message = `写入程序存储器... ${i}%`;
        else if (i < 90) message = `写入EEPROM... ${i}%`;
        else if (i < 95) message = `写入配置位... ${i}%`;
        else message = `验证数据完整性... ${i}%`;
        progressCallback(i, message);
      }
      return { success: true, programSize: hexData.program?.length || 0, eepromSize: hexData.eeprom?.length || 0 };
    }

    if (pickit2) {
      const result = await pickit2.offlineWrite(hexData, progressCallback);
      return result;
    }
    return { success: false, error: '设备未连接' };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('offline-read', async () => {
  const progressCallback = (progress, message) => {
    mainWindow.webContents.send('program-progress', { progress, message });
  };

  try {
    if (isSimulationMode) {
      for (let i = 0; i <= 100; i += 10) {
        await new Promise(resolve => setTimeout(resolve, 100));
        progressCallback(i, `读取编程器数据... ${i}%`);
      }
      const mockData = {
        program: new Array(0x1000).fill(0x3FFF),
        eeprom: new Array(128).fill(0xFF),
        config: new Array(8).fill(0xFFFF)
      };
      return { success: true, data: mockData };
    }

    if (pickit2) {
      const data = await pickit2.offlineRead(progressCallback);
      return { success: true, data };
    }
    return { success: false, error: '设备未连接' };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('offline-start', async () => {
  const progressCallback = (progress, message) => {
    mainWindow.webContents.send('program-progress', { progress, message });
  };

  try {
    if (isSimulationMode) {
      for (let i = 0; i <= 100; i += 8) {
        await new Promise(resolve => setTimeout(resolve, 80));
        let message = '';
        if (i < 30) message = `擦除目标芯片... ${i}%`;
        else if (i < 80) message = `写入程序... ${i}%`;
        else message = `校验程序... ${i}%`;
        progressCallback(i, message);
      }
      return { success: true, message: '脱机编程完成（模拟）' };
    }

    if (pickit2) {
      const result = await pickit2.offlineStart(progressCallback);
      return result;
    }
    return { success: false, error: '设备未连接' };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('offline-erase', async () => {
  const progressCallback = (progress, message) => {
    mainWindow.webContents.send('program-progress', { progress, message });
  };

  try {
    if (isSimulationMode) {
      progressCallback(50, '擦除编程器内部存储...');
      await new Promise(resolve => setTimeout(resolve, 500));
      progressCallback(100, '擦除完成');
      return { success: true };
    }

    if (pickit2) {
      progressCallback(50, '擦除编程器内部存储...');
      const result = await pickit2.offlineErase();
      progressCallback(100, '擦除完成');
      return { success: result };
    }
    return { success: false, error: '设备未连接' };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('offline-verify', async () => {
  const progressCallback = (progress, message) => {
    mainWindow.webContents.send('program-progress', { progress, message });
  };

  try {
    if (isSimulationMode) {
      for (let i = 0; i <= 100; i += 10) {
        await new Promise(resolve => setTimeout(resolve, 100));
        progressCallback(i, `脱机校验... ${i}%`);
      }
      return { success: true, match: true };
    }

    if (pickit2) {
      const result = await pickit2.offlineVerify(progressCallback);
      return result;
    }
    return { success: false, error: '设备未连接' };
  } catch (error) {
    return { success: false, error: error.message };
  }
});
