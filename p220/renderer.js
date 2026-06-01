const { ipcRenderer } = require('electron');

let fanTempChart = null;
let realtimeChart = null;
let refreshInterval = 5000;
let refreshTimer = null;
let isManualMode = false;
let isPidMode = false;
let currentVendor = null;
let chartData = {
  labels: [],
  fans: {},
  temps: {},
  maxDataPoints: 60
};

let sensorLog = [];

const mockData = false;

const MOCK_VENDORS = {
  dell: {
    id: 'dell', name: 'Dell', label: 'Dell iDRAC',
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
    id: 'hp', name: 'HP', label: 'HP iLO',
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
    id: 'lenovo', name: 'Lenovo', label: 'Lenovo XCC',
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
    id: 'generic', name: 'Generic', label: '通用 IPMI',
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

class PIDController {
  constructor(kp, ki, kd) {
    this.kp = kp;
    this.ki = ki;
    this.kd = kd;
    this.integral = 0;
    this.prevError = 0;
    this.output = 0;
  }

  compute(setpoint, measured, dt) {
    const error = measured - setpoint;
    this.integral += error * dt;
    this.integral = Math.max(-50, Math.min(50, this.integral));
    const derivative = (error - this.prevError) / dt;
    this.output = this.kp * error + this.ki * this.integral + this.kd * derivative;
    this.prevError = error;
    return { output: this.output, error, p: this.kp * error, i: this.ki * this.integral, d: this.kd * derivative };
  }

  reset() {
    this.integral = 0;
    this.prevError = 0;
    this.output = 0;
  }

  setParams(kp, ki, kd) {
    this.kp = kp;
    this.ki = ki;
    this.kd = kd;
  }
}

let pidController = new PIDController(2.0, 0.1, 0.5);
let pidActive = false;
let lastPidTime = null;
let currentPidPwm = 30;

document.addEventListener('DOMContentLoaded', () => {
  initCharts();
  setupEventListeners();
  initApp();
});

async function initApp() {
  await detectVendor();
  updateSessionStatus();
  startDataRefresh();
}

function initCharts() {
  const fanTempCtx = document.getElementById('fanTempChart').getContext('2d');
  fanTempChart = new Chart(fanTempCtx, {
    type: 'line',
    data: { labels: [], datasets: [] },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      scales: {
        x: { title: { display: true, text: '时间' } },
        y: {
          type: 'linear', display: true, position: 'left',
          title: { display: true, text: '转速 (RPM)' }
        },
        y1: {
          type: 'linear', display: true, position: 'right',
          title: { display: true, text: '温度 (°C)' },
          grid: { drawOnChartArea: false }
        }
      },
      plugins: { legend: { position: 'top' } }
    }
  });

  const realtimeCtx = document.getElementById('realtimeChart').getContext('2d');
  realtimeChart = new Chart(realtimeCtx, {
    type: 'line',
    data: {
      labels: [],
      datasets: [
        {
          label: '平均转速 (RPM)', data: [],
          borderColor: 'rgb(59, 130, 246)', backgroundColor: 'rgba(59, 130, 246, 0.1)',
          yAxisID: 'y', tension: 0.3, fill: true
        },
        {
          label: '平均温度 (°C)', data: [],
          borderColor: 'rgb(239, 68, 68)', backgroundColor: 'rgba(239, 68, 68, 0.1)',
          yAxisID: 'y1', tension: 0.3, fill: true
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: { title: { display: true, text: '时间' } },
        y: {
          type: 'linear', display: true, position: 'left',
          title: { display: true, text: '转速 (RPM)' }
        },
        y1: {
          type: 'linear', display: true, position: 'right',
          title: { display: true, text: '温度 (°C)' },
          grid: { drawOnChartArea: false }
        }
      },
      plugins: { legend: { position: 'top' } }
    }
  });
}

function setupEventListeners() {
  document.getElementById('btn-auto').addEventListener('click', () => setFanMode('auto'));
  document.getElementById('btn-manual').addEventListener('click', () => setFanMode('manual'));
  document.getElementById('btn-pid').addEventListener('click', () => setFanMode('pid'));

  const pwmSlider = document.getElementById('pwm-slider');
  pwmSlider.addEventListener('input', (e) => {
    document.getElementById('pwm-value').textContent = e.target.value;
    updatePwmPreview();
  });

  document.querySelectorAll('.preset-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const value = parseInt(e.target.dataset.value);
      pwmSlider.value = value;
      document.getElementById('pwm-value').textContent = value;
      updatePwmPreview();
    });
  });

  document.getElementById('zone-select').addEventListener('change', updatePwmPreview);
  document.getElementById('btn-apply-pwm').addEventListener('click', applyPWM);
  document.getElementById('btn-refresh-now').addEventListener('click', refreshData);
  document.getElementById('btn-clear-data').addEventListener('click', clearChartData);

  document.getElementById('refresh-interval').addEventListener('change', (e) => {
    refreshInterval = parseInt(e.target.value);
    restartRefreshTimer();
  });

  document.getElementById('show-fans').addEventListener('change', toggleFanDisplay);
  document.getElementById('show-temp').addEventListener('change', toggleTempDisplay);

  document.getElementById('vendor-select').addEventListener('change', onVendorSelect);
  document.getElementById('btn-redetect').addEventListener('click', detectVendor);
  document.getElementById('btn-reconnect').addEventListener('click', reconnectSession);

  document.getElementById('btn-pid-start').addEventListener('click', startPid);
  document.getElementById('btn-pid-stop').addEventListener('click', stopPid);
  document.getElementById('btn-export-csv').addEventListener('click', exportCsv);
}

