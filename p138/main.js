const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { exec, spawn } = require('child_process');
const { parseCECMessage, buildCECMessage, getOpcodeList, getDeviceList } = require('./src/cecParser');
const { parseEDID, validateEDID, getSupportedResolutions } = require('./src/edidParser');

let mainWindow;
let cecProcess = null;
let isConnected = false;
let isSimulating = false;
let simulationInterval = null;

const MAX_PENDING_MESSAGES = 100;
const DEDUP_WINDOW_MS = 3000;
const ARBITRATION_RETRY_COUNT = 3;
const ARBITRATION_RETRY_DELAY_MS = 500;

const pendingMessages = [];
const recentMessageHashes = new Map();
const pendingAckMessages = new Map();

let autoSwitchRules = [
  { id: 1, name: '游戏机优先', sourceDevice: 0x4, targetDevice: 0x0, priority: 1, enabled: true },
  { id: 2, name: '播放设备激活', sourceDevice: 0x8, targetDevice: 0x0, priority: 2, enabled: true }
];

let activeSource = null;
let edidInfo = null;

let stats = {
  totalMessages: 0,
  duplicateMessages: 0,
  arbitrationRetries: 0,
  sentMessages: 0
};

function getMessageHash(message) {
  const paramsKey = message.parameters ? message.parameters.join(',') : '';
  return `${message.initiator}-${message.destination}-${message.opcode}-${paramsKey}`;
}

function isDuplicateMessage(parsed) {
  const hash = getMessageHash(parsed);
  const now = Date.now();

  for (const [h, timestamp] of recentMessageHashes) {
    if (now - timestamp > DEDUP_WINDOW_MS) {
      recentMessageHashes.delete(h);
    }
  }

  if (recentMessageHashes.has(hash)) {
    const timeDiff = now - recentMessageHashes.get(hash);
    if (timeDiff < DEDUP_WINDOW_MS) {
      stats.duplicateMessages++;
      updateStats();
      return true;
    }
  }

  recentMessageHashes.set(hash, now);
  return false;
}

function cleanupOldHashes() {
  const now = Date.now();
  for (const [hash, timestamp] of recentMessageHashes) {
    if (now - timestamp > DEDUP_WINDOW_MS * 2) {
      recentMessageHashes.delete(hash);
    }
  }
}
setInterval(cleanupOldHashes, DEDUP_WINDOW_MS * 2);

