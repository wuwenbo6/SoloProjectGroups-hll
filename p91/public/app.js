let map;
let markers = {};
let selectedDevice = null;
let ws = null;

function initMap() {
  map = L.map('map').setView([39.9042, 116.4074], 5);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
  }).addTo(map);
}

function getStatusColor(status) {
  return status === 'online' ? '#48bb78' : '#f56565';
}

function createMarker(device) {
  if (!device.latitude || !device.longitude) return null;

  const icon = L.divIcon({
    className: 'device-marker',
    html: `<div style="
      width: 20px;
      height: 20px;
      background: ${getStatusColor(device.status)};
      border: 3px solid white;
      border-radius: 50%;
      box-shadow: 0 2px 6px rgba(0,0,0,0.3);
    "></div>`,
    iconSize: [20, 20],
    iconAnchor: [10, 10]
  });

  const marker = L.marker([device.latitude, device.longitude], { icon })
    .addTo(map)
    .on('click', () => selectDevice(device.id));

  const popupContent = `
    <div class="popup-content">
      <h4>${device.name || device.endpoint}</h4>
      <p><strong>状态:</strong> ${device.status === 'online' ? '在线' : '离线'}</p>
      <p><strong>位置:</strong> ${device.latitude?.toFixed(4)}, ${device.longitude?.toFixed(4)}</p>
      <p><strong>最后在线:</strong> ${formatTime(device.last_seen)}</p>
    </div>
  `;
  marker.bindPopup(popupContent);

  return marker;
}

function updateMarker(device) {
  if (markers[device.id]) {
    markers[device.id].remove();
  }

  if (device.latitude && device.longitude) {
    markers[device.id] = createMarker(device);
  }
}

function formatTime(timeStr) {
  if (!timeStr) return '未知';
  const date = new Date(timeStr);
  return date.toLocaleString('zh-CN');
}

function renderDeviceList(devices) {
  const listEl = document.getElementById('deviceList');
  listEl.innerHTML = '';

  devices.forEach(device => {
    const item = document.createElement('div');
    item.className = `device-item ${device.status}${selectedDevice === device.id ? ' selected' : ''}`;
    item.innerHTML = `
      <div class="device-name">${device.name || device.endpoint}</div>
      <div class="device-status">
        <span class="status-dot ${device.status}"></span>
        ${device.status === 'online' ? '在线' : '离线'}
        ${device.last_seen ? `· ${formatTime(device.last_seen)}` : ''}
      </div>
    `;
    item.onclick = () => selectDevice(device.id);
    listEl.appendChild(item);
  });

  document.getElementById('totalDevices').textContent = devices.length;
  document.getElementById('onlineDevices').textContent = devices.filter(d => d.status === 'online').length;
  document.getElementById('offlineDevices').textContent = devices.filter(d => d.status === 'offline').length;
}

function selectDevice(deviceId) {
  selectedDevice = deviceId;
  loadDeviceDetail(deviceId);
  loadDeviceSensorData(deviceId);
  loadDevices();
}

async function loadDeviceDetail(deviceId) {
  const detailEl = document.getElementById('deviceDetail');
  const infoEl = document.getElementById('deviceInfo');

  try {
    const res = await fetch(`/api/devices/${deviceId}`);
    const data = await res.json();
    const device = data.device;

    detailEl.style.display = 'block';
    infoEl.innerHTML = `
      <div class="info-row">
        <span class="info-label">设备名称</span>
        <span class="info-value">${device.name || device.endpoint}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Endpoint</span>
        <span class="info-value">${device.endpoint}</span>
      </div>
      <div class="info-row">
        <span class="info-label">状态</span>
        <span class="info-value" style="color: ${getStatusColor(device.status)}">${device.status === 'online' ? '在线' : '离线'}</span>
      </div>
      <div class="info-row">
        <span class="info-label">位置</span>
        <span class="info-value">${device.latitude ? `${device.latitude.toFixed(4)}, ${device.longitude.toFixed(4)}` : '未知'}</span>
      </div>
      <div class="info-row">
        <span class="info-label">注册时间</span>
        <span class="info-value">${formatTime(device.registered_at)}</span>
      </div>
      <div class="info-row">
        <span class="info-label">最后在线</span>
        <span class="info-value">${formatTime(device.last_seen)}</span>
      </div>
    `;

    if (device.latitude && device.longitude) {
      map.setView([device.latitude, device.longitude], 12);
    }
  } catch (error) {
    console.error('加载设备详情失败:', error);
  }
}

