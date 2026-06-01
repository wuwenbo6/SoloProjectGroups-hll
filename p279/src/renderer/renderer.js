const api = window.iolinkAPI;

let connected = false;
let selectedPort = null;
let logEntries = [];
let _lastAlarmRender = 0;
const MAX_LOG = 200;
const ALARM_RENDER_INTERVAL = 3000;

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

function formatTime(ts) {
  const d = new Date(ts);
  return d.toLocaleTimeString('zh-CN', { hour12: false }) + '.' + String(d.getMilliseconds()).padStart(3, '0');
}

function formatHex(val, width) {
  return '0x' + val.toString(16).toUpperCase().padStart(width || 4, '0');
}

function addLog(level, message) {
  logEntries.push({ level, message, timestamp: Date.now() });
  if (logEntries.length > MAX_LOG) logEntries.shift();
  renderLog();
}

function renderLog() {
  const panel = $('#logPanel');
  const html = logEntries.slice(-50).map(e =>
    `<div class="log-entry ${e.level}"><span class="log-time">${formatTime(e.timestamp)}</span>${e.message}</div>`
  ).join('');
  panel.innerHTML = html || '<div class="empty-state">No logs</div>';
  panel.scrollTop = panel.scrollHeight;
}

function setMasterStatus(online) {
  const badge = $('#masterStatus');
  if (online) {
    badge.textContent = 'ONLINE';
    badge.classList.add('online');
  } else {
    badge.textContent = 'OFFLINE';
    badge.classList.remove('online');
  }
}

async function loadPorts() {
  const ports = await api.listPorts();
  const select = $('#portSelect');
  select.innerHTML = '<option value="">Simulated UART</option>';
  ports.forEach(p => {
    const opt = document.createElement('option');
    opt.value = p.path;
    opt.textContent = `${p.path} - ${p.manufacturer || 'Unknown'}`;
    select.appendChild(opt);
  });
}

async function handleConnect() {
  const portPath = $('#portSelect').value;
  const baudRate = parseInt($('#baudRateSelect').value, 10);

  addLog('info', `Connecting to ${portPath || 'simulated'} @ ${baudRate} baud...`);
  const result = await api.connect(portPath || null, baudRate);

  if (result.success) {
    connected = true;
    setMasterStatus(true);
    $('#connectBtn').textContent = 'Disconnect';
    $('#connectBtn').classList.remove('btn-primary');
    $('#connectBtn').classList.add('btn-danger');
    addLog('info', `Connected (${result.simulated ? 'SIMULATED' : 'REAL'})`);

    const deviceList = await api.getDeviceList();
    renderDevicePorts(deviceList);
  } else {
    addLog('error', `Connection failed: ${result.error}`);
  }
}

async function handleDisconnect() {
  await api.disconnect();
  connected = false;
  selectedPort = null;
  setMasterStatus(false);
  $('#connectBtn').textContent = 'Connect';
  $('#connectBtn').classList.remove('btn-danger');
  $('#connectBtn').classList.add('btn-primary');
  $('#devicePortList').innerHTML = '<div class="empty-state">No devices connected</div>';
  $('#deviceView').style.display = 'none';
  $('#noDeviceView').style.display = 'flex';
  addLog('info', 'Disconnected');
}

function renderDevicePorts(deviceList) {
  const container = $('#devicePortList');
  if (!deviceList || deviceList.length === 0) {
    container.innerHTML = '<div class="empty-state">No devices connected</div>';
    return;
  }

  container.innerHTML = deviceList.map(d => {
    const stateClass = d.info.state === 'OPERATE' ? 'operate' :
                       d.info.state === 'PREOPERATE' ? 'preoperate' :
                       d.info.state === 'ERROR' ? 'error' : '';
    const activeClass = selectedPort === d.port ? 'active' : '';
    return `
      <div class="device-port-item ${activeClass}" data-port="${d.port}">
        <div class="port-indicator ${stateClass}"></div>
        <div class="port-info">
          <div class="port-name">Port ${d.port}: ${d.info.deviceName}</div>
          <div class="port-detail">${d.info.state} | ${d.info.comSpeed}</div>
        </div>
      </div>
    `;
  }).join('');

  container.querySelectorAll('.device-port-item').forEach(el => {
    el.addEventListener('click', () => {
      const port = parseInt(el.dataset.port, 10);
      selectDevice(port);
    });
  });
}

