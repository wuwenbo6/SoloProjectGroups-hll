const daliAPI = window.daliAPI;

const FADE_TIME_TABLE = [
  0, 0.7, 1.0, 1.4, 2.0, 2.8, 4.0, 5.7,
  8.0, 11.3, 16.0, 22.6, 32.0, 45.3, 64.0, 90.5
];

const ADDR_TYPE_SHORT = 0;
const ADDR_TYPE_GROUP = 1;
const ADDR_TYPE_BROADCAST = 2;

const SCENE_COUNT = 16;

const elements = {
  portSelect: document.getElementById('port-select'),
  refreshPorts: document.getElementById('refresh-ports'),
  baudRate: document.getElementById('baud-rate'),
  connectBtn: document.getElementById('connect-btn'),
  disconnectBtn: document.getElementById('disconnect-btn'),
  connectionStatus: document.getElementById('connection-status'),
  addrType: document.getElementById('addr-type'),
  addrValue: document.getElementById('addr-value'),
  addrValueGroup: document.getElementById('addr-value-group'),
  addrBytePreview: document.getElementById('addr-byte-preview'),
  addrByteDetail: document.getElementById('addr-byte-detail'),
  dimmerSlider: document.getElementById('dimmer-slider'),
  dimmerValue: document.getElementById('dimmer-value'),
  dimmerOff: document.getElementById('dimmer-off'),
  dimmerHalf: document.getElementById('dimmer-half'),
  dimmerFull: document.getElementById('dimmer-full'),
  sendDimmer: document.getElementById('send-dimmer'),
  fadeTime: document.getElementById('fade-time'),
  fadeTimeValue: document.getElementById('fade-time-value'),
  fadeTimeDesc: document.getElementById('fade-time-desc'),
  fadeTimeTable: document.getElementById('fade-time-table'),
  sendFadeTime: document.getElementById('send-fade-time'),
  daliCommandMode: document.getElementById('dali-command-mode'),
  daliCommand: document.getElementById('dali-command'),
  sendCommand: document.getElementById('send-command'),
  framePreview: document.getElementById('frame-preview'),
  clearHistory: document.getElementById('clear-history'),
  historyList: document.getElementById('history-list'),
  responseStatus: document.getElementById('response-status'),
  responseRaw: document.getElementById('response-raw'),
  responseHex: document.getElementById('response-hex'),
  responseBinary: document.getElementById('response-binary'),
  responseValue: document.getElementById('response-value'),
  presetBtns: document.querySelectorAll('.btn-preset'),
  lampGlow: document.getElementById('lamp-glow'),
  lampBulb: document.getElementById('lamp-bulb'),
  lampLevelValue: document.getElementById('lamp-level-value'),
  lampFadeDisplay: document.getElementById('lamp-fade-display'),
  lampPowerWatts: document.getElementById('lamp-power-watts'),
  simLampPower: document.getElementById('sim-lamp-power'),
  simLampFailure: document.getElementById('sim-lamp-failure'),
  queryStatusBtn: document.getElementById('query-status-btn'),
  statusPowerValue: document.getElementById('status-power-value'),
  statusFailureValue: document.getElementById('status-failure-value'),
  statusPresentValue: document.getElementById('status-present-value'),
  statusPower: document.getElementById('status-power'),
  statusFailure: document.getElementById('status-failure'),
  statusPresent: document.getElementById('status-present'),
  btnQueryPower: document.getElementById('btn-query-power'),
  btnQueryFailure: document.getElementById('btn-query-failure'),
  btnQueryLevel: document.getElementById('btn-query-level'),
  btnQueryFade: document.getElementById('btn-query-fade'),
  storeCurrentScene: document.getElementById('store-current-scene'),
  sceneSelect: document.getElementById('scene-select'),
  scenesGrid: document.getElementById('scenes-grid')
};

let commandHistory = [];
let isConnected = false;
let currentLampLevel = 128;
let currentPowerWatts = 50.4;
let scenes = new Array(SCENE_COUNT).fill(null);

function getAddrType() {
  return parseInt(elements.addrType.value);
}

function getAddrValue() {
  const type = getAddrType();
  if (type === ADDR_TYPE_BROADCAST) return 0;
  return parseInt(elements.addrValue.value) || 0;
}

