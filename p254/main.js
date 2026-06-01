const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { SerialPort } = require('serialport');

let mainWindow;
let serialPort = null;
let isSimulationMode = true;

const FADE_TIME_TABLE = [
  0, 0.7, 1.0, 1.4, 2.0, 2.8, 4.0, 5.7,
  8.0, 11.3, 16.0, 22.6, 32.0, 45.3, 64.0, 90.5
];

const SCENE_COUNT = 16;

const simulationState = {
  actualLevel: 128,
  targetLevel: 128,
  displayLevel: 128,
  fadeTime: 0,
  fadeRate: 0,
  dtr0: 0,
  dtr1: 0,
  dtr2: 0,
  fadeTimer: null,
  lampPower: true,
  lampFailure: false,
  powerFailure: false,
  controlGearPresent: true,
  limitError: false,
  resetState: false,
  missingShortAddress: false,
  powerOnLevel: 254,
  systemFailureLevel: 254,
  maxLevel: 254,
  minLevel: 1,
  physicalMinLevel: 1,
  deviceType: 0,
  versionNumber: 1,
  scenes: new Array(SCENE_COUNT).fill(null)
};

class DALIProtocol {
  static ADDR_TYPE_SHORT = 0;
  static ADDR_TYPE_GROUP = 1;
  static ADDR_TYPE_BROADCAST = 2;

  static encodeAddressByte(type, address, isCommand) {
    const cmdBit = isCommand ? 1 : 0;
    switch (type) {
      case this.ADDR_TYPE_SHORT:
        return ((address & 0x3F) << 1) | cmdBit;
      case this.ADDR_TYPE_GROUP:
        return 0x80 | ((address & 0x0F) << 1) | cmdBit;
      case this.ADDR_TYPE_BROADCAST:
        return 0xFE | cmdBit;
      default:
        return 0xFE | cmdBit;
    }
  }

  static decodeAddressByte(addrByte) {
    const cmdFlag = addrByte & 0x01;
    if ((addrByte & 0xFE) === 0xFE) {
      return { type: 'broadcast', address: 0xFF, isCommand: !!cmdFlag, raw: addrByte };
    }
    if (addrByte & 0x80) {
      const group = (addrByte >> 1) & 0x0F;
      return { type: 'group', address: group, isCommand: !!cmdFlag, raw: addrByte };
    }
    const shortAddr = (addrByte >> 1) & 0x3F;
    return { type: 'short', address: shortAddr, isCommand: !!cmdFlag, raw: addrByte };
  }

  static encodeForwardFrame(type, address, command, isCommand = null) {
    const addrInfo = this.decodeAddressByte(typeof type === 'number' && type > 0xFF ? type : 0);
    let addrByte, cmdByte;

    if (typeof type === 'string' || typeof type === 'number') {
      if (typeof type === 'number' && type <= 0xFF && address === undefined) {
        addrByte = type;
        cmdByte = address !== undefined ? address : command;
        if (cmdByte === undefined) cmdByte = 0;
        return [addrByte & 0xFF, cmdByte & 0xFF];
      }
    }

    const resolvedIsCommand = isCommand !== null ? isCommand : (command > 0xFE || (command >= 0x20 && command <= 0xFF && !(command >= 0x00 && command <= 0xFE && !this._isDAPC(command))));

    if (typeof type === 'number') {
      if (type === this.ADDR_TYPE_SHORT || type === this.ADDR_TYPE_GROUP || type === this.ADDR_TYPE_BROADCAST) {
        addrByte = this.encodeAddressByte(type, address, resolvedIsCommand !== false);
        cmdByte = command & 0xFF;
        return [addrByte, cmdByte];
      }
    }

    addrByte = type & 0xFF;
    cmdByte = (address !== undefined ? address : command) & 0xFF;
    return [addrByte, cmdByte];
  }

  static _isDAPC(cmdByte) {
    return cmdByte >= 0x00 && cmdByte <= 0xFE;
  }