async function selectDevice(portNumber) {
  selectedPort = portNumber;

  document.querySelectorAll('.device-port-item').forEach(el => {
    el.classList.toggle('active', parseInt(el.dataset.port, 10) === portNumber);
  });

  const info = await api.getDeviceInfo(portNumber);
  const processData = await api.getProcessData(portNumber);
  const isduList = await api.getISDUList(portNumber);
  const events = await api.getEvents(portNumber);

  renderDeviceInfo(info);
  renderProcessData(processData);
  renderISDU(isduList);
  renderEvents(events);
  await renderMSeqSection(portNumber);
  await renderAlarmSection(portNumber);

  $('#noDeviceView').style.display = 'none';
  $('#deviceView').style.display = 'flex';
}

function renderDeviceInfo(info) {
  if (!info) return;
  $('#deviceName').textContent = info.deviceName;
  const stateEl = $('#deviceState');
  stateEl.textContent = info.state;
  stateEl.className = `device-state ${info.state}`;
  $('#infoVendorId').textContent = formatHex(info.vendorId);
  $('#infoDeviceId').textContent = formatHex(info.deviceId);
  $('#infoSerialNum').textContent = info.serialNumber;
  $('#infoComSpeed').textContent = info.comSpeed;
  $('#infoHwRev').textContent = info.hardwareRevision;
  $('#infoFwRev').textContent = info.firmwareRevision;

  const isOperating = info.state === 'OPERATE';
  const isPreOperate = info.state === 'PREOPERATE';
  $('#wakeupBtn').disabled = isOperating || isPreOperate;
  $('#startBtn').disabled = isOperating;
  $('#stopBtn').disabled = !isOperating;
}

async function renderMSeqSection(portNumber) {
  const stats = await api.getMSeqStats();
  const activeTx = await api.getMSeqActive(portNumber);
  const history = await api.getMSeqHistory(20);
  const devMSeqStats = await api.getDeviceMSeqStats(portNumber);
  const cycleCount = await api.getCycleCount();

  if (!stats) return;

  $('#mseqTotalSent').textContent = stats.totalSent;
  $('#mseqTotalReceived').textContent = stats.totalReceived;
  $('#mseqTotalTimeout').textContent = stats.totalTimeout;
  $('#mseqTotalError').textContent = stats.totalError;

  const currentState = activeTx ? activeTx.state : (devMSeqStats ? devMSeqStats.state : 'IDLE');
  const stateBadge = $('#mseqStateBadge');
  stateBadge.textContent = currentState;
  stateBadge.className = 'mseq-state-badge';
  if (currentState === 'COMPLETE') stateBadge.classList.add('complete');
  else if (currentState === 'ERROR') stateBadge.classList.add('error');
  else if (currentState === 'TIMEOUT') stateBadge.classList.add('timeout');
  else if (currentState !== 'IDLE') stateBadge.classList.add('active');

  $('#mseqCycleInfo').textContent = `Cycle: ${cycleCount || 0}`;

  const stateNodes = {
    IDLE: $('#stateIdle'),
    MC_SEND: $('#stateMcSend'),
    WAIT_AC: $('#stateWaitAc'),
    AC_RECEIVED: $('#stateAcRecv'),
    COMPLETE: $('#stateComplete'),
  };
  Object.values(stateNodes).forEach(n => {
    if (n) n.className = 'state-node';
  });
  if (stateNodes[currentState]) {
    const cls = currentState === 'ERROR' ? 'error' :
                currentState === 'TIMEOUT' ? 'timeout' :
                currentState === 'COMPLETE' ? 'success' : 'active';
    stateNodes[currentState].classList.add(cls);
  }
  if (activeTx) {
    const prevState = { MC_SEND: 'IDLE', WAIT_AC: 'MC_SEND', AC_RECEIVED: 'WAIT_AC', COMPLETE: 'AC_RECEIVED' }[currentState];
    if (prevState && stateNodes[prevState]) {
      stateNodes[prevState].classList.add('success');
    }
  }

  const activeEl = $('#mseqActiveTx');
  if (activeTx) {
    activeEl.style.display = 'block';
    $('#mseqActiveDetail').textContent = `#${activeTx.id} ${activeTx.typeLabel} retries=${activeTx.retries} elapsed=${activeTx.elapsed}ms`;
  } else {
    activeEl.style.display = 'none';
  }

  const byType = stats.byType || {};
  const maxSent = Math.max(1, ...Object.values(byType).map(t => t.sent));
  const typeMap = { 0: 'T0', 1: 'T1', 2: 'T2', 3: 'T3' };
  Object.entries(typeMap).forEach(([type, label]) => {
    const t = byType[type] || { sent: 0, received: 0, timeout: 0, error: 0 };
    const bar = $(`#mseqBar${label}`);
    const count = $(`#mseqCount${label}`);
    if (bar) bar.style.width = `${(t.sent / maxSent) * 100}%`;
    if (count) count.textContent = t.sent;
  });

  const historyEl = $('#mseqHistoryList');
  if (!history || history.length === 0) {
    historyEl.innerHTML = '<div class="empty-state">No transactions</div>';
  } else {
    const typeClassMap = { 0: 't0', 1: 't1', 2: 't2', 3: 't3' };
    historyEl.innerHTML = history.slice().reverse().slice(0, 15).map(h => {
      const tc = typeClassMap[h.type] || 't0';
      return `<div class="mseq-history-item">
        <span class="tx-type ${tc}">${h.typeLabel || 'Type' + h.type}</span>
        <span class="tx-state ${h.state}">${h.state}</span>
        <span class="tx-mc">MC:${h.mcFrameHex || ''}</span>
        <span class="tx-ac">AC:${h.acFrameHex || '-'}</span>
        <span class="tx-time">${h.elapsed || 0}ms</span>
      </div>`;
    }).join('');
  }
}

