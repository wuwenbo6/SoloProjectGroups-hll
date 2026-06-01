const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn, execSync } = require('child_process');
const os = require('os');

let mainWindow;
let wevtutilProcess = null;
let realTimeProcess = null;
let isMonitoring = false;
let isAdmin = false;

const AGGREGATION_WINDOW = 5 * 60 * 1000;
const eventCache = new Map();
let threatIntel = null;

const SECURITY_EVENT_IDS = {
  4624: '登录成功',
  4625: '登录失败',
  4634: '注销',
  4647: '用户发起注销',
  4688: '进程创建',
  4689: '进程退出',
  4672: '特殊登录',
  4627: '登录时组成员身份信息'
};

function loadThreatIntel() {
  try {
    const intelPath = path.join(__dirname, 'malicious_hashes.json');
    if (fs.existsSync(intelPath)) {
      const data = fs.readFileSync(intelPath, 'utf-8');
      threatIntel = JSON.parse(data);
      console.log('威胁情报库加载成功');
    }
  } catch (error) {
    console.error('加载威胁情报库失败:', error);
  }
}

function matchThreatIntel(event) {
  if (!threatIntel) return null;

  const result = {
    matched: false,
    matches: []
  };

  if (event.id === 4688 && event.details) {
    let processName = event.details.NewProcessName || '';
    processName = processName.split('\\').pop().toLowerCase();
    
    if (processName && threatIntel.processNames && threatIntel.processNames[processName]) {
      const match = threatIntel.processNames[processName];
      result.matched = true;
      result.matches.push({
        type: 'process_name',
        name: processName,
        threat: match.threat,
        severity: match.severity,
        description: match.description
      });
    }

    if (event.details.ProcessHash) {
      const hash = event.details.ProcessHash.toLowerCase();
      
      if (threatIntel.hashes) {
        for (const [hashType, hashes] of Object.entries(threatIntel.hashes)) {
          if (hashes[hash]) {
            const match = hashes[hash];
            result.matched = true;
            result.matches.push({
              type: 'hash',
              hashType: hashType.toUpperCase(),
              hash: hash,
              name: match.name,
              threat: match.threat,
              severity: match.severity,
              description: match.description
            });
          }
        }
      }
    }
  }

  if (event.id === 4625 && event.details) {
    const failureCount = eventCache.get(`login_fail_${event.details.TargetUserName}`) || 0;
    if (failureCount >= 5) {
      result.matched = true;
      result.matches.push({
        type: 'brute_force',
        name: event.details.TargetUserName || 'Unknown',
        threat: 'Potential Brute Force Attack',
        severity: 'high',
        description: `检测到 ${failureCount} 次失败登录尝试`
      });
    }
  }

  if (result.matched) {
    result.maxSeverity = result.matches.reduce((max, m) => {
      const severityOrder = { info: 0, low: 1, medium: 2, high: 3, critical: 4 };
      return severityOrder[m.severity] > severityOrder[max] ? m.severity : max;
    }, 'info');
  }

  return result.matched ? result : null;
}

function generateEventKey(event) {
  let key = `evt_${event.id}`;
  
  if (event.id === 4624 || event.id === 4625) {
    key += `_${event.details.TargetUserName || 'unknown'}_${event.details.IpAddress || 'unknown'}`;
  } else if (event.id === 4688) {
    key += `_${event.details.NewProcessName || 'unknown'}_${event.details.ParentProcessName || 'unknown'}`;
  } else if (event.id === 4634 || event.id === 4647) {
    key += `_${event.details.TargetUserName || 'unknown'}`;
  } else {
    key += `_${event.message}`;
  }
  
  return key;
}