  static encodeDAPC(type, address, level) {
    const validLevel = Math.max(0, Math.min(254, level));
    const addrByte = this.encodeAddressByte(type, address, false);
    return [addrByte, validLevel];
  }

  static encodeIndirectCommand(type, address, command) {
    const addrByte = this.encodeAddressByte(type, address, true);
    return [addrByte, command & 0xFF];
  }

  static encodeSetFadeTime(type, address, fadeTime) {
    const validFadeTime = Math.max(0, Math.min(15, fadeTime));
    const dtr0Frame = this.encodeIndirectCommand(type, address, 0xA3);
    const setFadeTimeFrame = this.encodeIndirectCommand(type, address, 0xA1);
    return { dtr0Value: validFadeTime, dtr0Frame, setFadeTimeFrame };
  }

  static parseBackwardFrame(data) {
    if (!data || data.length === 0) {
      return { type: 'NO_RESPONSE', raw: [] };
    }

    const byte = data[0];
    return {
      type: 'RESPONSE',
      raw: Array.from(data),
      value: byte,
      hex: '0x' + byte.toString(16).padStart(2, '0').toUpperCase(),
      binary: byte.toString(2).padStart(8, '0')
    };
  }

  static getCommandDescription(addrByte, cmdByte) {
    const addrInfo = this.decodeAddressByte(addrByte);
    let addrDesc = '';

    switch (addrInfo.type) {
      case 'short':
        addrDesc = `短地址 ${addrInfo.address}`;
        break;
      case 'group':
        addrDesc = `组地址 ${addrInfo.address}`;
        break;
      case 'broadcast':
        addrDesc = '广播';
        break;
    }

    const modeStr = addrInfo.isCommand ? '命令模式' : 'DAPC模式';

    if (!addrInfo.isCommand && cmdByte <= 254) {
      return `${addrDesc} [${modeStr}] 调光级别: ${cmdByte}`;
    }

    const commands = {
      0x00: 'OFF',
      0x01: 'UP',
      0x02: 'DOWN',
      0x03: 'STEP UP',
      0x04: 'STEP DOWN',
      0x05: 'RECALL MAX LEVEL',
      0x06: 'RECALL MIN LEVEL',
      0x07: 'STEP DOWN AND OFF',
      0x08: 'ON AND STEP UP',
      0x09: 'ENABLE DAPC SEQUENCE',
      0x0A: 'GO TO LAST ACTIVE LEVEL',
      0x20: 'RESET',
      0x21: 'STORE DTR AS MAX LEVEL',
      0x22: 'STORE DTR AS MIN LEVEL',
      0x23: 'STORE DTR AS SYSTEM FAILURE LEVEL',
      0x24: 'STORE DTR AS POWER ON LEVEL',
      0x25: 'STORE DTR AS FADE TIME / RATE',
      0x26: 'STORE DTR AS EXTENDED FADE TIME',
      0x27: 'SET SHORT ADDRESS (DTR)',
      0x2A: 'SET FADE TIME (DTR0=0..15)',
      0x2B: 'SET FADE RATE (DTR0=1..15)',
      0x2C: 'SET EXTENDED FADE TIME',
      0x30: 'QUERY STATUS',
      0x31: 'QUERY CONTROL GEAR',
      0x32: 'QUERY LAMP FAILURE',
      0x33: 'QUERY LAMP POWER ON',
      0x34: 'QUERY LIMIT ERROR',
      0x35: 'QUERY RESET STATE',
      0x36: 'QUERY MISSING SHORT ADDRESS',
      0x37: 'QUERY VERSION NUMBER',
      0x38: 'QUERY CONTENT DTR0',
      0x39: 'QUERY DEVICE TYPE',
      0x3A: 'QUERY PHYSICAL MINIMUM',
      0x3B: 'QUERY POWER FAILURE',
      0x3C: 'QUERY CONTENT DTR1',
      0x3D: 'QUERY CONTENT DTR2',
      0x40: 'QUERY ACTUAL LEVEL',
      0x41: 'QUERY MAX LEVEL',
      0x42: 'QUERY MIN LEVEL',
      0x43: 'QUERY POWER ON LEVEL',
      0x44: 'QUERY SYSTEM FAILURE LEVEL',
      0x45: 'QUERY FADE TIME / RATE',
      0x46: 'QUERY FADE RATE',
      0x47: 'QUERY EXTENDED FADE TIME',
      0x48: 'QUERY SCENE LEVEL (DTR0)',
      0x60: 'QUERY GROUP 0-7',
      0x61: 'QUERY GROUP 8-15',
      0x80: 'QUERY SHORT ADDRESS',
      0x90: 'QUERY RANDOM ADDRESS (H)',
      0x91: 'QUERY RANDOM ADDRESS (M)',
      0x92: 'QUERY RANDOM ADDRESS (L)',
      0xA0: 'QUERY ACTUAL LEVEL',
      0xA1: 'SET FADE TIME',
      0xA2: 'SET FADE RATE',
      0xA3: 'SET DTR0',
      0xA5: 'QUERY FADE TIME',
      0xA6: 'QUERY FADE RATE',
      0xB0: 'QUERY SCENE LEVEL'
    };

    if (cmdByte >= 0x10 && cmdByte <= 0x1F) {
      return `${addrDesc} [${modeStr}] RECALL SCENE ${cmdByte - 0x10}`;
    }
    if (cmdByte >= 0x20 && cmdByte <= 0x2F) {
      return `${addrDesc} [${modeStr}] STORE SCENE ${cmdByte - 0x20}`;
    }
    if (cmdByte >= 0x30 && cmdByte <= 0x3F) {
      return `${addrDesc} [${modeStr}] REMOVE FROM SCENE ${cmdByte - 0x30}`;
    }
    if (cmdByte >= 0x40 && cmdByte <= 0x4F) {
      return `${addrDesc} [${modeStr}] ADD TO GROUP ${cmdByte - 0x40}`;
    }
    if (cmdByte >= 0x50 && cmdByte <= 0x5F) {
      return `${addrDesc} [${modeStr}] REMOVE FROM GROUP ${cmdByte - 0x50}`;
    }

    const cmdDesc = commands[cmdByte] || `命令: 0x${cmdByte.toString(16).toUpperCase()}`;
    return `${addrDesc} [${modeStr}] ${cmdDesc}`;
  }