function renderProcessData(pd) {
  if (!pd) return;
  const temp = pd.temperature;
  const minTemp = -40;
  const maxTemp = 150;
  const ratio = Math.max(0, Math.min(1, (temp - minTemp) / (maxTemp - minTemp)));

  const gaugeArc = document.querySelector('.gauge-bg');
  const gaugeFill = document.querySelector('#gaugeFill');
  if (gaugeArc && gaugeFill) {
    const totalLength = gaugeArc.getTotalLength();
    gaugeFill.style.strokeDasharray = totalLength;
    gaugeFill.style.strokeDashoffset = totalLength * (1 - ratio);

    if (temp > 120) {
      gaugeFill.style.stroke = 'var(--danger)';
    } else if (temp > 27 || temp < 18) {
      gaugeFill.style.stroke = 'var(--warning)';
    } else {
      gaugeFill.style.stroke = 'var(--accent)';
    }
  }

  $('#gaugeValue').textContent = temp.toFixed(1);
  $('#rawValue').textContent = pd.raw;
  $('#rawBytes').textContent = '[' + pd.rawBytes.map(b => '0x' + b.toString(16).toUpperCase().padStart(2, '0')).join(', ') + ']';
}

function renderISDU(isduList) {
  const tbody = $('#isduTableBody');
  if (!isduList || isduList.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="empty-state">No ISDU parameters</td></tr>';
    return;
  }

  tbody.innerHTML = isduList.map(item => {
    const accessClass = item.access === 'rw' ? 'access-rw' : 'access-ro';
    const editBtn = item.access === 'rw'
      ? `<button class="btn btn-sm btn-secondary isdu-edit" data-index="${item.index}" data-type="${item.type}">Edit</button>`
      : '';
    const displayValue = typeof item.value === 'number'
      ? item.value
      : String(item.value);

    return `<tr>
      <td class="index-col">${formatHex(item.index)}</td>
      <td>${item.name}</td>
      <td class="value-col">${displayValue}</td>
      <td>${item.type}</td>
      <td class="${accessClass}">${item.access.toUpperCase()}</td>
      <td>${editBtn}</td>
    </tr>`;
  }).join('');

  tbody.querySelectorAll('.isdu-edit').forEach(btn => {
    btn.addEventListener('click', () => {
      const index = parseInt(btn.dataset.index, 10);
      const type = btn.dataset.type;
      const row = btn.closest('tr');
      const currentValue = row.querySelector('.value-col').textContent;
      openEditModal(index, type, currentValue);
    });
  });
}