async function detectVendor() {
  const badge = document.getElementById('vendor-badge');
  badge.textContent = '探测中...';
  badge.className = 'vendor-badge detecting';

  let result;
  if (mockData) {
    await new Promise(r => setTimeout(r, 800));
    result = { success: true, data: MOCK_VENDORS.dell };
  } else {
    result = await ipcRenderer.invoke('detect-vendor');
  }

  if (result.success && result.data) {
    currentVendor = result.data;
    updateVendorDisplay();
    updateZoneOptions();
    updatePwmPreview();
    updatePidZoneOptions();

    if (result.fallback) {
      badge.textContent = currentVendor.label + ' (默认)';
      badge.className = 'vendor-badge fallback';
      showMessage('厂商探测失败，使用默认配置: ' + result.error, 'info');
    } else {
      badge.textContent = currentVendor.label;
      badge.className = 'vendor-badge ' + currentVendor.id;
      showMessage('检测到厂商: ' + currentVendor.label, 'success');
    }
  } else {
    badge.textContent = '探测失败';
    badge.className = 'vendor-badge error';
    currentVendor = MOCK_VENDORS.generic;
    updateVendorDisplay();
  }
}

async function onVendorSelect() {
  const select = document.getElementById('vendor-select');
  const value = select.value;

  if (value === 'auto') {
    await detectVendor();
    return;
  }

  let result;
  if (mockData) {
    currentVendor = MOCK_VENDORS[value];
    result = { success: true, data: currentVendor };
  } else {
    result = await ipcRenderer.invoke('set-vendor', value);
  }

  if (result.success) {
    currentVendor = result.data;
    updateVendorDisplay();
    updateZoneOptions();
    updatePwmPreview();
    updatePidZoneOptions();

    const badge = document.getElementById('vendor-badge');
    badge.textContent = currentVendor.label + ' (手动)';
    badge.className = 'vendor-badge ' + currentVendor.id;
    showMessage('已切换到厂商: ' + currentVendor.label, 'success');
  }
}

function updateVendorDisplay() {
  const card = document.getElementById('vendor-info-card');
  card.style.display = 'block';

  document.getElementById('vendor-name').textContent = currentVendor.label;
  document.getElementById('register-manual').textContent = currentVendor.pwm.manualMode;
  document.getElementById('register-auto').textContent = currentVendor.pwm.autoMode;
  document.getElementById('register-pwm').textContent = currentVendor.pwm.setPwm;

  if (!mockData) {
    document.getElementById('vendor-select').value = currentVendor.id;
  }
}

