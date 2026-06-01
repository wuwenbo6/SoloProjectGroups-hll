const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const { spawn, exec } = require('child_process');
const fs = require('fs');
const path = require('path');

let mainWindow;

const VENDOR_PROFILES = {
  dell: {
    id: 'dell',
    name: 'Dell',
    label: 'Dell iDRAC',
    keywords: ['dell', 'idrac', 'poweredge'],
    pwm: {
      manualMode: 'raw 0x30 0x30 0x02 0x01',
      autoMode: 'raw 0x30 0x30 0x02 0x00',
      setPwm: 'raw 0x30 0x30 0x02 {hexDuty}',
      getPwmMode: 'raw 0x30 0x30 0x02'
    },
    zones: [
      { value: '00', label: 'Zone 0 (系统)' },
      { value: '01', label: 'Zone 1 (CPU)' }
    ]
  },
  hp: {
    id: 'hp',
    name: 'HP',
    label: 'HP iLO',
    keywords: ['hp', 'ilo', 'proliant', 'hewlett'],
    pwm: {
      manualMode: 'raw 0x26 0x0d 0x01',
      autoMode: 'raw 0x26 0x0d 0x00',
      setPwm: 'raw 0x26 0x0e 0x{zone} {hexDuty}',
      getPwmMode: 'raw 0x26 0x0d'
    },
    zones: [
      { value: '00', label: 'Zone 0' },
      { value: '01', label: 'Zone 1' }
    ]
  },
  lenovo: {
    id: 'lenovo',
    name: 'Lenovo',
    label: 'Lenovo XCC',
    keywords: ['lenovo', 'xcc', 'thinksystem'],
    pwm: {
      manualMode: 'raw 0x3a 0x00 0x01',
      autoMode: 'raw 0x3a 0x00 0x00',
      setPwm: 'raw 0x3a 0x01 0x{zone} {hexDuty}',
      getPwmMode: 'raw 0x3a 0x00'
    },
    zones: [
      { value: '00', label: 'Zone 0' },
      { value: '01', label: 'Zone 1' }
    ]
  },
  generic: {
    id: 'generic',
    name: 'Generic',
    label: '通用 IPMI',
    keywords: [],
    pwm: {
      manualMode: 'raw 0x3a 0x00',
      autoMode: 'raw 0x3a 0x02',
      setPwm: 'raw 0x3a 0x01 0x{zone} {hexDuty}',
      getPwmMode: 'raw 0x3a 0x00'
    },
    zones: [
      { value: '00', label: 'Zone 0' },
      { value: '01', label: 'Zone 1' }
    ]
  }
};

class IpmiSession {
  constructor() {
    this.process = null;
    this.active = false;
    this.outputBuffer = '';
    this.commandResolve = null;
    this.commandReject = null;
    this.timeoutHandle = null;
    this.commandQueue = [];
    this.processing = false;
  }

  async connect() {
    if (this.active && this.process) return true;

    return new Promise((resolve, reject) => {
      try {
        this.process = spawn('ipmitool', ['shell'], {
          stdio: ['pipe', 'pipe', 'pipe'],
          env: { ...process.env }
        });
      } catch (err) {
        reject(err);
        return;
      }

      let initialized = false;
      const initTimeout = setTimeout(() => {
        if (!initialized) {
          this.active = false;
          reject(new Error('IPMI session 连接超时'));
        }
      }, 8000);

      this.process.stdout.on('data', (data) => {
        const text = data.toString();

        if (!initialized) {
          if (text.includes('ipmitool>') || text.includes('>')) {
            initialized = true;
            this.active = true;
            clearTimeout(initTimeout);
            resolve(true);
          }
          return;
        }

        this.outputBuffer += text;
        this._checkOutput();
      });

      this.process.stderr.on('data', (data) => {
        const text = data.toString();
        if (!initialized) {
          if (text.includes('Unable') || text.includes('Error') || text.includes('Could not')) {
            initialized = true;
            this.active = false;
            clearTimeout(initTimeout);
            reject(new Error(text.trim()));
          }
        }
      });

      this.process.on('close', () => {
        this.active = false;
        this.process = null;
        if (this.commandReject) {
          this.commandReject(new Error('IPMI session 已关闭'));
          this.commandResolve = null;
          this.commandReject = null;
        }
        this._processQueue();
      });

      this.process.on('error', (err) => {
        if (!initialized) {
          clearTimeout(initTimeout);
          reject(err);
        }
        this.active = false;
      });
    });
  }

  _checkOutput() {
    const promptIndex = this.outputBuffer.lastIndexOf('ipmitool>');
    if (promptIndex === -1) {
      const simplePromptIndex = this.outputBuffer.lastIndexOf('>');
      if (simplePromptIndex === -1 || this.outputBuffer.trim().length < 3) {
        return;
      }
    }

    const promptIdx = this.outputBuffer.lastIndexOf('ipmitool>');
    const endIdx = promptIdx !== -1 ? promptIdx : this.outputBuffer.lastIndexOf('>');
    const output = this.outputBuffer.substring(0, endIdx).trim();
    this.outputBuffer = '';

    if (this.commandResolve) {
      clearTimeout(this.timeoutHandle);
      const resolve = this.commandResolve;
      this.commandResolve = null;
      this.commandReject = null;
      resolve(output);
    }
  }

  async execute(command) {
    if (!this.active || !this.process) {
      await this.connect();
    }

    return new Promise((resolve, reject) => {
      this.commandResolve = resolve;
      this.commandReject = reject;
      this.outputBuffer = '';

      try {
        this.process.stdin.write(command + '\n');
      } catch (err) {
        reject(err);
        return;
      }

      this.timeoutHandle = setTimeout(() => {
        const output = this.outputBuffer.trim();
        this.outputBuffer = '';
        this.commandResolve = null;
        this.commandReject = null;
        resolve(output || '');
      }, 10000);
    });
  }