function processEventAggregation(event) {
  const key = generateEventKey(event);
  const now = Date.now();
  const cached = eventCache.get(key);
  
  if (cached && (now - cached.timestamp) < AGGREGATION_WINDOW) {
    cached.count++;
    cached.timestamp = now;
    cached.lastTime = event.time;
    event.aggregated = true;
    event.aggregationKey = key;
    event.aggregationCount = cached.count;
    event.firstSeen = cached.firstTime;
    event.lastSeen = event.time;
    return event;
  }
  
  eventCache.set(key, {
    timestamp: now,
    count: 1,
    firstTime: event.time
  });
  event.aggregated = false;
  event.aggregationKey = key;
  event.aggregationCount = 1;
  event.firstSeen = event.time;
  event.lastSeen = event.time;
  
  if (event.id === 4625 && event.details) {
    const failKey = `login_fail_${event.details.TargetUserName}`;
    const failCount = eventCache.get(failKey) || 0;
    eventCache.set(failKey, failCount + 1);
  }
  
  return event;
}

function cleanupOldCache() {
  const now = Date.now();
  for (const [key, value] of eventCache.entries()) {
    if (!key.startsWith('evt_')) continue;
    if ((now - value.timestamp) > AGGREGATION_WINDOW) {
      eventCache.delete(key);
    }
  }
}

setInterval(cleanupOldCache, 60 * 1000);

function checkAdminPrivileges() {
  if (process.platform !== 'win32') {
    return true;
  }
  
  try {
    execSync('net session', { stdio: 'ignore' });
    return true;
  } catch (e) {
    return false;
  }
}

function showAdminWarning() {
  dialog.showMessageBox(mainWindow, {
    type: 'warning',
    title: '权限不足',
    message: '检测到当前未以管理员身份运行',
    detail: '读取Windows安全日志需要管理员权限。请以管理员身份重新运行此应用程序，否则将无法获取真实的安全日志数据。\n\n操作步骤：\n1. 右键点击应用程序\n2. 选择"以管理员身份运行"',
    buttons: ['继续使用演示模式', '退出'],
    defaultId: 0,
    cancelId: 1
  }).then((result) => {
    if (result.response === 1) {
      app.quit();
    }
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile('index.html');

  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.webContents.on('did-finish-load', () => {
    isAdmin = checkAdminPrivileges();
    if (!isAdmin && process.platform === 'win32') {
      showAdminWarning();
    }
    mainWindow.webContents.send('admin-status', { isAdmin, platform: process.platform });
  });

  mainWindow.on('closed', () => {
    stopMonitoring();
    mainWindow = null;
  });
}

function parseEventXml(xmlString) {
  try {
    const event = {
      id: 0,
      time: '',
      level: '',
      provider: '',
      computer: '',
      message: '',
      details: {}
    };

    const eventIdMatch = xmlString.match(/<EventID>(\d+)<\/EventID>/);
    if (eventIdMatch) {
      event.id = parseInt(eventIdMatch[1]);
    }

    const timeMatch = xmlString.match(/TimeCreated SystemTime='([^']+)'/);
    if (timeMatch) {
      event.time = new Date(timeMatch[1]).toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      });
    }

    const levelMatch = xmlString.match(/<Level>(\d+)<\/Level>/);
    if (levelMatch) {
      const levels = { 0: '信息', 1: '严重', 2: '错误', 3: '警告', 4: '信息', 5: '详细' };
      event.level = levels[levelMatch[1]] || '信息';
    }

    const providerMatch = xmlString.match(/Provider Name='([^']+)'/);
    if (providerMatch) {
      event.provider = providerMatch[1];
    }

    const computerMatch = xmlString.match(/<Computer>([^<]+)<\/Computer>/);
    if (computerMatch) {
      event.computer = computerMatch[1];
    }

    const dataMatches = xmlString.match(/<Data Name='([^']+)'>([^<]+)<\/Data>/g);
    if (dataMatches) {
      dataMatches.forEach(match => {
        const dataMatch = match.match(/<Data Name='([^']+)'>([^<]+)<\/Data>/);
        if (dataMatch) {
          event.details[dataMatch[1]] = dataMatch[2];
        }
      });
    }

    event.message = SECURITY_EVENT_IDS[event.id] || '未知事件';

    if (event.id === 4688) {
      event.description = `进程创建: ${event.details.NewProcessName || 'N/A'} (PID: ${event.details.NewProcessId || 'N/A'})`;
    } else if (event.id === 4624) {
      event.description = `登录成功: 用户 ${event.details.TargetUserName || 'N/A'} 从 ${event.details.IpAddress || 'N/A'}`;
    } else if (event.id === 4625) {
      event.description = `登录失败: 用户 ${event.details.TargetUserName || 'N/A'} 从 ${event.details.IpAddress || 'N/A'}`;
    } else {
      event.description = event.message;
    }

    return event;
  } catch (error) {
    console.error('解析事件XML失败:', error);
    return null;
  }
}