function updateZoneOptions() {
  const select = document.getElementById('zone-select');
  const currentValue = select.value;

  select.innerHTML = '';
  if (currentVendor && currentVendor.zones) {
    currentVendor.zones.forEach(zone => {
      const option = document.createElement('option');
      option.value = zone.value;
      option.textContent = zone.label;
      select.appendChild(option);
    });
  } else {
    select.innerHTML = '<option value="00">Zone 0</option><option value="01">Zone 1</option>';
  }

  select.value = currentValue;
}

function updatePidZoneOptions() {
  const select = document.getElementById('pid-zone');
  const currentValue = select.value;

  select.innerHTML = '';
  if (currentVendor && currentVendor.zones) {
    currentVendor.zones.forEach(zone => {
      const option = document.createElement('option');
      option.value = zone.value;
      option.textContent = zone.label;
      select.appendChild(option);
    });
  } else {
    select.innerHTML = '<option value="00">Zone 0</option><option value="01">Zone 1</option>';
  }

  select.value = currentValue;
}

function updatePwmPreview() {
  if (!isManualMode || !currentVendor) return;

  const duty = parseInt(document.getElementById('pwm-slider').value);
  const zone = document.getElementById('zone-select').value;
  const hexDuty = Math.round(duty * 255 / 100).toString(16).padStart(2, '0');
  const command = currentVendor.pwm.setPwm
    .replace('{zone}', zone)
    .replace('{hexDuty}', hexDuty);

  const preview = document.getElementById('pwm-register-preview');
  preview.style.display = 'block';
  document.getElementById('pwm-command-preview').textContent = 'ipmitool ' + command;
}

async function reconnectSession() {
  showMessage('正在重连 IPMI session...', 'info');

  let result;
  if (mockData) {
    await new Promise(r => setTimeout(r, 500));
    result = { success: true };
  } else {
    result = await ipcRenderer.invoke('session-reconnect');
  }

  if (result.success) {
    updateSessionStatus();
    showMessage('Session 重连成功', 'success');
  } else {
    showMessage('Session 重连失败: ' + result.error, 'error');
  }
}

async function updateSessionStatus() {
  let result;
  if (mockData) {
    result = { active: true };
  } else {
    result = await ipcRenderer.invoke('session-status');
  }

  const el = document.getElementById('session-status');
  if (result.active) {
    el.textContent = 'Session: 已连接';
    el.className = 'status connected';
  } else {
    el.textContent = 'Session: 未连接';
    el.className = 'status disconnected';
  }
}

function updateModeButtons(mode) {
  const btnAuto = document.getElementById('btn-auto');
  const btnManual = document.getElementById('btn-manual');
  const btnPid = document.getElementById('btn-pid');

  [btnAuto, btnManual, btnPid].forEach(b => b.classList.remove('active'));

  if (mode === 'auto') btnAuto.classList.add('active');
  else if (mode === 'manual') btnManual.classList.add('active');
  else if (mode === 'pid') btnPid.classList.add('active');
}

async function setFanMode(mode) {
  const pwmControls = ['pwm-slider', 'zone-select', 'btn-apply-pwm'];
  const presetBtns = document.querySelectorAll('.preset-btn');
  const modeInfo = document.getElementById('current-mode-info');

  if (pidActive && mode !== 'pid') {
    stopPid();
  }

  let result;
  if (mode === 'auto') {
    result = mockData ? { success: true } : await ipcRenderer.invoke('set-fan-auto');
    if (result.success) {
      isManualMode = false;
      isPidMode = false;
      updateModeButtons('auto');
      pwmControls.forEach(id => document.getElementById(id).disabled = true);
      presetBtns.forEach(btn => btn.disabled = true);
      modeInfo.textContent = '当前: 自动模式' + (result.command ? ` (${result.command})` : '');
      document.getElementById('pwm-register-preview').style.display = 'none';
      showMessage('已切换到自动模式', 'success');
    }
  } else if (mode === 'manual') {
    result = mockData ? { success: true } : await ipcRenderer.invoke('set-fan-manual');
    if (result.success) {
      isManualMode = true;
      isPidMode = false;
      updateModeButtons('manual');
      pwmControls.forEach(id => document.getElementById(id).disabled = false);
      presetBtns.forEach(btn => btn.disabled = false);
      modeInfo.textContent = '当前: 手动模式' + (result.command ? ` (${result.command})` : '');
      updatePwmPreview();
      showMessage('已切换到手动模式', 'success');
    }
  } else if (mode === 'pid') {
    result = mockData ? { success: true } : await ipcRenderer.invoke('set-fan-manual');
    if (result.success) {
      isManualMode = false;
      isPidMode = true;
      updateModeButtons('pid');
      pwmControls.forEach(id => document.getElementById(id).disabled = true);
      presetBtns.forEach(btn => btn.disabled = true);
      modeInfo.textContent = '当前: PID 闭环模式 - 请在下方配置参数后启动';
      document.getElementById('pwm-register-preview').style.display = 'none';
      showMessage('已进入 PID 模式，请配置参数后点击启动', 'info');
    }
  }

  if (!result.success) {
    showMessage('切换模式失败: ' + result.error, 'error');
  }
}