  disconnect() {
    if (this.process) {
      try {
        this.process.stdin.write('exit\n');
      } catch (e) { /* ignore */ }
      this.process.kill();
      this.process = null;
      this.active = false;
    }
  }

  async _processQueue() {
    if (this.processing || this.commandQueue.length === 0) return;
    this.processing = true;

    while (this.commandQueue.length > 0) {
      const { command, resolve, reject } = this.commandQueue.shift();
      try {
        const result = await this.execute(command);
        resolve(result);
      } catch (err) {
        reject(err);
      }
    }

    this.processing = false;
  }
}

const ipmiSession = new IpmiSession();
let currentVendor = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      enableRemoteModule: true
    }
  });

  mainWindow.loadFile('index.html');
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  ipmiSession.disconnect();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  ipmiSession.disconnect();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

function detectVendorFromMcInfo(output) {
  const lower = output.toLowerCase();

  for (const [key, profile] of Object.entries(VENDOR_PROFILES)) {
    if (key === 'generic') continue;
    for (const keyword of profile.keywords) {
      if (lower.includes(keyword)) {
        return profile;
      }
    }
  }

  return VENDOR_PROFILES.generic;
}

ipcMain.handle('detect-vendor', async () => {
  try {
    const output = await ipmiSession.execute('mc info');
    const vendor = detectVendorFromMcInfo(output);
    currentVendor = vendor;
    return { success: true, data: vendor };
  } catch (error) {
    currentVendor = VENDOR_PROFILES.generic;
    return { success: true, data: currentVendor, fallback: true, error: error.message };
  }
});

ipcMain.handle('get-vendor-profiles', async () => {
  return { success: true, data: VENDOR_PROFILES };
});

ipcMain.handle('set-vendor', async (event, vendorId) => {
  if (VENDOR_PROFILES[vendorId]) {
    currentVendor = VENDOR_PROFILES[vendorId];
    return { success: true, data: currentVendor };
  }
  return { success: false, error: '未知厂商' };
});

ipcMain.handle('get-sensor-data', async () => {
  try {
    const output = await ipmiSession.execute('sensor list');
    const fans = parseFanOutput(output, /fan/i);
    const temps = parseTemperatureOutput(output, /temp/i);
    return { success: true, data: { fans, temps } };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('get-fan-speed', async () => {
  try {
    const output = await ipmiSession.execute('sensor list');
    const fans = parseFanOutput(output, /fan/i);
    return { success: true, data: fans };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('get-temperature', async () => {
  try {
    const output = await ipmiSession.execute('sensor list');
    const temps = parseTemperatureOutput(output, /temp/i);
    return { success: true, data: temps };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('set-fan-pwm', async (event, zone, duty) => {
  try {
    const vendor = currentVendor || VENDOR_PROFILES.generic;
    const hexDuty = Math.round(duty * 255 / 100).toString(16).padStart(2, '0');
    const command = vendor.pwm.setPwm
      .replace('{zone}', zone)
      .replace('{hexDuty}', hexDuty);
    await ipmiSession.execute(command);
    return { success: true, command };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('set-fan-manual', async () => {
  try {
    const vendor = currentVendor || VENDOR_PROFILES.generic;
    await ipmiSession.execute(vendor.pwm.manualMode);
    return { success: true, command: vendor.pwm.manualMode };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('set-fan-auto', async () => {
  try {
    const vendor = currentVendor || VENDOR_PROFILES.generic;
    await ipmiSession.execute(vendor.pwm.autoMode);
    return { success: true, command: vendor.pwm.autoMode };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('session-status', async () => {
  return { active: ipmiSession.active };
});

ipcMain.handle('session-reconnect', async () => {
  try {
    ipmiSession.disconnect();
    await ipmiSession.connect();
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

function parseFanOutput(output, filterRegex) {
  const lines = output.trim().split('\n');
  const fans = [];

  lines.forEach(line => {
    if (!filterRegex.test(line)) return;
    const parts = line.split('|').map(p => p.trim());
    if (parts.length >= 3) {
      const name = parts[0];
      const speed = parseFloat(parts[1]);
      const unit = parts[2];
      if (!isNaN(speed)) {
        fans.push({ name, speed, unit });
      }
    }
  });

  return fans;
}

function parseTemperatureOutput(output, filterRegex) {
  const lines = output.trim().split('\n');
  const temps = [];

  lines.forEach(line => {
    if (!filterRegex.test(line)) return;
    const parts = line.split('|').map(p => p.trim());
    if (parts.length >= 3) {
      const name = parts[0];
      const temp = parseFloat(parts[1]);
      const unit = parts[2];
      if (!isNaN(temp)) {
        temps.push({ name, temp, unit });
      }
    }
  });

  return temps;
}

ipcMain.handle('export-csv', async (event, csvContent) => {
  try {
    const result = await dialog.showSaveDialog(mainWindow, {
      title: '导出转速日志 CSV',
      defaultPath: path.join(app.getPath('documents'), `ipmi-fan-log-${new Date().toISOString().slice(0, 19).replace(/[:.]/g, '-')}.csv`),
      filters: [
        { name: 'CSV 文件', extensions: ['csv'] },
        { name: '所有文件', extensions: ['*'] }
      ]
    });

    if (result.canceled) {
      return { success: false, canceled: true };
    }

    fs.writeFileSync(result.filePath, '\uFEFF' + csvContent, 'utf-8');
    return { success: true, filePath: result.filePath };
  } catch (error) {
    return { success: false, error: error.message };
  }
});