  static getFadeTimeSeconds(fadeTimeValue) {
    const idx = Math.max(0, Math.min(15, fadeTimeValue));
    return FADE_TIME_TABLE[idx];
  }

  static getFadeTimeDescription(fadeTimeValue) {
    const seconds = this.getFadeTimeSeconds(fadeTimeValue);
    if (fadeTimeValue === 0) return '无渐变 (立即)';
    return `${seconds}s`;
  }

  static parseStatusByte(statusByte) {
    return {
      raw: statusByte,
      hex: '0x' + statusByte.toString(16).padStart(2, '0').toUpperCase(),
      binary: statusByte.toString(2).padStart(8, '0'),
      bits: [
        { bit: 7, name: '控制设备存在', value: !!(statusByte & 0x80), active: !!(statusByte & 0x80) },
        { bit: 6, name: '灯具故障', value: !!(statusByte & 0x40), active: !!(statusByte & 0x40) },
        { bit: 5, name: '灯具通电', value: !!(statusByte & 0x20), active: !!(statusByte & 0x20) },
        { bit: 4, name: '限制错误', value: !!(statusByte & 0x10), active: !!(statusByte & 0x10) },
        { bit: 3, name: '复位状态', value: !!(statusByte & 0x08), active: !!(statusByte & 0x08) },
        { bit: 2, name: '缺少短地址', value: !!(statusByte & 0x04), active: !!(statusByte & 0x04) },
        { bit: 1, name: '功率故障', value: !!(statusByte & 0x02), active: !!(statusByte & 0x02) },
        { bit: 0, name: '预留', value: !!(statusByte & 0x01), active: false }
      ]
    };
  }