async function startPid() {
  const targetTemp = parseFloat(document.getElementById('pid-target-temp').value);
  const sensorSelect = document.getElementById('pid-temp-sensor');
  const kp = parseFloat(document.getElementById('pid-kp').value);
  const ki = parseFloat(document.getElementById('pid-ki').value);
  const kd = parseFloat(document.getElementById('pid-kd').value);

  if (!sensorSelect.value) {
    showMessage('请先选择温度传感器', 'error');
    return;
  }

  if (isNaN(targetTemp) || targetTemp < 20 || targetTemp > 90) {
    showMessage('目标温度应在 20-90°C 范围内', 'error');
    return;
  }

  pidController = new PIDController(kp, ki, kd);
  pidController.reset();
  lastPidTime = Date.now();
  currentPidPwm = 30;
  pidActive = true;

  if (!isPidMode) {
    const result = mockData ? { success: true } : await ipcRenderer.invoke('set-fan-manual');
    if (!result.success) {
      showMessage('切换手动模式失败: ' + result.error, 'error');
      pidActive = false;
      return;
    }
    isPidMode = true;
    isManualMode = false;
    updateModeButtons('pid');
    const modeInfo = document.getElementById('current-mode-info');
    modeInfo.textContent = '当前: PID 闭环模式 - 运行中';
  }

  document.getElementById('btn-pid-start').disabled = true;
  document.getElementById('btn-pid-stop').disabled = false;
  document.getElementById('pid-status').style.display = 'flex';

  const pidInputs = document.querySelectorAll('#pid-control-card input, #pid-control-card select');
  pidInputs.forEach(el => el.disabled = true);

  showMessage(`PID 启动: 目标 ${targetTemp}°C, Kp=${kp}, Ki=${ki}, Kd=${kd}`, 'success');
}

function stopPid() {
  pidActive = false;
  document.getElementById('btn-pid-start').disabled = false;
  document.getElementById('btn-pid-stop').disabled = true;
  document.getElementById('pid-status').style.display = 'none';

  const pidInputs = document.querySelectorAll('#pid-control-card input, #pid-control-card select');
  pidInputs.forEach(el => el.disabled = false);

  if (isPidMode) {
    isPidMode = false;
    const modeInfo = document.getElementById('current-mode-info');
    modeInfo.textContent = '当前: PID 闭环模式 - 已停止';
  }

  showMessage('PID 已停止', 'info');
}

function updatePidTempSensorOptions(temps) {
  const select = document.getElementById('pid-temp-sensor');
  const currentValue = select.value;

  const existingOptions = Array.from(select.options).map(o => o.value);
  const newNames = temps.map(t => t.name);

  if (JSON.stringify(existingOptions.filter(v => v)) !== JSON.stringify(newNames)) {
    select.innerHTML = '';
    if (newNames.length === 0) {
      select.innerHTML = '<option value="">-- 请先采集数据 --</option>';
    } else {
      newNames.forEach(name => {
        const option = document.createElement('option');
        option.value = name;
        option.textContent = name;
        select.appendChild(option);
      });
    }
  }

  if (currentValue && newNames.includes(currentValue)) {
    select.value = currentValue;
  } else if (newNames.length > 0) {
    select.value = newNames[0];
  }
}