function encodeAddressByte(type, address, isCommand) {
  const cmdBit = isCommand ? 1 : 0;
  switch (type) {
    case ADDR_TYPE_SHORT:
      return ((address & 0x3F) << 1) | cmdBit;
    case ADDR_TYPE_GROUP:
      return 0x80 | ((address & 0x0F) << 1) | cmdBit;
    case ADDR_TYPE_BROADCAST:
      return 0xFE | cmdBit;
    default:
      return 0xFE | cmdBit;
  }
}

function decodeAddressByte(addrByte) {
  const cmdFlag = addrByte & 0x01;
  if ((addrByte & 0xFE) === 0xFE) {
    return { type: 'broadcast', address: 0xFF, isCommand: !!cmdFlag, typeName: '广播' };
  }
  if (addrByte & 0x80) {
    const group = (addrByte >> 1) & 0x0F;
    return { type: 'group', address: group, isCommand: !!cmdFlag, typeName: `组${group}` };
  }
  const shortAddr = (addrByte >> 1) & 0x3F;
  return { type: 'short', address: shortAddr, isCommand: !!cmdFlag, typeName: `短${shortAddr}` };
}

function formatHex(byte) {
  return '0x' + byte.toString(16).padStart(2, '0').toUpperCase();
}

function getFadeTimeSeconds(value) {
  return FADE_TIME_TABLE[Math.max(0, Math.min(15, value))];
}

function getFadeTimeDescription(value) {
  const seconds = getFadeTimeSeconds(value);
  if (value === 0) return '无渐变 (立即)';
  return `${seconds}s`;
}

function getPowerWatts(level) {
  if (level <= 0) return 0;
  const maxPower = 100;
  return Math.round(maxPower * (level / 254) * 10) / 10;
}