function renderEvents(events) {
  const container = $('#eventsList');
  const countEl = $('#eventCount');

  if (!events || events.length === 0) {
    container.innerHTML = '<div class="empty-state">No events</div>';
    countEl.textContent = '0 events';
    return;
  }

  countEl.textContent = `${events.length} events`;

  const typeLabels = {
    0: 'notification',
    1: 'warning',
    2: 'error',
  };

  container.innerHTML = events.slice().reverse().map(e => {
    const type = typeLabels[e.type] || 'notification';
    return `
      <div class="event-item">
        <span class="event-type-badge ${type}">${type.toUpperCase()}</span>
        <div class="event-content">
          <div class="event-message">${e.message}</div>
          <div class="event-meta">Code: ${formatHex(e.code, 4)} | Cycle: ${e.cycle} | ${formatTime(e.timestamp)}</div>
        </div>
      </div>
    `;
  }).join('');
}

async function renderAlarmSection(portNumber) {
  const now = Date.now();
  if (now - _lastAlarmRender < ALARM_RENDER_INTERVAL) return;
  _lastAlarmRender = now;

  const summary = await api.getAlarmSummary(portNumber);
  const alarms = await api.getAlarms(portNumber, false);

  if (summary) {
    $('#alarmTotal').textContent = summary.total;
    $('#alarmActive').textContent = summary.active;
    $('#alarmUnack').textContent = summary.unacknowledged;
    $('#alarmHigh').textContent = summary.highAlarms;
    $('#alarmLow').textContent = summary.lowAlarms;

    const badge = $('#alarmSummaryBadge');
    if (summary.active > 0) {
      badge.textContent = `${summary.active} ACTIVE`;
      badge.className = 'alarm-summary-badge has-active';
    } else if (summary.unacknowledged > 0) {
      badge.textContent = `${summary.unacknowledged} UNACK`;
      badge.className = 'alarm-summary-badge has-unack';
    } else {
      badge.textContent = summary.total > 0 ? `${summary.total} Total` : 'No Alarms';
      badge.className = 'alarm-summary-badge';
    }

    $('#ackAllAlarmsBtn').disabled = summary.unacknowledged === 0;
  }

  const container = $('#alarmList');
  if (!alarms || alarms.length === 0) {
    container.innerHTML = '<div class="empty-state">No temperature alarms</div>';
    return;
  }

  container.innerHTML = alarms.slice().reverse().slice(0, 30).map((a, i) => {
    const realIndex = alarms.length - 1 - i;
    const isActive = !a.deactivatedAt;
    const isUnack = !a.acknowledged;
    const itemClass = `alarm-item${isActive ? ' active-alarm' : ''}${isUnack ? ' unack-alarm' : ''}`;
    const dirClass = a.direction === 'high' ? 'high' : 'low';
    const dirLabel = a.direction === 'high' ? 'HIGH' : 'LOW';
    const statusTag = isActive
      ? '<span class="alarm-detail-tag status-active">ACTIVE</span>'
      : '<span class="alarm-detail-tag status-cleared">CLEARED</span>';
    const ackTag = isUnack
      ? '<span class="alarm-detail-tag status-unack">UNACK</span>'
      : '';
    const ackBtn = isUnack
      ? `<button class="btn-ack" data-alarm-index="${realIndex}">ACK</button>`
      : `<button class="btn-ack acked" disabled>ACKED</button>`;
    const duration = a.duration
      ? ` | Duration: ${(a.duration / 1000).toFixed(1)}s`
      : '';
    const clearedInfo = a.deactivatedAt
      ? ` | Cleared: ${formatTime(a.deactivatedAt)}`
      : '';

    return `
      <div class="${itemClass}">
        <span class="alarm-direction-badge ${dirClass}">${dirLabel}</span>
        <div class="alarm-content">
          <div class="alarm-message">${a.message}</div>
          <div class="alarm-details">
            ${statusTag}${ackTag}
            <span class="alarm-detail-tag">Threshold: ${a.threshold}°C</span>
            <span class="alarm-detail-tag">Value: ${a.temperature}°C</span>
            <span class="alarm-detail-tag">Cycle: ${a.cycle}</span>
            <span class="alarm-detail-tag">Activated: ${formatTime(a.activatedAt)}${clearedInfo}${duration}</span>
          </div>
        </div>
        <div class="alarm-actions">${ackBtn}</div>
      </div>
    `;
  }).join('');

  container.querySelectorAll('.btn-ack:not(:disabled)').forEach(btn => {
    btn.addEventListener('click', async () => {
      const alarmIndex = parseInt(btn.dataset.alarmIndex, 10);
      await api.acknowledgeAlarm(portNumber, alarmIndex);
      addLog('info', `Alarm #${alarmIndex} acknowledged on port ${portNumber}`);
      await renderAlarmSection(portNumber);
    });
  });
}