function processAndSendEvent(event) {
  if (!event || !mainWindow) return;
  
  const aggregatedEvent = processEventAggregation(event);
  const threatMatch = matchThreatIntel(aggregatedEvent);
  
  if (threatMatch) {
    aggregatedEvent.threatMatch = threatMatch;
    
    if (threatMatch.maxSeverity === 'critical' || threatMatch.maxSeverity === 'high') {
      aggregatedEvent.level = '严重';
    } else if (threatMatch.maxSeverity === 'medium') {
      aggregatedEvent.level = '警告';
    }
  }
  
  mainWindow.webContents.send('security-event', aggregatedEvent);
}

function startMonitoring() {
  if (isMonitoring) return;

  loadThreatIntel();

  if (process.platform !== 'win32') {
    sendDemoEvents();
    return;
  }

  try {
    wevtutilProcess = spawn('wevtutil', [
      'qe',
      'Security',
      '/c:100',
      '/rd:true',
      '/f:RenderedXml'
    ]);

    let xmlBuffer = '';

    wevtutilProcess.stdout.on('data', (data) => {
      xmlBuffer += data.toString();
      
      const events = xmlBuffer.match(/<Event[^>]*>[\s\S]*?<\/Event>/g);
      if (events) {
        events.forEach(xml => {
          const event = parseEventXml(xml);
          if (event) {
            processAndSendEvent(event);
          }
        });
        xmlBuffer = xmlBuffer.replace(/<Event[^>]*>[\s\S]*?<\/Event>/g, '');
      }
    });

    wevtutilProcess.stderr.on('data', (data) => {
      console.error('wevtutil 错误:', data.toString());
      sendDemoEvents();
    });

    wevtutilProcess.on('close', (code) => {
      console.log(`wevtutil 进程退出，代码: ${code}`);
      if (code !== 0) {
        sendDemoEvents();
      }
    });

    startRealTimeMonitoring();
    isMonitoring = true;
  } catch (error) {
    console.error('启动监控失败:', error);
    sendDemoEvents();
  }
}

function startRealTimeMonitoring() {
  if (process.platform !== 'win32') return;

  try {
    realTimeProcess = spawn('powershell.exe', [
      '-Command',
      '$query = "*[System[(EventID=4624) or (EventID=4625) or (EventID=4634) or (EventID=4647) or (EventID=4688) or (EventID=4689)]]"; while($true) { $events = wevtutil qe Security /q:$query /c:1 /rd:true /f:RenderedXml; if($events) { $events | Out-Host; Start-Sleep -Seconds 1 } }'
    ]);

    let xmlBuffer = '';
    let lastEventTime = 0;

    realTimeProcess.stdout.on('data', (data) => {
      xmlBuffer += data.toString();
      
      const events = xmlBuffer.match(/<Event[^>]*>[\s\S]*?<\/Event>/g);
      if (events) {
        events.forEach(xml => {
          const event = parseEventXml(xml);
          if (event) {
            const eventTime = new Date(event.time).getTime();
            if (eventTime > lastEventTime) {
              processAndSendEvent(event);
              lastEventTime = eventTime;
            }
          }
        });
        xmlBuffer = xmlBuffer.replace(/<Event[^>]*>[\s\S]*?<\/Event>/g, '');
      }
    });

    realTimeProcess.stderr.on('data', (data) => {
      console.error('实时监控错误:', data.toString());
    });

    realTimeProcess.on('close', (code) => {
      console.log(`实时监控进程退出，代码: ${code}`);
    });
  } catch (error) {
    console.error('启动实时监控失败:', error);
  }
}