async function runPidCycle(temps) {
  if (!pidActive) return;

  const sensorName = document.getElementById('pid-temp-sensor').value;
  const targetTemp = parseFloat(document.getElementById('pid-target-temp').value);
  const minPwm = parseInt(document.getElementById('pid-min-pwm').value);
  const maxPwm = parseInt(document.getElementById('pid-max-pwm').value);
  const zone = document.getElementById('pid-zone').value;

  const sensor = temps.find(t => t.name === sensorName);
  if (!sensor) return;

  const now = Date.now();
  const dt = lastPidTime ? (now - lastPidTime) / 1000 : refreshInterval / 1000;
  lastPidTime = now;

  const pidResult = pidController.compute(targetTemp, sensor.temp, dt);

  let pwmDelta = -pidResult.output;
  currentPidPwm = Math.max(minPwm, Math.min(maxPwm, currentPidPwm + pwmDelta));
  const finalPwm = Math.round(currentPidPwm);

  document.getElementById('pid-error').textContent = pidResult.error.toFixed(2) + ' °C';
  document.getElementById('pid-output').textContent = pidResult.output.toFixed(2);
  document.getElementById('pid-current-pwm').textContent = finalPwm + '%';
  document.getElementById('pid-current-temp').textContent = sensor.temp.toFixed(1) + ' °C';

  const result = mockData ? { success: true } : await ipcRenderer.invoke('set-fan-pwm', zone, finalPwm);
  if (!result.success) {
    showMessage('PID PWM 设置失败: ' + result.error, 'error');
  }
}

async function applyPWM() {
  const duty = parseInt(document.getElementById('pwm-slider').value);
  const zone = document.getElementById('zone-select').value;

  const result = mockData ? { success: true, command: 'mock' } : await ipcRenderer.invoke('set-fan-pwm', zone, duty);

  if (result.success) {
    showMessage(`PWM 设置成功: ${duty}%` + (result.command ? ` (${result.command})` : ''), 'success');
  } else {
    showMessage('PWM 设置失败: ' + result.error, 'error');
  }
}

async function refreshData() {
  const fanResult = mockData ? getMockFanData() : await ipcRenderer.invoke('get-fan-speed');
  const tempResult = mockData ? getMockTempData() : await ipcRenderer.invoke('get-temperature');

  if (fanResult.success) {
    displayFanData(fanResult.data);
    updateChartFanData(fanResult.data);
  } else {
    displayFanError(fanResult.error);
  }

  if (tempResult.success) {
    displayTempData(tempResult.data);
    updateChartTempData(tempResult.data);
    updatePidTempSensorOptions(tempResult.data);
    if (pidActive) {
      await runPidCycle(tempResult.data);
    }
  } else {
    displayTempError(tempResult.error);
  }

  if (fanResult.success && tempResult.success) {
    recordLog(fanResult.data, tempResult.data);
  }

  updateLastUpdateTime();
  updateSessionStatus();
}

async function getFanSpeed() {
  const result = mockData ? getMockFanData() : await ipcRenderer.invoke('get-fan-speed');

  if (result.success) {
    displayFanData(result.data);
    updateChartFanData(result.data);
  } else {
    displayFanError(result.error);
  }
}

async function getTemperature() {
  const result = mockData ? getMockTempData() : await ipcRenderer.invoke('get-temperature');

  if (result.success) {
    displayTempData(result.data);
    updateChartTempData(result.data);
  } else {
    displayTempError(result.error);
  }
}

function getMockFanData() {
  return {
    success: true,
    data: [
      { name: 'Fan1', speed: 2400 + Math.random() * 200, unit: 'RPM' },
      { name: 'Fan2', speed: 2350 + Math.random() * 200, unit: 'RPM' },
      { name: 'Fan3', speed: 2450 + Math.random() * 200, unit: 'RPM' },
      { name: 'Fan4', speed: 2380 + Math.random() * 200, unit: 'RPM' }
    ]
  };
}

function getMockTempData() {
  return {
    success: true,
    data: [
      { name: 'CPU Temp', temp: 45 + Math.random() * 10, unit: 'degrees C' },
      { name: 'System Temp', temp: 38 + Math.random() * 5, unit: 'degrees C' },
      { name: 'Peripheral Temp', temp: 35 + Math.random() * 5, unit: 'degrees C' }
    ]
  };
}