function openEditModal(index, type, currentValue) {
  $('#editModal').style.display = 'flex';
  const param = document.querySelector(`.isdu-edit[data-index="${index}"]`);
  const row = param.closest('tr');
  const name = row.querySelector('td:nth-child(2)').textContent;
  $('#editParamName').textContent = `${formatHex(index)} - ${name}`;
  $('#editParamValue').value = currentValue;
  $('#editParamIndex').value = index;
  $('#editParamType').value = type;
  $('#editParamValue').focus();
}

function closeEditModal() {
  $('#editModal').style.display = 'none';
}

async function saveISDU() {
  const index = parseInt($('#editParamIndex').value, 10);
  const type = $('#editParamType').value;
  const value = $('#editParamValue').value;

  if (!selectedPort) return;

  addLog('info', `Writing ISDU index ${formatHex(index)}: ${value}`);
  const result = await api.writeISDU(selectedPort, index, 0, value);

  if (result.success) {
    addLog('info', `ISDU write success: ${formatHex(index)} = ${value}`);
    closeEditModal();
    const isduList = await api.getISDUList(selectedPort);
    renderISDU(isduList);
  } else {
    addLog('error', `ISDU write failed: ${result.error}`);
  }
}

async function refreshDevice() {
  if (!selectedPort) return;
  const info = await api.getDeviceInfo(selectedPort);
  const isduList = await api.getISDUList(selectedPort);
  renderDeviceInfo(info);
  renderISDU(isduList);
  addLog('info', `ISDU parameters refreshed for port ${selectedPort}`);
}