function parseStatusByte(statusByte) {
  return {
    raw: statusByte,
    hex: formatHex(statusByte),
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

function updateAddressPreview() {
  const type = getAddrType();
  const address = getAddrValue();
  const addrByteDAPC = encodeAddressByte(type, address, false);
  const addrByteCmd = encodeAddressByte(type, address, true);

  elements.addrBytePreview.textContent = formatHex(addrByteDAPC);
  const info = decodeAddressByte(addrByteDAPC);
  elements.addrByteDetail.textContent = `${info.typeName} DAPC=${formatHex(addrByteDAPC)} CMD=${formatHex(addrByteCmd)}`;

  updateFramePreview();
}

function updateFramePreview() {
  const type = getAddrType();
  const address = getAddrValue();
  const mode = elements.daliCommandMode.value;
  const cmdHex = elements.daliCommand.value.trim();
  const cmdByte = parseInt(cmdHex, 16) & 0xFF;
  const isCommand = mode === 'command';
  const addrByte = encodeAddressByte(type, address, isCommand);

  elements.framePreview.textContent = `${formatHex(addrByte)} ${formatHex(cmdByte)}`;
}

function updateLampVisual(level) {
  currentLampLevel = level;
  const percentage = level / 254;
  currentPowerWatts = getPowerWatts(level);

  let displayLevel = level;
  if (!elements.simLampPower.checked || elements.simLampFailure.checked) {
    displayLevel = 0;
  }

  const displayPercent = displayLevel / 254;
  elements.lampBulb.style.background = `radial-gradient(circle at 50% 50%, rgba(255, 244, 200, ${displayPercent}), rgba(255, 220, 100, ${displayPercent * 0.6}), rgba(200, 180, 80, ${displayPercent * 0.3}))`;
  elements.lampGlow.style.background = `radial-gradient(circle, rgba(255, 244, 200, ${displayPercent * 0.5}) 0%, rgba(255, 220, 100, ${displayPercent * 0.2}) 40%, transparent 70%)`;

  elements.lampLevelValue.textContent = level;
  elements.lampPowerWatts.textContent = `${currentPowerWatts} W`;
}

function updateAddrValueState() {
  const type = getAddrType();
  if (type === ADDR_TYPE_BROADCAST) {
    elements.addrValue.disabled = true;
    elements.addrValue.value = 0;
  } else {
    elements.addrValue.disabled = false;
    if (type === ADDR_TYPE_SHORT) {
      elements.addrValue.max = 63;
      if (elements.addrValue.value > 63) elements.addrValue.value = 0;
    } else {
      elements.addrValue.max = 15;
      if (elements.addrValue.value > 15) elements.addrValue.value = 0;
    }
  }
  updateAddressPreview();
}

function buildFadeTimeTable() {
  const container = elements.fadeTimeTable;
  for (let i = 0; i <= 15; i++) {
    const row = document.createElement('div');
    row.className = 'ftt-row' + (i === 0 ? ' ftt-active' : '');
    row.dataset.value = i;
    row.innerHTML = `<span class="ftt-idx">${i}</span><span class="ftt-time">${getFadeTimeDescription(i)}</span>`;
    row.addEventListener('click', () => {
      elements.fadeTime.value = i;
      updateFadeTimeDisplay();
    });
    container.appendChild(row);
  }
}

function updateFadeTimeDisplay() {
  const value = parseInt(elements.fadeTime.value);
  elements.fadeTimeValue.textContent = value;
  elements.fadeTimeDesc.textContent = getFadeTimeDescription(value);

  document.querySelectorAll('.ftt-row').forEach(row => {
    row.classList.toggle('ftt-active', parseInt(row.dataset.value) === value);
  });
}

function buildScenesGrid() {
  const grid = elements.scenesGrid;
  grid.innerHTML = '';

  for (let i = 0; i < SCENE_COUNT; i++) {
    const cell = document.createElement('div');
    cell.className = 'scene-cell' + (scenes[i] !== null ? ' scene-active' : '');
    cell.dataset.scene = i;

    const level = scenes[i];
    cell.innerHTML = `
      <div class="scene-header">
        <span class="scene-num">场景 ${i}</span>
        <span class="scene-level">${level !== null ? level : '空'}</span>
      </div>
      <div class="scene-bar">
        <div class="scene-bar-fill" style="width: ${level !== null ? (level / 254 * 100) : 0}%"></div>
      </div>
      <div class="scene-btns">
        <button class="scene-btn scene-recall" title="调用场景">调用</button>
        <button class="scene-btn scene-store" title="存储当前亮度">存储</button>
        <button class="scene-btn scene-remove" title="删除场景">删除</button>
      </div>
    `;

    cell.querySelector('.scene-recall').addEventListener('click', (e) => {
      e.stopPropagation();
      recallScene(i);
    });
    cell.querySelector('.scene-store').addEventListener('click', (e) => {
      e.stopPropagation();
      storeScene(i);
    });
    cell.querySelector('.scene-remove').addEventListener('click', (e) => {
      e.stopPropagation();
      removeScene(i);
    });

    grid.appendChild(cell);
  }
}

function updateScenesGrid() {
  const cells = elements.scenesGrid.querySelectorAll('.scene-cell');
  cells.forEach((cell, i) => {
    const level = scenes[i];
    cell.classList.toggle('scene-active', level !== null);
    cell.querySelector('.scene-level').textContent = level !== null ? level : '空';
    cell.querySelector('.scene-bar-fill').style.width = level !== null ? (level / 254 * 100) + '%' : '0%';
  });
}

function updateStatusDisplay(statusInfo) {
  if (!statusInfo || !statusInfo.bits) return;

  statusInfo.bits.forEach(bit => {
    const bitEl = document.getElementById(`bit-${bit.bit}`);
    if (bitEl) {
      bitEl.textContent = bit.active ? '1' : '0';
      bitEl.className = 'bit-value' + (bit.active ? ' bit-set' : ' bit-clear');
    }
  });

  const powerBit = statusInfo.bits.find(b => b.bit === 5);
  const failureBit = statusInfo.bits.find(b => b.bit === 6);
  const presentBit = statusInfo.bits.find(b => b.bit === 7);

  if (powerBit) {
    elements.statusPowerValue.textContent = powerBit.active ? '通电' : '断电';
    elements.statusPower.className = 'status-chip' + (powerBit.active ? ' chip-ok' : ' chip-off');
  }
  if (failureBit) {
    elements.statusFailureValue.textContent = failureBit.active ? '有故障' : '正常';
    elements.statusFailure.className = 'status-chip' + (failureBit.active ? ' chip-error' : ' chip-ok');
  }
  if (presentBit) {
    elements.statusPresentValue.textContent = presentBit.active ? '存在' : '不存在';
    elements.statusPresent.className = 'status-chip' + (presentBit.active ? ' chip-ok' : ' chip-off');
  }
}

async function loadSerialPorts() {
  try {
    const ports = await daliAPI.getSerialPorts();
    elements.portSelect.innerHTML = '';

    if (ports.length === 0) {
      const option = document.createElement('option');
      option.value = '';
      option.textContent = '无可用串口 (使用模拟模式)';
      elements.portSelect.appendChild(option);
    } else {
      ports.forEach(port => {
        const option = document.createElement('option');
        option.value = port.path;
        option.textContent = `${port.friendlyName} (${port.manufacturer})`;
        elements.portSelect.appendChild(option);
      });
    }
  } catch (error) {
    console.error('加载串口列表失败:', error);
  }
}

function updateConnectionStatus(connected, portName = null) {
  isConnected = connected;
  elements.connectBtn.disabled = connected;
  elements.disconnectBtn.disabled = !connected;
  elements.portSelect.disabled = connected;
  elements.baudRate.disabled = connected;

  if (connected) {
    elements.connectionStatus.textContent = `已连接: ${portName}`;
    elements.connectionStatus.className = 'status-badge connected';
  } else {
    elements.connectionStatus.textContent = '模拟模式';
    elements.connectionStatus.className = 'status-badge simulation';
  }
}

async function connectSerial() {
  const portPath = elements.portSelect.value;
  const baudRate = parseInt(elements.baudRate.value);

  if (!portPath) {
    addToHistory('系统', '警告: 未选择串口，将使用模拟模式', 'warning');
    return;
  }

  try {
    const result = await daliAPI.openSerialPort(portPath, baudRate);
    if (result.success) {
      updateConnectionStatus(true, portPath);
      addToHistory('系统', `串口已连接: ${portPath} @ ${baudRate}bps`, 'success');
    } else {
      addToHistory('系统', `连接失败: ${result.error}`, 'error');
    }
  } catch (error) {
    addToHistory('系统', `连接错误: ${error.message}`, 'error');
  }
}

async function disconnectSerial() {
  try {
    await daliAPI.closeSerialPort();
    updateConnectionStatus(false);
    addToHistory('系统', '串口已断开', 'info');
  } catch (error) {
    console.error('断开串口失败:', error);
  }
}

function updateDimmerDisplay(value) {
  elements.dimmerValue.textContent = value;
}

async function sendDimmerCommand() {
  const type = getAddrType();
  const address = getAddrValue();
  const level = parseInt(elements.dimmerSlider.value);

  try {
    const result = await daliAPI.sendDimmerCommand(type, address, level);
    if (result.success) {
      const frameHex = result.frame.map(b => formatHex(b)).join(' ');
      const mode = result.mode === 'simulation' ? ' [模拟]' : ' [串口]';
      const addrInfo = decodeAddressByte(result.frame[0]);
      addToHistory('发送', `DAPC ${addrInfo.typeName} → 级别${level} | 帧: ${frameHex}${mode}`, 'command');
    } else {
      addToHistory('错误', `发送失败: ${result.error}`, 'error');
    }
  } catch (error) {
    addToHistory('错误', `发送错误: ${error.message}`, 'error');
  }
}

async function sendFadeTimeCommand() {
  const type = getAddrType();
  const address = getAddrValue();
  const fadeTime = parseInt(elements.fadeTime.value);

  try {
    const result = await daliAPI.sendFadeTimeCommand(type, address, fadeTime);
    if (result.success) {
      const dtr0Hex = result.dtr0Frame.map(b => formatHex(b)).join(' ');
      const fadeHex = result.setFadeTimeFrame.map(b => formatHex(b)).join(' ');
      addToHistory('发送', `SET DTR0=${fadeTime} → 帧: ${dtr0Hex} | SET FADE TIME → 帧: ${fadeHex}`, 'command');
      elements.lampFadeDisplay.textContent = getFadeTimeDescription(fadeTime);
    } else {
      addToHistory('错误', `设置Fade Time失败: ${result.error}`, 'error');
    }
  } catch (error) {
    addToHistory('错误', `发送错误: ${error.message}`, 'error');
  }
}

async function sendDALIRawCommand() {
  const type = getAddrType();
  const address = getAddrValue();
  const mode = elements.daliCommandMode.value;
  const cmdHex = elements.daliCommand.value.trim();
  const cmdByte = parseInt(cmdHex, 16) & 0xFF;
  const isCommand = mode === 'command';
  const addrByte = encodeAddressByte(type, address, isCommand);

  try {
    const result = await daliAPI.sendDALICommand(addrByte, cmdByte);
    if (result.success) {
      const frameHex = result.frame.map(b => formatHex(b)).join(' ');
      const mode = result.mode === 'simulation' ? ' [模拟]' : ' [串口]';
      const addrInfo = decodeAddressByte(result.frame[0]);
      addToHistory('发送', `${addrInfo.typeName} CMD ${formatHex(cmdByte)} | 帧: ${frameHex}${mode}`, 'command');
    } else {
      addToHistory('错误', `发送失败: ${result.error}`, 'error');
    }
  } catch (error) {
    addToHistory('错误', `发送错误: ${error.message}`, 'error');
  }
}

async function queryFullStatus() {
  const type = getAddrType();
  const address = getAddrValue();
  addToHistory('查询', '执行完整状态查询...', 'info');
  try {
    await daliAPI.queryStatus(type, address);
  } catch (error) {
    addToHistory('错误', `查询失败: ${error.message}`, 'error');
  }
}

async function queryLampPower() {
  const type = getAddrType();
  const address = getAddrValue();
  try {
    const result = await daliAPI.queryLampPower(type, address);
    if (result.success) {
      const frameHex = result.frame.map(b => formatHex(b)).join(' ');
      addToHistory('发送', `查询灯具通电 → 帧: ${frameHex}`, 'command');
    }
  } catch (error) {
    addToHistory('错误', `查询失败: ${error.message}`, 'error');
  }
}

async function queryLampFailure() {
  const type = getAddrType();
  const address = getAddrValue();
  try {
    const result = await daliAPI.queryLampFailure(type, address);
    if (result.success) {
      const frameHex = result.frame.map(b => formatHex(b)).join(' ');
      addToHistory('发送', `查询灯具故障 → 帧: ${frameHex}`, 'command');
    }
  } catch (error) {
    addToHistory('错误', `查询失败: ${error.message}`, 'error');
  }
}

async function queryLevel() {
  const type = getAddrType();
  const address = getAddrValue();
  try {
    const result = await daliAPI.queryLevel(type, address);
    if (result.success) {
      const frameHex = result.frame.map(b => formatHex(b)).join(' ');
      addToHistory('发送', `查询实际亮度 → 帧: ${frameHex}`, 'command');
    }
  } catch (error) {
    addToHistory('错误', `查询失败: ${error.message}`, 'error');
  }
}

async function queryFade() {
  const type = getAddrType();
  const address = getAddrValue();
  try {
    const result = await daliAPI.queryFadeTime(type, address);
    if (result.success) {
      const frameHex = result.frame.map(b => formatHex(b)).join(' ');
      addToHistory('发送', `查询渐变时间 → 帧: ${frameHex}`, 'command');
    }
  } catch (error) {
    addToHistory('错误', `查询失败: ${error.message}`, 'error');
  }
}

async function storeScene(sceneNum) {
  const type = getAddrType();
  const address = getAddrValue();
  try {
    const result = await daliAPI.storeScene(type, address, sceneNum);
    if (result.success) {
      const frameHex = result.frame.map(b => formatHex(b)).join(' ');
      addToHistory('发送', `存储场景 ${sceneNum} (亮度 ${currentLampLevel}) → 帧: ${frameHex}`, 'command');
    }
  } catch (error) {
    addToHistory('错误', `存储场景失败: ${error.message}`, 'error');
  }
}

async function recallScene(sceneNum) {
  const type = getAddrType();
  const address = getAddrValue();
  try {
    const result = await daliAPI.recallScene(type, address, sceneNum);
    if (result.success) {
      const frameHex = result.frame.map(b => formatHex(b)).join(' ');
      addToHistory('发送', `调用场景 ${sceneNum} → 帧: ${frameHex}`, 'command');
    }
  } catch (error) {
    addToHistory('错误', `调用场景失败: ${error.message}`, 'error');
  }
}

async function removeScene(sceneNum) {
  const type = getAddrType();
  const address = getAddrValue();
  try {
    const result = await daliAPI.removeScene(type, address, sceneNum);
    if (result.success) {
      const frameHex = result.frame.map(b => formatHex(b)).join(' ');
      addToHistory('发送', `删除场景 ${sceneNum} → 帧: ${frameHex}`, 'command');
    }
  } catch (error) {
    addToHistory('错误', `删除场景失败: ${error.message}`, 'error');
  }
}

async function storeCurrentScene() {
  const sceneNum = parseInt(elements.sceneSelect.value);
  await storeScene(sceneNum);
}

async function setSimulationLampPower(powerOn) {
  try {
    const result = await daliAPI.setSimulationLampPower(powerOn);
    updateLampVisual(currentLampLevel);
    addToHistory('模拟', `灯具${powerOn ? '通电' : '断电'}`, 'info');
  } catch (error) {
    console.error('设置模拟状态失败:', error);
  }
}

async function setSimulationLampFailure(failure) {
  try {
    const result = await daliAPI.setSimulationLampFailure(failure);
    updateLampVisual(currentLampLevel);
    addToHistory('模拟', `灯具${failure ? '设置故障' : '清除故障'}`, 'info');
  } catch (error) {
    console.error('设置模拟状态失败:', error);
  }
}

function handleSerialData(data) {
  if (data.type === 'FADE_START') {
    addToHistory('渐变', `开始渐变 → 目标: ${data.targetLevel}, Fade Time: ${data.description}`, 'fade');
    return;
  }

  if (data.type === 'SCENE_STORED') {
    scenes[data.sceneNumber] = data.level;
    updateScenesGrid();
    addToHistory('场景', `场景 ${data.sceneNumber} 已存储 (亮度 ${data.level})`, 'scene');
    return;
  }

  if (data.type === 'SCENE_RECALLED') {
    addToHistory('场景', `调用场景 ${data.sceneNumber} → 亮度 ${data.level}`, 'scene');
    return;
  }

  if (data.type === 'SCENE_REMOVED') {
    scenes[data.sceneNumber] = null;
    updateScenesGrid();
    addToHistory('场景', `场景 ${data.sceneNumber} 已删除`, 'scene');
    return;
  }

  if (data.type === 'SCENE_EMPTY') {
    addToHistory('场景', `场景 ${data.sceneNumber} 为空`, 'warning');
    return;
  }

  if (data.type === 'LAMP_OFF') {
    addToHistory('系统', '灯具已关闭 (OFF)', 'info');
    return;
  }

  if (data.type === 'RESET') {
    addToHistory('系统', '设备已复位 (RESET)', 'info');
    return;
  }

  if (data.type === 'NO_RESPONSE') {
    addToHistory('接收', `无应答 ${data.reason ? `(${data.reason})` : ''}`, 'warning');
    return;
  }

  if (data.type === 'RESPONSE') {
    elements.responseStatus.textContent = '已接收';
    elements.responseStatus.className = 'response-value success';
    elements.responseRaw.textContent = data.raw.join(', ');
    elements.responseHex.textContent = data.hex;
    elements.responseBinary.textContent = data.binary;
    elements.responseValue.textContent = data.value;

    if (data.statusInfo) {
      updateStatusDisplay(data.statusInfo);
      const powerStr = data.powerWatts !== undefined ? `, 功率: ${data.powerWatts}W` : '';
      addToHistory('接收', `状态应答: ${data.hex} ${powerStr} | ${data.statusInfo.binary}`, 'response');
    } else {
      addToHistory('接收', `应答: ${data.hex} (${data.value}) | 二进制: ${data.binary}`, 'response');
    }
    return;
  }
}

function handleLevelUpdate(level) {
  updateLampVisual(level);
}

function handleFadeTimeUpdate(data) {
  elements.lampFadeDisplay.textContent = data.description;
  elements.fadeTime.value = data.fadeTime;
  updateFadeTimeDisplay();
}

function handleSimulationStateUpdate(data) {
  if (data.actualLevel !== undefined) {
    currentLampLevel = data.actualLevel;
  }
  if (data.lampPower !== undefined) {
    elements.simLampPower.checked = data.lampPower;
  }
  if (data.lampFailure !== undefined) {
    elements.simLampFailure.checked = data.lampFailure;
  }
  if (data.powerWatts !== undefined) {
    currentPowerWatts = data.powerWatts;
    elements.lampPowerWatts.textContent = `${currentPowerWatts} W`;
  }
  if (data.scenes !== undefined) {
    scenes = data.scenes;
    updateScenesGrid();
  }
  updateLampVisual(currentLampLevel);
}

function addToHistory(type, message, className) {
  const timestamp = new Date().toLocaleTimeString();
  const historyItem = {
    id: Date.now(),
    timestamp,
    type,
    message,
    className
  };

  commandHistory.unshift(historyItem);
  if (commandHistory.length > 100) {
    commandHistory.pop();
  }

  renderHistory();
}

function renderHistory() {
  if (commandHistory.length === 0) {
    elements.historyList.innerHTML = '<div class="history-empty">暂无命令历史</div>';
    return;
  }

  elements.historyList.innerHTML = commandHistory.map(item => `
    <div class="history-item ${item.className}">
      <span class="history-time">${item.timestamp}</span>
      <span class="history-type">[${item.type}]</span>
      <span class="history-message">${item.message}</span>
    </div>
  `).join('');
}

function clearHistory() {
  commandHistory = [];
  renderHistory();
}

function initEventListeners() {
  elements.refreshPorts.addEventListener('click', loadSerialPorts);
  elements.connectBtn.addEventListener('click', connectSerial);
  elements.disconnectBtn.addEventListener('click', disconnectSerial);

  elements.addrType.addEventListener('change', updateAddrValueState);
  elements.addrValue.addEventListener('input', updateAddressPreview);

  elements.dimmerSlider.addEventListener('input', (e) => {
    updateDimmerDisplay(e.target.value);
  });

  elements.dimmerOff.addEventListener('click', () => {
    elements.dimmerSlider.value = 0;
    updateDimmerDisplay(0);
  });
  elements.dimmerHalf.addEventListener('click', () => {
    elements.dimmerSlider.value = 127;
    updateDimmerDisplay(127);
  });
  elements.dimmerFull.addEventListener('click', () => {
    elements.dimmerSlider.value = 254;
    updateDimmerDisplay(254);
  });
  elements.sendDimmer.addEventListener('click', sendDimmerCommand);

  elements.fadeTime.addEventListener('input', updateFadeTimeDisplay);
  elements.sendFadeTime.addEventListener('click', sendFadeTimeCommand);

  elements.daliCommandMode.addEventListener('change', updateFramePreview);
  elements.daliCommand.addEventListener('input', updateFramePreview);
  elements.sendCommand.addEventListener('click', sendDALIRawCommand);

  elements.presetBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const cmdHex = btn.dataset.cmd;
      const mode = btn.dataset.mode;
      elements.daliCommand.value = cmdHex;
      elements.daliCommandMode.value = mode;
      updateFramePreview();
      sendDALIRawCommand();
    });
  });

  elements.clearHistory.addEventListener('click', clearHistory);

  elements.simLampPower.addEventListener('change', (e) => {
    setSimulationLampPower(e.target.checked);
  });
  elements.simLampFailure.addEventListener('change', (e) => {
    setSimulationLampFailure(e.target.checked);
  });

  elements.queryStatusBtn.addEventListener('click', queryFullStatus);
  elements.btnQueryPower.addEventListener('click', queryLampPower);
  elements.btnQueryFailure.addEventListener('click', queryLampFailure);
  elements.btnQueryLevel.addEventListener('click', queryLevel);
  elements.btnQueryFade.addEventListener('click', queryFade);

  elements.storeCurrentScene.addEventListener('click', storeCurrentScene);

  daliAPI.onSerialData(handleSerialData);
  daliAPI.onSerialClosed(() => {
    updateConnectionStatus(false);
    addToHistory('系统', '串口连接已关闭', 'info');
  });
  daliAPI.onLevelUpdate(handleLevelUpdate);
  daliAPI.onFadeTimeUpdate(handleFadeTimeUpdate);
  daliAPI.onSimulationStateUpdate(handleSimulationStateUpdate);
}

async function init() {
  initEventListeners();
  await loadSerialPorts();
  buildFadeTimeTable();
  buildScenesGrid();
  updateDimmerDisplay(elements.dimmerSlider.value);
  updateAddrValueState();
  updateAddressPreview();
  updateFadeTimeDisplay();
  updateLampVisual(128);

  try {
    scenes = await daliAPI.getAllScenes();
    updateScenesGrid();
  } catch (e) {}

  addToHistory('系统', 'DALI 控制器已启动 (模拟模式)', 'info');
  addToHistory('系统', '帧结构: 地址字节=YAAAAAAS (低位存地址), 命令字节=CCCCCCCC (高位存命令)', 'info');
}

document.addEventListener('DOMContentLoaded', init);

window.addEventListener('beforeunload', () => {
  daliAPI.removeSerialListeners();
});