  static buildStatusByte(state) {
    let status = 0;
    if (state.controlGearPresent) status |= 0x80;
    if (state.lampFailure) status |= 0x40;
    if (state.lampPower) status |= 0x20;
    if (state.limitError) status |= 0x10;
    if (state.resetState) status |= 0x08;
    if (state.missingShortAddress) status |= 0x04;
    if (state.powerFailure) status |= 0x02;
    return status;
  }

  static getPowerWatts(level) {
    if (level <= 0) return 0;
    const maxPower = 100;
    return Math.round(maxPower * (level / 254) * 10) / 10;
  }

  static encodeStoreScene(type, address, sceneNumber) {
    const validScene = Math.max(0, Math.min(15, sceneNumber));
    const cmdByte = 0x40 + validScene;
    const addrByte = this.encodeAddressByte(type, address, true);
    return [addrByte, cmdByte];
  }

  static encodeRecallScene(type, address, sceneNumber) {
    const validScene = Math.max(0, Math.min(15, sceneNumber));
    const cmdByte = 0x30 + validScene;
    const addrByte = this.encodeAddressByte(type, address, true);
    return [addrByte, cmdByte];
  }

  static encodeRemoveFromScene(type, address, sceneNumber) {
    const validScene = Math.max(0, Math.min(15, sceneNumber));
    const cmdByte = 0x50 + validScene;
    const addrByte = this.encodeAddressByte(type, address, true);
    return [addrByte, cmdByte];
  }

  static encodeAddToGroup(type, address, groupNumber) {
    const validGroup = Math.max(0, Math.min(15, groupNumber));
    const cmdByte = 0x60 + validGroup;
    const addrByte = this.encodeAddressByte(type, address, true);
    return [addrByte, cmdByte];
  }

  static encodeRemoveFromGroup(type, address, groupNumber) {
    const validGroup = Math.max(0, Math.min(15, groupNumber));
    const cmdByte = 0x70 + validGroup;
    const addrByte = this.encodeAddressByte(type, address, true);
    return [addrByte, cmdByte];
  }