function setupEventListeners() {
  $('#connectBtn').addEventListener('click', () => {
    if (connected) {
      handleDisconnect();
    } else {
      handleConnect();
    }
  });

  $('#wakeupBtn').addEventListener('click', async () => {
    if (!selectedPort) return;
    const baudRate = parseInt($('#baudRateSelect').value, 10);
    let comSpeed;
    if (baudRate === 4800) comSpeed = { code: 0x01, name: 'COM1 (4.8 kBaud)' };
    else if (baudRate === 38400) comSpeed = { code: 0x02, name: 'COM2 (38.4 kBaud)' };
    else comSpeed = { code: 0x03, name: 'COM3 (230.4 kBaud)' };

    addLog('info', `Sending wake-up to port ${selectedPort}...`);
    const result = await api.wakeupDevice(selectedPort, comSpeed);
    if (result.success) {
      addLog('info', `Device on port ${selectedPort} woken up`);
      await selectDevice(selectedPort);
    } else {
      addLog('error', `Wake-up failed: ${result.error}`);
    }
  });

  $('#startBtn').addEventListener('click', async () => {
    if (!selectedPort) return;
    addLog('info', `Starting OPERATE mode on port ${selectedPort}...`);
    const result = await api.startOperate(selectedPort);
    if (result.success) {
      addLog('info', `Port ${selectedPort} now in OPERATE mode`);
      await selectDevice(selectedPort);
    } else {
      addLog('error', `Start failed: ${result.error}`);
    }
  });

  $('#stopBtn').addEventListener('click', async () => {
    if (!selectedPort) return;
    addLog('info', `Stopping port ${selectedPort}...`);
    const result = await api.stopOperate(selectedPort);
    if (result.success) {
      addLog('info', `Port ${selectedPort} stopped`);
      await selectDevice(selectedPort);
    } else {
      addLog('error', `Stop failed: ${result.error}`);
    }
  });

  $('#refreshBtn').addEventListener('click', refreshDevice);

  $('#exportCsvBtn').addEventListener('click', async () => {
    if (!selectedPort) return;
    addLog('info', `Exporting ISDU parameters as CSV for port ${selectedPort}...`);
    const result = await api.exportISDU(selectedPort, 'csv');
    if (result.success) {
      addLog('info', `ISDU exported to: ${result.path}`);
    } else if (!result.canceled) {
      addLog('error', `Export failed: ${result.error}`);
    }
  });

  $('#exportJsonBtn').addEventListener('click', async () => {
    if (!selectedPort) return;
    addLog('info', `Exporting ISDU parameters as JSON for port ${selectedPort}...`);
    const result = await api.exportISDU(selectedPort, 'json');
    if (result.success) {
      addLog('info', `ISDU exported to: ${result.path}`);
    } else if (!result.canceled) {
      addLog('error', `Export failed: ${result.error}`);
    }
  });

  $('#ackAllAlarmsBtn').addEventListener('click', async () => {
    if (!selectedPort) return;
    await api.acknowledgeAllAlarms(selectedPort);
    addLog('info', `All alarms acknowledged on port ${selectedPort}`);
    await renderAlarmSection(selectedPort);
  });

  $('#modalClose').addEventListener('click', closeEditModal);
  $('#modalCancel').addEventListener('click', closeEditModal);
  $('#modalSave').addEventListener('click', saveISDU);

  $('#editParamValue').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') saveISDU();
    if (e.key === 'Escape') closeEditModal();
  });

  $('#editModal').addEventListener('click', (e) => {
    if (e.target === $('#editModal')) closeEditModal();
  });
}

function setupRealtimeUpdates() {
  api.onDeviceUpdate((update) => {
    if (update.port === selectedPort) {
      renderDeviceInfo(update.deviceInfo);
      renderProcessData(update.processData);
      $('#cycleCounter').textContent = `Cycle: ${update.deviceInfo.cycleCounter}`;
      renderMSeqSection(update.port);
      renderAlarmSection(update.port);
    }

    const portItem = document.querySelector(`.device-port-item[data-port="${update.port}"]`);
    if (portItem) {
      const indicator = portItem.querySelector('.port-indicator');
      const state = update.deviceInfo.state;
      indicator.className = 'port-indicator ' + (
        state === 'OPERATE' ? 'operate' :
        state === 'PREOPERATE' ? 'preoperate' :
        state === 'ERROR' ? 'error' : ''
      );
      const detail = portItem.querySelector('.port-detail');
      detail.textContent = `${state} | ${update.deviceInfo.comSpeed}`;
    }
  });

  api.onDeviceEvent((event) => {
    if (event.port === selectedPort) {
      api.getEvents(selectedPort).then(events => renderEvents(events));
    }
    const typeLabels = { 0: 'NOTIFICATION', 1: 'WARNING', 2: 'ERROR' };
    addLog(event.type === 2 ? 'error' : event.type === 1 ? 'warn' : 'info',
      `[Port ${event.port}] ${typeLabels[event.type] || 'EVENT'}: ${event.message}`);
  });

  api.onStateChange((change) => {
    addLog('info', `Master state: ${change.oldState} → ${change.newState}`);
  });

  api.onLog((log) => {
    logEntries.push(log);
    if (logEntries.length > MAX_LOG) logEntries.shift();
    renderLog();
  });
}

async function init() {
  setupEventListeners();
  setupRealtimeUpdates();
  await loadPorts();
  addLog('info', 'IO-Link Master Station initialized');
  addLog('info', 'Click "Connect" to start (simulated mode by default)');
}

document.addEventListener('DOMContentLoaded', init);