function recordLog(fans, temps) {
  const timestamp = new Date().toISOString();
  const entry = {
    timestamp,
    fans: fans.map(f => ({ name: f.name, speed: Math.round(f.speed) })),
    temps: temps.map(t => ({ name: t.name, temp: parseFloat(t.temp.toFixed(1)) })),
    pidActive,
    pidPwm: pidActive ? Math.round(currentPidPwm) : null
  };
  sensorLog.push(entry);
}

function displayFanData(fans) {
  const fanList = document.getElementById('fan-list');
  if (!fans || fans.length === 0) {
    fanList.innerHTML = '<div class="no-data">未找到风扇数据</div>';
    return;
  }
  fanList.innerHTML = fans.map(fan => `
    <div class="sensor-item">
      <span class="sensor-name">${fan.name}</span>
      <span class="sensor-value fan-value">${Math.round(fan.speed)} ${fan.unit}</span>
    </div>
  `).join('');
}

function displayTempData(temps) {
  const tempList = document.getElementById('temp-list');
  if (!temps || temps.length === 0) {
    tempList.innerHTML = '<div class="no-data">未找到温度数据</div>';
    return;
  }
  tempList.innerHTML = temps.map(temp => `
    <div class="sensor-item">
      <span class="sensor-name">${temp.name}</span>
      <span class="sensor-value temp-value">${temp.temp.toFixed(1)} °C</span>
    </div>
  `).join('');
}

function displayFanError(error) {
  document.getElementById('fan-list').innerHTML = `<div class="error">读取失败: ${error}</div>`;
}

function displayTempError(error) {
  document.getElementById('temp-list').innerHTML = `<div class="error">读取失败: ${error}</div>`;
}

function updateChartFanData(fans) {
  const time = new Date().toLocaleTimeString();
  fans.forEach(fan => {
    if (!chartData.fans[fan.name]) chartData.fans[fan.name] = [];
    chartData.fans[fan.name].push(fan.speed);
    if (chartData.fans[fan.name].length > chartData.maxDataPoints) chartData.fans[fan.name].shift();
  });
  if (!chartData.labels.includes(time)) {
    chartData.labels.push(time);
    if (chartData.labels.length > chartData.maxDataPoints) chartData.labels.shift();
  }
  updateCharts();
}

function updateChartTempData(temps) {
  const time = new Date().toLocaleTimeString();
  temps.forEach(temp => {
    if (!chartData.temps[temp.name]) chartData.temps[temp.name] = [];
    chartData.temps[temp.name].push(temp.temp);
    if (chartData.temps[temp.name].length > chartData.maxDataPoints) chartData.temps[temp.name].shift();
  });
  if (!chartData.labels.includes(time)) {
    chartData.labels.push(time);
    if (chartData.labels.length > chartData.maxDataPoints) chartData.labels.shift();
  }
  updateCharts();
}

function updateCharts() {
  const showFans = document.getElementById('show-fans').checked;
  const showTemp = document.getElementById('show-temp').checked;

  const fanColors = [
    { border: 'rgb(59, 130, 246)', bg: 'rgba(59, 130, 246, 0.1)' },
    { border: 'rgb(16, 185, 129)', bg: 'rgba(16, 185, 129, 0.1)' },
    { border: 'rgb(139, 92, 246)', bg: 'rgba(139, 92, 246, 0.1)' },
    { border: 'rgb(245, 158, 11)', bg: 'rgba(245, 158, 11, 0.1)' }
  ];

  const tempColors = [
    { border: 'rgb(239, 68, 68)', bg: 'rgba(239, 68, 68, 0.1)' },
    { border: 'rgb(236, 72, 153)', bg: 'rgba(236, 72, 153, 0.1)' },
    { border: 'rgb(249, 115, 22)', bg: 'rgba(249, 115, 22, 0.1)' }
  ];

  const datasets = [];

  if (showFans) {
    Object.keys(chartData.fans).forEach((name, index) => {
      datasets.push({
        label: name, data: chartData.fans[name],
        borderColor: fanColors[index % fanColors.length].border,
        backgroundColor: fanColors[index % fanColors.length].bg,
        yAxisID: 'y', tension: 0.3, fill: false
      });
    });
  }

  if (showTemp) {
    Object.keys(chartData.temps).forEach((name, index) => {
      datasets.push({
        label: name, data: chartData.temps[name],
        borderColor: tempColors[index % tempColors.length].border,
        backgroundColor: tempColors[index % tempColors.length].bg,
        yAxisID: 'y1', tension: 0.3, fill: false
      });
    });
  }

  fanTempChart.data.labels = [...chartData.labels];
  fanTempChart.data.datasets = datasets;
  fanTempChart.update('none');

  const avgFanSpeed = calculateAverage(Object.values(chartData.fans));
  const avgTemp = calculateAverage(Object.values(chartData.temps));

  realtimeChart.data.labels = [...chartData.labels];
  realtimeChart.data.datasets[0].data = avgFanSpeed;
  realtimeChart.data.datasets[1].data = avgTemp;
  realtimeChart.update('none');
}