async function sendWithRetry(rawMessage, retryCount = 0) {
  const messageId = `${rawMessage}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  return new Promise((resolve, reject) => {
    if (retryCount >= ARBITRATION_RETRY_COUNT) {
      reject(new Error(`仲裁失败，已重试${ARBITRATION_RETRY_COUNT}次`));
      return;
    }

    if (cecProcess && cecProcess.stdin) {
      const sendTime = Date.now();
      const expectedEcho = rawMessage.toUpperCase();

      const onMessage = (data) => {
        const output = data.toString();
        if (output.includes('transmit succeeded') || 
            output.includes('TX succeeded') ||
            output.includes('message transmitted')) {
          cleanup();
          resolve({ success: true });
          return;
        }

        if (output.includes(expectedEcho) && 
            output.includes('tx:') && 
            (Date.now() - sendTime) > 50) {
          cleanup();
          resolve({ success: true });
          return;
        }

        if (output.includes('arbitration failed') ||
            output.includes('ARBITRATION_FAILED') ||
            output.includes('tx failed')) {
          cleanup();
          stats.arbitrationRetries++;
          updateStats();
          setTimeout(() => {
            sendWithRetry(rawMessage, retryCount + 1)
              .then(resolve)
              .catch(reject);
          }, ARBITRATION_RETRY_DELAY_MS);
        }
      };

      const timeoutId = setTimeout(() => {
        cleanup();
        stats.arbitrationRetries++;
        updateStats();
        sendWithRetry(rawMessage, retryCount + 1)
          .then(resolve)
          .catch(reject);
      }, ARBITRATION_RETRY_DELAY_MS);

      const cleanup = () => {
        clearTimeout(timeoutId);
        if (cecProcess && cecProcess.stdout) {
          cecProcess.stdout.removeListener('data', onMessage);
        }
        pendingAckMessages.delete(messageId);
      };

      pendingAckMessages.set(messageId, { timeoutId, resolve, reject, cleanup });
      cecProcess.stdout.on('data', onMessage);
      cecProcess.stdin.write(`tx ${rawMessage}\n`);
    } else {
      reject(new Error('未连接'));
    }
  });
}

function updateStats() {
  if (mainWindow) {
    mainWindow.webContents.send('cec:stats', stats);
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      enableRemoteModule: true
    },
    icon: path.join(__dirname, 'assets', 'icon.png')
  });

  mainWindow.loadFile('index.html');

  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
    stopCEC();
  });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

ipcMain.handle('cec:connect', async () => {
  try {
    if (isConnected || isSimulating) {
      return { success: false, message: '已连接' };
    }

    const result = await tryStartCEC();
    if (!result.success) {
      startSimulation();
      return { success: true, message: '未检测到CEC适配器，已启动模拟模式', simulating: true };
    }
    return result;
  } catch (error) {
    startSimulation();
    return { success: true, message: '未检测到CEC适配器，已启动模拟模式', simulating: true };
  }
});

ipcMain.handle('cec:disconnect', async () => {
  stopCEC();
  stopSimulation();
  return { success: true };
});

ipcMain.handle('cec:send', async (event, message) => {
  try {
    const trimmedMessage = message.trim().toUpperCase();

    if (isSimulating) {
      const parsed = parseCECMessage(trimmedMessage);
      if (parsed) {
        parsed.direction = 'out';
        setTimeout(() => {
          if (!isDuplicateMessage(parsed)) {
            stats.sentMessages++;
            stats.totalMessages++;
            updateStats();
            mainWindow.webContents.send('cec:message', parsed);
          }
        }, 100);
      }
      return { success: true, simulating: true };
    }

    if (cecProcess && cecProcess.stdin) {
      const parsed = parseCECMessage(trimmedMessage);
      if (parsed) {
        parsed.direction = 'out';
        recentMessageHashes.set(getMessageHash(parsed), Date.now());
      }

      try {
        await sendWithRetry(trimmedMessage);
        stats.sentMessages++;
        updateStats();
        return { success: true };
      } catch (retryError) {
        return { success: false, error: retryError.message };
      }
    }
    return { success: false, error: '未连接' };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('cec:sendCustom', async (event, { initiator, destination, opcode, params }) => {
  const message = buildCECMessage(initiator, destination, opcode, params);
  return await ipcMain.handlers['cec:send'](event, message);
});

ipcMain.handle('cec:status', () => {
  return {
    connected: isConnected,
    simulating: isSimulating
  };
});

ipcMain.handle('cec:getOpcodes', () => {
  return getOpcodeList();
});

ipcMain.handle('cec:getDevices', () => {
  return getDeviceList();
});

ipcMain.handle('cec:getStats', () => {
  return stats;
});

ipcMain.handle('cec:resetStats', () => {
  stats = {
    totalMessages: 0,
    duplicateMessages: 0,
    arbitrationRetries: 0,
    sentMessages: 0
  };
  updateStats();
  return stats;
});

ipcMain.handle('edid:parse', async (event, edidHex) => {
  try {
    const result = parseEDID(edidHex);
    if (result.valid) {
      edidInfo = result;
      result.supportedResolutions = getSupportedResolutions(result);
      return { success: true, data: result };
    }
    return { success: false, error: result.error };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('edid:getInfo', () => {
  if (edidInfo) {
    return { success: true, data: edidInfo };
  }
  return { success: false, error: '暂无EDID信息' };
});

ipcMain.handle('edid:detectHDMI', async () => {
  return new Promise((resolve) => {
    exec('ioreg -l -w0 | grep -i "EDID"', (error, stdout) => {
      if (error || !stdout) {
        resolve({ success: false, error: '未检测到显示器' });
        return;
      }
      
      const edidMatch = stdout.match(/([0-9A-Fa-f]{256})/);
      if (edidMatch) {
        const parsed = parseEDID(edidMatch[1]);
        if (parsed.valid) {
          edidInfo = parsed;
          edidInfo.supportedResolutions = getSupportedResolutions(parsed);
          resolve({ success: true, data: edidInfo });
        } else {
          resolve({ success: false, error: 'EDID解析失败' });
        }
      } else {
        resolve({ success: false, error: '未找到EDID数据' });
      }
    });
  });
});

ipcMain.handle('source:getRules', () => {
  return { success: true, rules: autoSwitchRules };
});

ipcMain.handle('source:addRule', async (event, rule) => {
  const newRule = {
    ...rule,
    id: Date.now(),
    enabled: true
  };
  autoSwitchRules.push(newRule);
  autoSwitchRules.sort((a, b) => a.priority - b.priority);
  return { success: true, rule: newRule };
});

ipcMain.handle('source:updateRule', async (event, rule) => {
  const index = autoSwitchRules.findIndex(r => r.id === rule.id);
  if (index !== -1) {
    autoSwitchRules[index] = { ...autoSwitchRules[index], ...rule };
    autoSwitchRules.sort((a, b) => a.priority - b.priority);
    return { success: true, rule: autoSwitchRules[index] };
  }
  return { success: false, error: '规则不存在' };
});

ipcMain.handle('source:deleteRule', async (event, ruleId) => {
  const index = autoSwitchRules.findIndex(r => r.id === ruleId);
  if (index !== -1) {
    autoSwitchRules.splice(index, 1);
    return { success: true };
  }
  return { success: false, error: '规则不存在' };
});

ipcMain.handle('source:getActiveSource', () => {
  return { success: true, activeSource };
});

ipcMain.handle('export:messages', async (event, format) => {
  try {
    const messages = pendingMessages.map(m => ({
      timestamp: m.timestamp,
      direction: m.direction,
      initiator: m.initiatorName,
      initiatorAddr: m.initiator,
      destination: m.destinationName,
      destinationAddr: m.destination,
      opcode: m.opcodeName,
      opcodeHex: m.opcodeHex,
      category: m.category,
      description: m.description,
      parameters: m.paramDetails,
      raw: m.raw
    }));

    let content, filename, filters;

    if (format === 'csv') {
      const headers = ['时间戳', '方向', '发起设备', '发起地址', '目标设备', '目标地址', '操作码', '操作码HEX', '分类', '描述', '参数', '原始数据'];
      const rows = messages.map(m => [
        m.timestamp,
        m.direction === 'out' ? '发送' : '接收',
        m.initiator,
        `0x${m.initiatorAddr.toString(16)}`,
        m.destination,
        `0x${m.destinationAddr.toString(16)}`,
        m.opcode,
        m.opcodeHex,
        m.category,
        m.description,
        m.parameters,
        m.raw
      ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(','));
      
      content = '\uFEFF' + [headers.join(','), ...rows].join('\n');
      filename = `cec-messages-${Date.now()}.csv`;
      filters = [{ name: 'CSV文件', extensions: ['csv'] }];
    } else {
      content = JSON.stringify({
        exportTime: new Date().toISOString(),
        totalCount: messages.length,
        messages: messages
      }, null, 2);
      filename = `cec-messages-${Date.now()}.json`;
      filters = [{ name: 'JSON文件', extensions: ['json'] }];
    }

    const { filePath } = await dialog.showSaveDialog(mainWindow, {
      title: '导出消息记录',
      defaultPath: path.join(app.getPath('documents'), filename),
      filters: filters
    });

    if (filePath) {
      fs.writeFileSync(filePath, content, 'utf-8');
      return { success: true, path: filePath };
    }
    
    return { success: false, error: '用户取消保存' };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

function tryStartCEC() {
  return new Promise((resolve) => {
    exec('which cec-client', (error) => {
      if (error) {
        resolve({ success: false });
        return;
      }

      cecProcess = spawn('cec-client', ['-m', '-d', '8'], {
        stdio: ['pipe', 'pipe', 'pipe']
      });

      cecProcess.stdout.on('data', (data) => {
        const lines = data.toString().split('\n');
        lines.forEach(line => {
          const trimmedLine = line.trim();

          if (trimmedLine.includes('transmit succeeded') || 
              trimmedLine.includes('TX succeeded') ||
              trimmedLine.includes('message transmitted')) {
            for (const [id, pending] of pendingAckMessages) {
              clearTimeout(pending.timeoutId);
              pending.resolve({ success: true });
              pendingAckMessages.delete(id);
            }
            return;
          }

          if (trimmedLine.includes('arbitration failed') ||
              trimmedLine.includes('ARBITRATION_FAILED') ||
              trimmedLine.includes('tx failed')) {
            return;
          }

          if (trimmedLine.includes('>>') || trimmedLine.includes('tx:')) {
            const match = trimmedLine.match(/([0-9A-Fa-f]{4,})/);
            if (match) {
              const parsed = parseCECMessage(match[1]);
              if (parsed) {
                parsed.direction = trimmedLine.includes('tx:') ? 'out' : 'in';

                if (isDuplicateMessage(parsed)) {
                  return;
                }

                stats.totalMessages++;
                updateStats();

                if (mainWindow) {
                  mainWindow.webContents.send('cec:message', parsed);
                }

                if (pendingMessages.length >= MAX_PENDING_MESSAGES) {
                  pendingMessages.shift();
                }
                pendingMessages.push({ ...parsed, receivedAt: Date.now() });
              }
            }
          }
        });
      });

      cecProcess.stderr.on('data', (data) => {
        console.error(`CEC Error: ${data}`);
      });

      cecProcess.on('close', (code) => {
        isConnected = false;
        if (mainWindow) {
          mainWindow.webContents.send('cec:status', { connected: false });
        }
      });

      setTimeout(() => {
        isConnected = true;
        resolve({ success: true });
      }, 1000);
    });
  });
}

function stopCEC() {
  for (const [id, pending] of pendingAckMessages) {
    if (typeof pending.cleanup === 'function') {
      pending.cleanup();
    }
    clearTimeout(pending.timeoutId);
    pending.reject(new Error('连接已断开'));
  }
  pendingAckMessages.clear();

  if (cecProcess) {
    cecProcess.stdout.removeAllListeners('data');
    cecProcess.stderr.removeAllListeners('data');
    cecProcess.removeAllListeners('close');
    
    try {
      cecProcess.stdin.end();
    } catch (e) {}
    
    cecProcess.kill('SIGTERM');
    setTimeout(() => {
      if (cecProcess && !cecProcess.killed) {
        cecProcess.kill('SIGKILL');
      }
    }, 1000);
    
    cecProcess = null;
  }

  pendingMessages.length = 0;
  recentMessageHashes.clear();

  isConnected = false;
}

const SIMULATED_MESSAGES = [
  { initiator: 0x0, destination: 0xF, opcode: 0x82, params: [0x10, 0x00] },
  { initiator: 0x4, destination: 0x0, opcode: 0x04, params: [] },
  { initiator: 0x0, destination: 0x4, opcode: 0x8B, params: [0x00] },
  { initiator: 0x4, destination: 0x0, opcode: 0x6B, params: [0x05] },
  { initiator: 0x0, destination: 0xF, opcode: 0x44, params: [0x00, 0x15, 0x82] },
  { initiator: 0x4, destination: 0x0, opcode: 0x41, params: [0x30] },
  { initiator: 0x4, destination: 0x0, opcode: 0x42, params: [] },
  { initiator: 0x0, destination: 0x4, opcode: 0x36, params: [] },
  { initiator: 0x5, destination: 0x0, opcode: 0x70, params: [0x40, 0x00] },
  { initiator: 0x0, destination: 0x5, opcode: 0x86, params: [0x65, 0x6E, 0x67] },
  { initiator: 0x4, destination: 0x0, opcode: 0x41, params: [0x01] },
  { initiator: 0x4, destination: 0x0, opcode: 0x42, params: [] },
  { initiator: 0x4, destination: 0x0, opcode: 0x0D, params: [] }
];

function startSimulation() {
  isSimulating = true;
  let msgIndex = 0;

  simulationInterval = setInterval(() => {
    if (!mainWindow) return;

    const msg = SIMULATED_MESSAGES[msgIndex % SIMULATED_MESSAGES.length];
    const rawMessage = buildCECMessage(msg.initiator, msg.destination, msg.opcode, msg.params);
    const parsed = parseCECMessage(rawMessage);
    
    if (parsed) {
      parsed.direction = 'in';
      
      if (!isDuplicateMessage(parsed)) {
        stats.totalMessages++;
        updateStats();
        mainWindow.webContents.send('cec:message', parsed);
      }
    }

    msgIndex++;
    
    if (msgIndex >= 20) {
      msgIndex = 0;
    }
  }, 2000);

  if (mainWindow) {
    mainWindow.webContents.send('cec:status', { connected: true, simulating: true });
  }
}

function stopSimulation() {
  isSimulating = false;
  if (simulationInterval) {
    clearInterval(simulationInterval);
    simulationInterval = null;
  }
  recentMessageHashes.clear();
}