function startEtwMonitoring() {
  console.log('提示: 如需使用 node-etw 库进行ETW实时订阅，请安装 node-etw 包');
  console.log('并参考以下实现方式:');
  console.log(`
    const ETW = require('node-etw');
    const etwSession = new ETW.Session({
      name: 'SecurityLogSession',
      providers: [{
        guid: '54849625-5478-4994-A5BA-3E3B0328C30D',
        flags: 0x1,
        level: 4
      }]
    });
    
    etwSession.on('event', (event) => {
      if (event.Header.ProviderId === '54849625-5478-4994-A5BA-3E3B0328C30D') {
        const securityEvent = parseEtwEvent(event);
        processAndSendEvent(securityEvent);
      }
    });
    
    etwSession.start();
  `);
}

function sendDemoEvents() {
  loadThreatIntel();
  
  const demoEvents = [
    { id: 4624, type: '登录成功', desc: '用户 Administrator 从 192.168.1.100 登录', level: '信息', details: { TargetUserName: 'Administrator', IpAddress: '192.168.1.100' } },
    { id: 4688, type: '进程创建', desc: '新建进程: notepad.exe (PID: 2345)', level: '信息', details: { NewProcessName: 'C:\\Windows\\notepad.exe', NewProcessId: '2345' } },
    { id: 4625, type: '登录失败', desc: '用户 Guest 登录失败', level: '警告', details: { TargetUserName: 'Guest', IpAddress: '192.168.1.200' } },
    { id: 4688, type: '进程创建', desc: '新建进程: cmd.exe (PID: 5678)', level: '信息', details: { NewProcessName: 'C:\\Windows\\System32\\cmd.exe', NewProcessId: '5678' } },
    { id: 4634, type: '注销', desc: '用户 Administrator 已注销', level: '信息', details: { TargetUserName: 'Administrator' } },
    { id: 4689, type: '进程退出', desc: '进程退出: notepad.exe (PID: 2345)', level: '信息', details: {} },
    { id: 4688, type: '进程创建', desc: '新建进程: mimikatz.exe (PID: 9999)', level: '信息', details: { NewProcessName: 'C:\\Temp\\mimikatz.exe', NewProcessId: '9999' } },
    { id: 4688, type: '进程创建', desc: '新建进程: powershell.exe (PID: 7777)', level: '信息', details: { NewProcessName: 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe', NewProcessId: '7777' } }
  ];

  demoEvents.forEach((event, index) => {
    setTimeout(() => {
      if (mainWindow) {
        const now = new Date();
        now.setSeconds(now.getSeconds() - (demoEvents.length - index));
        processAndSendEvent({
          id: event.id,
          time: now.toLocaleString('zh-CN'),
          level: event.level,
          provider: 'Microsoft-Windows-Security-Auditing',
          computer: 'DEMO-PC',
          message: event.type,
          description: event.desc,
          details: {
            ...event.details,
            Note: '这是演示数据，在Windows系统上将显示真实安全日志'
          }
        });
      }
    }, index * 300);
  });

  isMonitoring = true;
}

function stopMonitoring() {
  if (wevtutilProcess) {
    try {
      wevtutilProcess.kill();
    } catch (e) {
      console.error('停止wevtutil进程失败:', e);
    }
    wevtutilProcess = null;
  }
  
  if (realTimeProcess) {
    try {
      realTimeProcess.kill();
    } catch (e) {
      console.error('停止实时监控进程失败:', e);
    }
    realTimeProcess = null;
  }
  
  eventCache.clear();
  isMonitoring = false;
}

app.whenReady().then(() => {
  loadThreatIntel();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  stopMonitoring();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

ipcMain.handle('start-monitoring', () => {
  startMonitoring();
  return { success: true };
});

ipcMain.handle('stop-monitoring', () => {
  stopMonitoring();
  return { success: true };
});

ipcMain.handle('get-status', () => {
  return { isMonitoring, platform: process.platform };
});