  static encodeQuerySceneLevel(type, address, sceneNumber) {
    const validScene = Math.max(0, Math.min(15, sceneNumber));
    return { dtr0Value: validScene, dtr0Frame: this.encodeIndirectCommand(type, address, 0xA3), queryFrame: this.encodeIndirectCommand(type, address, 0xB0) };
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 780,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile('index.html');
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

async function getSerialPorts() {
  try {
    const ports = await SerialPort.list();
    return ports.map(p => ({
      path: p.path,
      manufacturer: p.manufacturer || 'Unknown',
      friendlyName: p.friendlyName || p.path
    }));
  } catch (error) {
    console.error('获取串口列表失败:', error);
    return [];
  }
}

function openSerialPort(portPath, baudRate = 9600) {
  return new Promise((resolve, reject) => {
    if (serialPort && serialPort.isOpen) {
      serialPort.close();
    }

    serialPort = new SerialPort({
      path: portPath,
      baudRate: baudRate,
      dataBits: 8,
      stopBits: 1,
      parity: 'none'
    });

    serialPort.on('open', () => {
      isSimulationMode = false;
      resolve({ success: true, port: portPath });
    });

    serialPort.on('data', (data) => {
      const parsed = DALIProtocol.parseBackwardFrame(data);
      if (mainWindow) {
        mainWindow.webContents.send('serial-data', parsed);
      }
    });

    serialPort.on('error', (error) => {
      reject(error);
    });

    serialPort.on('close', () => {
      if (mainWindow) {
        mainWindow.webContents.send('serial-closed');
      }
    });
  });
}

function closeSerialPort() {
  if (serialPort && serialPort.isOpen) {
    serialPort.close();
    serialPort = null;
  }
  isSimulationMode = true;
}

function startSmoothFade(targetLevel, fadeTimeSeconds) {
  if (simulationState.fadeTimer) {
    clearInterval(simulationState.fadeTimer);
    simulationState.fadeTimer = null;
  }

  simulationState.targetLevel = Math.max(0, Math.min(254, targetLevel));
  const startLevel = simulationState.displayLevel;

  if (fadeTimeSeconds <= 0 || Math.abs(startLevel - simulationState.targetLevel) < 1) {
    simulationState.displayLevel = simulationState.targetLevel;
    simulationState.actualLevel = simulationState.targetLevel;
    if (mainWindow) {
      mainWindow.webContents.send('dali-level-update', simulationState.displayLevel);
    }
    return;
  }

  const steps = Math.max(1, Math.round(fadeTimeSeconds * 30));
  const levelDelta = simulationState.targetLevel - startLevel;
  const intervalMs = (fadeTimeSeconds * 1000) / steps;
  let step = 0;

  simulationState.fadeTimer = setInterval(() => {
    step++;
    if (step >= steps) {
      clearInterval(simulationState.fadeTimer);
      simulationState.fadeTimer = null;
      simulationState.displayLevel = simulationState.targetLevel;
      simulationState.actualLevel = simulationState.targetLevel;
    } else {
      const progress = step / steps;
      const eased = progress < 0.5
        ? 2 * progress * progress
        : 1 - Math.pow(-2 * progress + 2, 2) / 2;
      simulationState.displayLevel = Math.round(startLevel + levelDelta * eased);
      simulationState.actualLevel = simulationState.displayLevel;
    }

    if (mainWindow) {
      mainWindow.webContents.send('dali-level-update', simulationState.displayLevel);
    }
  }, intervalMs);
}

function processSimulatedCommand(addrByte, cmdByte) {
  const addrInfo = DALIProtocol.decodeAddressByte(addrByte);

  setTimeout(() => {
    if (!addrInfo.isCommand && cmdByte <= 254) {
      if (!simulationState.lampFailure && simulationState.lampPower) {
        const fadeTimeSec = DALIProtocol.getFadeTimeSeconds(simulationState.fadeTime);
        startSmoothFade(cmdByte, fadeTimeSec);

        if (mainWindow) {
          mainWindow.webContents.send('serial-data', {
            type: 'FADE_START',
            targetLevel: cmdByte,
            fadeTime: fadeTimeSec,
            description: DALIProtocol.getFadeTimeDescription(simulationState.fadeTime)
          });
        }
      } else {
        if (mainWindow) {
          mainWindow.webContents.send('serial-data', {
            type: 'NO_RESPONSE',
            reason: simulationState.lampFailure ? '灯具故障' : '灯具未通电'
          });
        }
      }
      return;
    }

    let simulatedResponse = null;
    let customEvent = null;

    if (cmdByte >= 0x10 && cmdByte <= 0x1F) {
      const sceneNum = cmdByte - 0x10;
      const sceneLevel = simulationState.scenes[sceneNum];
      if (sceneLevel !== null) {
        const fadeTimeSec = DALIProtocol.getFadeTimeSeconds(simulationState.fadeTime);
        startSmoothFade(sceneLevel, fadeTimeSec);
        customEvent = { type: 'SCENE_RECALLED', sceneNumber: sceneNum, level: sceneLevel };
      } else {
        customEvent = { type: 'SCENE_EMPTY', sceneNumber: sceneNum };
      }
    } else if (cmdByte >= 0x20 && cmdByte <= 0x2F) {
      const sceneNum = cmdByte - 0x20;
      const levelToStore = simulationState.actualLevel;
      simulationState.scenes[sceneNum] = levelToStore;
      customEvent = { type: 'SCENE_STORED', sceneNumber: sceneNum, level: levelToStore };
    } else if (cmdByte >= 0x30 && cmdByte <= 0x3F) {
      const sceneNum = cmdByte - 0x30;
      simulationState.scenes[sceneNum] = null;
      customEvent = { type: 'SCENE_REMOVED', sceneNumber: sceneNum };
    }

    switch (cmdByte) {
      case 0x00:
        startSmoothFade(0, DALIProtocol.getFadeTimeSeconds(simulationState.fadeTime));
        customEvent = { type: 'LAMP_OFF' };
        break;
      case 0x05:
        startSmoothFade(simulationState.maxLevel, DALIProtocol.getFadeTimeSeconds(simulationState.fadeTime));
        break;
      case 0x06:
        startSmoothFade(simulationState.minLevel, DALIProtocol.getFadeTimeSeconds(simulationState.fadeTime));
        break;
      case 0x20:
        simulationState.resetState = true;
        simulationState.actualLevel = simulationState.minLevel;
        simulationState.displayLevel = simulationState.minLevel;
        simulationState.targetLevel = simulationState.minLevel;
        customEvent = { type: 'RESET' };
        break;
      case 0xA3:
        break;
      case 0xA1:
        simulationState.fadeTime = simulationState.dtr0 & 0x0F;
        if (mainWindow) {
          mainWindow.webContents.send('dali-fade-time-update', {
            fadeTime: simulationState.fadeTime,
            description: DALIProtocol.getFadeTimeDescription(simulationState.fadeTime)
          });
        }
        break;
      case 0xA2:
        simulationState.fadeRate = simulationState.dtr0 & 0x0F;
        break;
      case 0xA0:
      case 0x40:
        simulatedResponse = DALIProtocol.parseBackwardFrame([simulationState.actualLevel]);
        break;
      case 0x90:
      case 0x30:
        simulatedResponse = DALIProtocol.parseBackwardFrame([DALIProtocol.buildStatusByte(simulationState)]);
        break;
      case 0x32:
        simulatedResponse = DALIProtocol.parseBackwardFrame([simulationState.lampFailure ? 0xFF : 0x00]);
        break;
      case 0x33:
        simulatedResponse = DALIProtocol.parseBackwardFrame([simulationState.lampPower ? 0xFF : 0x00]);
        break;
      case 0x31:
        simulatedResponse = DALIProtocol.parseBackwardFrame([simulationState.controlGearPresent ? 0xFF : 0x00]);
        break;
      case 0x34:
        simulatedResponse = DALIProtocol.parseBackwardFrame([simulationState.limitError ? 0xFF : 0x00]);
        break;
      case 0x35:
        simulatedResponse = DALIProtocol.parseBackwardFrame([simulationState.resetState ? 0xFF : 0x00]);
        break;
      case 0x36:
        simulatedResponse = DALIProtocol.parseBackwardFrame([simulationState.missingShortAddress ? 0xFF : 0x00]);
        break;
      case 0x3B:
        simulatedResponse = DALIProtocol.parseBackwardFrame([simulationState.powerFailure ? 0xFF : 0x00]);
        break;
      case 0x3A:
        simulatedResponse = DALIProtocol.parseBackwardFrame([simulationState.physicalMinLevel]);
        break;
      case 0x39:
        simulatedResponse = DALIProtocol.parseBackwardFrame([simulationState.deviceType]);
        break;
      case 0x37:
        simulatedResponse = DALIProtocol.parseBackwardFrame([simulationState.versionNumber]);
        break;
      case 0xA5:
      case 0x45:
        simulatedResponse = DALIProtocol.parseBackwardFrame([(simulationState.fadeTime << 4) | (simulationState.fadeRate & 0x0F)]);
        break;
      case 0xA6:
      case 0x46:
        simulatedResponse = DALIProtocol.parseBackwardFrame([simulationState.fadeRate & 0x0F]);
        break;
      case 0x38:
        simulatedResponse = DALIProtocol.parseBackwardFrame([simulationState.dtr0]);
        break;
      case 0xB0:
        const qSceneNum = simulationState.dtr0 & 0x0F;
        const qLevel = simulationState.scenes[qSceneNum];
        simulatedResponse = DALIProtocol.parseBackwardFrame([qLevel !== null ? qLevel : 0xFF]);
        break;
      default:
        break;
    }

    if (mainWindow) {
      if (simulatedResponse) {
        if (simulatedResponse.type === 'RESPONSE' && (cmdByte === 0x30 || cmdByte === 0x90)) {
          const statusInfo = DALIProtocol.parseStatusByte(simulatedResponse.value);
          const powerWatts = DALIProtocol.getPowerWatts(simulationState.actualLevel);
          mainWindow.webContents.send('serial-data', {
            ...simulatedResponse,
            statusInfo,
            powerWatts,
            actualLevel: simulationState.actualLevel
          });
        } else {
          mainWindow.webContents.send('serial-data', simulatedResponse);
        }
      }
      if (customEvent) {
        mainWindow.webContents.send('serial-data', customEvent);
      }
      mainWindow.webContents.send('dali-simulation-state-update', {
        actualLevel: simulationState.actualLevel,
        lampPower: simulationState.lampPower,
        lampFailure: simulationState.lampFailure,
        powerWatts: DALIProtocol.getPowerWatts(simulationState.actualLevel),
        scenes: [...simulationState.scenes]
      });
    }
  }, 100);
}

function sendDALICommand(addrByte, cmdByte) {
  const frame = [addrByte & 0xFF, cmdByte & 0xFF];
  const description = DALIProtocol.getCommandDescription(addrByte, cmdByte);

  if (isSimulationMode) {
    processSimulatedCommand(addrByte, cmdByte);
    return {
      success: true,
      frame: frame,
      description: description,
      mode: 'simulation'
    };
  }

  if (serialPort && serialPort.isOpen) {
    serialPort.write(Buffer.from(frame));
    return {
      success: true,
      frame: frame,
      description: description,
      mode: 'serial'
    };
  }

  return { success: false, error: '串口未打开' };
}

ipcMain.handle('get-serial-ports', async () => {
  return await getSerialPorts();
});

ipcMain.handle('open-serial-port', async (event, portPath, baudRate) => {
  try {
    return await openSerialPort(portPath, baudRate);
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('close-serial-port', () => {
  closeSerialPort();
  return { success: true };
});

ipcMain.handle('send-dali-command', (event, addrByte, cmdByte) => {
  return sendDALICommand(addrByte, cmdByte);
});

ipcMain.handle('send-dimmer-command', (event, addrType, address, level) => {
  const frame = DALIProtocol.encodeDAPC(addrType, address, level);
  return sendDALICommand(frame[0], frame[1]);
});

ipcMain.handle('send-fade-time-command', (event, addrType, address, fadeTime) => {
  const { dtr0Value, dtr0Frame, setFadeTimeFrame } = DALIProtocol.encodeSetFadeTime(addrType, address, fadeTime);
  simulationState.dtr0 = dtr0Value;
  const dtr0Result = sendDALICommand(dtr0Frame[0], dtr0Frame[1]);
  const fadeResult = sendDALICommand(setFadeTimeFrame[0], setFadeTimeFrame[1]);
  return {
    success: dtr0Result.success && fadeResult.success,
    dtr0Frame: dtr0Result.frame,
    setFadeTimeFrame: fadeResult.frame,
    dtr0Value: dtr0Value
  };
});

ipcMain.handle('query-level', (event, addrType, address) => {
  const frame = DALIProtocol.encodeIndirectCommand(addrType, address, 0xA0);
  return sendDALICommand(frame[0], frame[1]);
});

ipcMain.handle('query-fade-time', (event, addrType, address) => {
  const frame = DALIProtocol.encodeIndirectCommand(addrType, address, 0xA5);
  return sendDALICommand(frame[0], frame[1]);
});

ipcMain.handle('get-simulation-status', () => {
  return {
    isSimulationMode,
    actualLevel: simulationState.actualLevel,
    fadeTime: simulationState.fadeTime,
    fadeRate: simulationState.fadeRate
  };
});

ipcMain.handle('encode-dali-frame', (event, addrType, address, command, isCommand) => {
  const addrByte = DALIProtocol.encodeAddressByte(addrType, address, isCommand);
  return {
    addrByte,
    cmdByte: command & 0xFF,
    frame: [addrByte, command & 0xFF],
    addrInfo: DALIProtocol.decodeAddressByte(addrByte),
    description: DALIProtocol.getCommandDescription(addrByte, command)
  };
});

ipcMain.handle('query-status', (event, addrType, address) => {
  const frame = DALIProtocol.encodeIndirectCommand(addrType, address, 0x90);
  return sendDALICommand(frame[0], frame[1]);
});

ipcMain.handle('query-lamp-power', (event, addrType, address) => {
  const frame = DALIProtocol.encodeIndirectCommand(addrType, address, 0x33);
  return sendDALICommand(frame[0], frame[1]);
});

ipcMain.handle('query-lamp-failure', (event, addrType, address) => {
  const frame = DALIProtocol.encodeIndirectCommand(addrType, address, 0x32);
  return sendDALICommand(frame[0], frame[1]);
});

ipcMain.handle('store-scene', (event, addrType, address, sceneNumber) => {
  const frame = DALIProtocol.encodeStoreScene(addrType, address, sceneNumber);
  return sendDALICommand(frame[0], frame[1]);
});

ipcMain.handle('recall-scene', (event, addrType, address, sceneNumber) => {
  const frame = DALIProtocol.encodeRecallScene(addrType, address, sceneNumber);
  return sendDALICommand(frame[0], frame[1]);
});

ipcMain.handle('remove-scene', (event, addrType, address, sceneNumber) => {
  const frame = DALIProtocol.encodeRemoveFromScene(addrType, address, sceneNumber);
  return sendDALICommand(frame[0], frame[1]);
});

ipcMain.handle('query-scene-level', (event, addrType, address, sceneNumber) => {
  const { dtr0Value, dtr0Frame, queryFrame } = DALIProtocol.encodeQuerySceneLevel(addrType, address, sceneNumber);
  simulationState.dtr0 = dtr0Value;
  const dtr0Result = sendDALICommand(dtr0Frame[0], dtr0Frame[1]);
  const queryResult = sendDALICommand(queryFrame[0], queryFrame[1]);
  return {
    success: dtr0Result.success && queryResult.success,
    sceneNumber: dtr0Value,
    dtr0Frame: dtr0Result.frame,
    queryFrame: queryResult.frame
  };
});

ipcMain.handle('set-simulation-lamp-power', (event, powerOn) => {
  simulationState.lampPower = !!powerOn;
  if (mainWindow) {
    mainWindow.webContents.send('dali-simulation-state-update', {
      lampPower: simulationState.lampPower,
      actualLevel: simulationState.actualLevel,
      powerWatts: DALIProtocol.getPowerWatts(simulationState.actualLevel)
    });
  }
  return { success: true, lampPower: simulationState.lampPower };
});

ipcMain.handle('set-simulation-lamp-failure', (event, failure) => {
  simulationState.lampFailure = !!failure;
  if (mainWindow) {
    mainWindow.webContents.send('dali-simulation-state-update', {
      lampFailure: simulationState.lampFailure
    });
  }
  return { success: true, lampFailure: simulationState.lampFailure };
});

ipcMain.handle('get-all-scenes', () => {
  return [...simulationState.scenes];
});

ipcMain.handle('parse-status-byte', (event, statusByte) => {
  return DALIProtocol.parseStatusByte(statusByte);
});

ipcMain.handle('get-power-watts', (event, level) => {
  return DALIProtocol.getPowerWatts(level);
});

module.exports = { DALIProtocol, FADE_TIME_TABLE };