async function loadDeviceSensorData(deviceId) {
  const listEl = document.getElementById('sensorDataList');

  try {
    const res = await fetch(`/api/devices/${deviceId}/sensor-data?limit=20`);
    const data = await res.json();

    if (data.data.length === 0) {
      listEl.innerHTML = '<p style="color: #888; text-align: center; padding: 20px;">暂无传感器数据</p>';
      return;
    }

    listEl.innerHTML = data.data.map(item => `
      <div class="sensor-data-item">
        ${item.temperature !== null ? `<span class="temp">🌡️ ${item.temperature.toFixed(1)}°C</span>` : ''}
        ${item.latitude !== null ? `<span class="location">📍 ${item.latitude.toFixed(4)}, ${item.longitude.toFixed(4)}</span>` : ''}
        <span class="time">${formatTime(item.timestamp)}</span>
      </div>
    `).join('');
  } catch (error) {
    console.error('加载传感器数据失败:', error);
  }
}

async function sendRestartCommand() {
  if (!selectedDevice) return;

  try {
    const res = await fetch(`/api/devices/${selectedDevice}/restart`, {
      method: 'POST'
    });
    const data = await res.json();

    if (data.success) {
      showModal('命令已发送', '重启命令已下发到设备');
      loadCommands();
    } else {
      showModal('错误', data.error || '发送失败');
    }
  } catch (error) {
    showModal('错误', '发送命令失败: ' + error.message);
  }
}

function renderCommandList(commands) {
  const listEl = document.getElementById('commandList');

  if (commands.length === 0) {
    listEl.innerHTML = '<p style="color: #888; text-align: center; padding: 20px; grid-column: 1/-1;">暂无命令历史</p>';
    return;
  }

  listEl.innerHTML = commands.map(cmd => `
    <div class="command-item">
      <div class="command-device">设备: ${cmd.device_id}</div>
      <div class="command-text">命令: ${cmd.command}</div>
      <span class="command-status ${cmd.status}">${cmd.status === 'pending' ? '待执行' : '已执行'}</span>
      <div class="command-time">${formatTime(cmd.created_at)}</div>
    </div>
  `).join('');
}

async function loadDevices() {
  try {
    const res = await fetch('/api/devices');
    const data = await res.json();
    renderDeviceList(data.devices);

    data.devices.forEach(device => updateMarker(device));
  } catch (error) {
    console.error('加载设备列表失败:', error);
  }
}

async function loadCommands() {
  try {
    const res = await fetch('/api/commands');
    const data = await res.json();
    renderCommandList(data.commands);
  } catch (error) {
    console.error('加载命令历史失败:', error);
  }
}

function initWebSocket() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  ws = new WebSocket(`${protocol}//${window.location.host}`);

  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);

    switch (data.type) {
      case 'device-registered':
        console.log('新设备注册:', data.device);
        loadDevices();
        break;
      case 'device-offline':
        console.log('设备离线:', data.endpoint);
        loadDevices();
        break;
      case 'sensor-data':
        console.log('收到传感器数据:', data.data);
        loadDevices();
        if (selectedDevice === data.data.deviceId) {
          loadDeviceSensorData(selectedDevice);
        }
        break;
      case 'command-created':
        console.log('命令已创建:', data.data);
        loadCommands();
        break;
    }
  };

  ws.onclose = () => {
    console.log('WebSocket连接断开，3秒后重连...');
    setTimeout(initWebSocket, 3000);
  };
}

function showModal(title, message) {
  document.getElementById('modalTitle').textContent = title;
  document.getElementById('modalBody').textContent = message;
  document.getElementById('modal').style.display = 'flex';
}

function closeModal() {
  document.getElementById('modal').style.display = 'none';
}

document.addEventListener('DOMContentLoaded', () => {
  initMap();
  loadDevices();
  loadCommands();
  initWebSocket();

  document.getElementById('restartBtn').onclick = sendRestartCommand;
  document.getElementById('refreshDataBtn').onclick = () => {
    if (selectedDevice) {
      loadDeviceSensorData(selectedDevice);
    }
  };
});