function calculateAverage(dataArrays) {
  if (dataArrays.length === 0) return [];
  const maxLength = Math.max(...dataArrays.map(arr => arr.length));
  const result = [];
  for (let i = 0; i < maxLength; i++) {
    let sum = 0, count = 0;
    dataArrays.forEach(arr => {
      if (arr[i] !== undefined) { sum += arr[i]; count++; }
    });
    result.push(count > 0 ? sum / count : 0);
  }
  return result;
}

function toggleFanDisplay() { updateCharts(); }
function toggleTempDisplay() { updateCharts(); }

function clearChartData() {
  chartData = { labels: [], fans: {}, temps: {}, maxDataPoints: 60 };
  sensorLog = [];
  updateCharts();
  showMessage('图表数据和日志已清除', 'success');
}

function updateLastUpdateTime() {
  const now = new Date().toLocaleString();
  document.getElementById('last-update').textContent = `上次更新: ${now}`;
}

function startDataRefresh() {
  refreshData();
  restartRefreshTimer();
}

function restartRefreshTimer() {
  if (refreshTimer) clearInterval(refreshTimer);
  refreshTimer = setInterval(refreshData, refreshInterval);
}

async function exportCsv() {
  if (sensorLog.length === 0) {
    showMessage('没有可导出的日志数据，请先采集', 'error');
    return;
  }

  const allFanNames = new Set();
  const allTempNames = new Set();
  sensorLog.forEach(entry => {
    entry.fans.forEach(f => allFanNames.add(f.name));
    entry.temps.forEach(t => allTempNames.add(t.name));
  });

  const fanNameList = Array.from(allFanNames);
  const tempNameList = Array.from(allTempNames);

  const headers = ['时间'];
  fanNameList.forEach(name => headers.push(name + ' (RPM)'));
  tempNameList.forEach(name => headers.push(name + ' (°C)'));
  headers.push('PID 模式');
  headers.push('PID PWM (%)');

  const rows = sensorLog.map(entry => {
    const row = [entry.timestamp];
    fanNameList.forEach(name => {
      const fan = entry.fans.find(f => f.name === name);
      row.push(fan ? fan.speed : '');
    });
    tempNameList.forEach(name => {
      const temp = entry.temps.find(t => t.name === name);
      row.push(temp ? temp.temp : '');
    });
    row.push(entry.pidActive ? '是' : '否');
    row.push(entry.pidPwm !== null ? entry.pidPwm : '');
    return row.join(',');
  });

  const csvContent = [headers.join(','), ...rows].join('\n');

  const result = mockData
    ? { success: true, filePath: 'mock-export.csv' }
    : await ipcRenderer.invoke('export-csv', csvContent);

  if (result.success) {
    showMessage('CSV 导出成功: ' + result.filePath, 'success');
  } else if (!result.canceled) {
    showMessage('CSV 导出失败: ' + result.error, 'error');
  }
}

function showMessage(text, type = 'info') {
  const container = document.getElementById('message-container');
  const msg = document.createElement('div');
  msg.className = `message ${type}`;
  msg.textContent = text;
  container.appendChild(msg);
  setTimeout(() => { msg.remove(); }, 3000);
}
