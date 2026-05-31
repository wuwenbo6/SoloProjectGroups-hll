const { ipcRenderer } = require('electron');

let devices = [];
let packets = [];
let filteredPackets = [];
let selectedDevice = null;
let selectedPacketIndex = -1;
let isCapturing = false;
let pendingPackets = [];
let renderFrameId = null;

const MAX_DISPLAY_PACKETS = 2000;
const RENDER_BATCH_SIZE = 100;

const $ = (id) => document.getElementById(id);

function parseSetupPacket(data) {
  if (!data || data.length < 8) return null;
  
  const bmRequestType = data[0];
  const bRequest = data[1];
  const wValue = data[2] | (data[3] << 8);
  const wIndex = data[4] | (data[5] << 8);
  const wLength = data[6] | (data[7] << 8);
  
  const USB_DIR_MASK = 0x80;
  const USB_DIR_IN = 0x80;
  
  const direction = (bmRequestType & USB_DIR_MASK) === USB_DIR_IN ? 'in' : 'out';
  
  const requestTypes = ['Standard', 'Class', 'Vendor', 'Reserved'];
  const recipients = ['Device', 'Interface', 'Endpoint', 'Other'];
  
  return {
    bmRequestType: '0x' + bmRequestType.toString(16).padStart(2, '0'),
    bRequest: '0x' + bRequest.toString(16).padStart(2, '0'),
    wValue: '0x' + wValue.toString(16).padStart(4, '0'),
    wIndex: '0x' + wIndex.toString(16).padStart(4, '0'),
    wLength: wLength,
    direction,
    directionBit: (bmRequestType & USB_DIR_MASK) === USB_DIR_IN ? 'IN (Device→Host)' : 'OUT (Host→Device)',
    requestType: requestTypes[(bmRequestType >> 5) & 0x03],
    recipient: recipients[bmRequestType & 0x1f]
  };
}

function getStandardRequestName(bRequest) {
  const requests = {
    0x00: 'GET_STATUS',
    0x01: 'CLEAR_FEATURE',
    0x03: 'SET_FEATURE',
    0x05: 'SET_ADDRESS',
    0x06: 'GET_DESCRIPTOR',
    0x07: 'SET_DESCRIPTOR',
    0x08: 'GET_CONFIGURATION',
    0x09: 'SET_CONFIGURATION',
    0x0a: 'GET_INTERFACE',
    0x0b: 'SET_INTERFACE',
    0x0c: 'SYNCH_FRAME'
  };
  return requests[bRequest] || 'Unknown';
}

async function refreshDevices() {
  $('statusText').textContent = '正在扫描设备...';
  devices = await ipcRenderer.invoke('get-devices');
  renderDeviceList();
  $('statusText').textContent = `找到 ${devices.length} 个设备`;
}

function renderDeviceList() {
  const list = $('deviceList');
  list.innerHTML = '';
  
  devices.forEach((device, index) => {
    const item = document.createElement('div');
    item.className = 'device-item';
    if (selectedDevice === index) item.classList.add('selected');
    
    const vid = `0x${device.vendorId.toString(16).padStart(4, '0')}`;
    const pid = `0x${device.productId.toString(16).padStart(4, '0')}`;
    
    item.innerHTML = `
      <div class="device-name">设备 ${index + 1} ${device.error ? '(无法访问)' : ''}</div>
      <div class="device-info">总线 ${device.busNumber}, 地址 ${device.deviceAddress}</div>
      <div class="device-info">VID: ${vid}, PID: ${pid}</div>
    `;
    
    item.onclick = () => selectDevice(index);
    list.appendChild(item);
  });
}

function selectDevice(index) {
  selectedDevice = index;
  renderDeviceList();
  renderDeviceDetails();
}

function renderDeviceDetails() {
  const details = $('deviceDetails');
  if (selectedDevice === null || !devices[selectedDevice]) {
    details.innerHTML = '选择一个设备查看详情';
    return;
  }
  
  const device = devices[selectedDevice];
  if (device.error) {
    details.innerHTML = `<div style="color: #c94c4c;">错误: ${device.error}</div>`;
    return;
  }
  
  let html = '';
  
  html += '<div class="detail-section">';
  html += '<div class="detail-title">设备描述符</div>';
  for (const [key, value] of Object.entries(device.deviceDescriptor)) {
    html += `<div class="detail-row"><span class="detail-label">${key}</span><span class="detail-value">${value}</span></div>`;
  }
  html += '</div>';
  
  if (device.configDescriptor) {
    html += '<div class="detail-section">';
    html += '<div class="detail-title">配置描述符</div>';
    const cfg = device.configDescriptor;
    html += `<div class="detail-row"><span class="detail-label">wTotalLength</span><span class="detail-value">${cfg.wTotalLength}</span></div>`;
    html += `<div class="detail-row"><span class="detail-label">bNumInterfaces</span><span class="detail-value">${cfg.bNumInterfaces}</span></div>`;
    html += `<div class="detail-row"><span class="detail-label">bMaxPower</span><span class="detail-value">${cfg.bMaxPower * 2}mA</span></div>`;
    html += '</div>';
    
    if (cfg.interfaces) {
      cfg.interfaces.forEach((iface, i) => {
        html += '<div class="detail-section">';
        html += `<div class="detail-title">接口 ${i}</div>`;
        html += `<div class="detail-row"><span class="detail-label">bInterfaceClass</span><span class="detail-value">${iface.bInterfaceClass}</span></div>`;
        html += `<div class="detail-row"><span class="detail-label">bNumEndpoints</span><span class="detail-value">${iface.bNumEndpoints}</span></div>`;
        html += '</div>';
        
        if (iface.endpoints) {
          iface.endpoints.forEach((ep, j) => {
            html += '<div class="detail-section">';
            html += `<div class="detail-title">端点 ${j}</div>`;
            html += `<div class="detail-row"><span class="detail-label">bEndpointAddress</span><span class="detail-value">0x${ep.bEndpointAddress.toString(16)}</span></div>`;
            html += `<div class="detail-row"><span class="detail-label">wMaxPacketSize</span><span class="detail-value">${ep.wMaxPacketSize}</span></div>`;
            html += '</div>';
          });
        }
      });
    }
  }
  
  details.innerHTML = html;
}

function startCapture() {
  if (isCapturing) return;
  ipcRenderer.invoke('start-capture');
  isCapturing = true;
  packets = [];
  filteredPackets = [];
  pendingPackets = [];
  selectedPacketIndex = -1;
  $('startBtn').disabled = true;
  $('stopBtn').disabled = false;
  $('statusText').textContent = '正在捕获...';
  renderPacketList();
}

function stopCapture() {
  if (!isCapturing) return;
  ipcRenderer.invoke('stop-capture');
  isCapturing = false;
  $('startBtn').disabled = false;
  $('stopBtn').disabled = true;
  flushPendingPackets();
  $('statusText').textContent = `捕获停止，共 ${packets.length} 个数据包`;
}

function flushPendingPackets() {
  if (pendingPackets.length === 0) return;
  
  const fragment = document.createDocumentFragment();
  const list = $('packetList');
  
  let added = 0;
  for (const packet of pendingPackets) {
    const originalIndex = packets.length;
    packets.push(packet);
    
    if (matchesFilters(packet)) {
      filteredPackets.push({ originalIndex, packet });
      if (filteredPackets.length <= MAX_DISPLAY_PACKETS) {
        const row = createPacketRow(originalIndex, packet);
        fragment.appendChild(row);
        added++;
      }
    }
  }
  
  if (added > 0) {
    list.appendChild(fragment);
    const excess = filteredPackets.length - MAX_DISPLAY_PACKETS;
    if (excess > 0) {
      const rows = list.querySelectorAll('.packet-row');
      if (rows.length > MAX_DISPLAY_PACKETS) {
        for (let i = 0; i < rows.length - MAX_DISPLAY_PACKETS; i++) {
          rows[i].remove();
        }
      }
    }
  }
  
  pendingPackets = [];
  $('packetCount').textContent = `${packets.length} 个数据包`;
}

function scheduleRender() {
  if (renderFrameId) return;
  
  renderFrameId = requestAnimationFrame(() => {
    flushPendingPackets();
    renderFrameId = null;
  });
}

ipcRenderer.on('urb-packet', (event, packet) => {
  pendingPackets.push(packet);
  if (pendingPackets.length >= RENDER_BATCH_SIZE) {
    flushPendingPackets();
  } else {
    scheduleRender();
  }
});

ipcRenderer.on('urb-batch', (event, batch) => {
  if (!batch || batch.length === 0) return;
  
  pendingPackets.push(...batch);
  if (pendingPackets.length >= RENDER_BATCH_SIZE) {
    flushPendingPackets();
  } else {
    scheduleRender();
  }
});

function matchesFilters(packet) {
  const dir = $('dirFilter').value;
  const type = $('typeFilter').value;
  const ep = $('epFilter').value;
  const search = $('searchInput').value.toLowerCase();
  
  if (dir !== 'all' && packet.direction !== dir) return false;
  if (type !== 'all' && packet.type !== type) return false;
  if (ep !== 'all' && packet.endpoint !== parseInt(ep)) return false;
  
  if (search) {
    const dataStr = packet.data ? packet.data.map(b => b.toString(16).padStart(2, '0')).join(' ') : '';
    const searchLower = search.toLowerCase();
    if (!dataStr.includes(searchLower) && 
        !packet.type.toLowerCase().includes(searchLower) &&
        !packet.endpoint.toString().includes(searchLower) &&
        packet.direction.toLowerCase().includes(searchLower)) {
      return false;
    }
  }
  
  return true;
}

function applyFilters() {
  filteredPackets = [];
  packets.forEach((packet, index) => {
    if (matchesFilters(packet)) {
      filteredPackets.push({ originalIndex: index, packet });
    }
  });
  renderPacketList();
}

function renderPacketList() {
  const list = $('packetList');
  list.innerHTML = '';
  
  const displayPackets = filteredPackets.slice(-MAX_DISPLAY_PACKETS);
  const fragment = document.createDocumentFragment();
  
  displayPackets.forEach(({ originalIndex, packet }) => {
    const row = createPacketRow(originalIndex, packet);
    fragment.appendChild(row);
  });
  
  list.appendChild(fragment);
  
  if (filteredPackets.length > MAX_DISPLAY_PACKETS) {
    const more = document.createElement('div');
    more.style.padding = '10px';
    more.style.textAlign = 'center';
    more.style.color = '#888';
    more.textContent = `显示最新 ${MAX_DISPLAY_PACKETS} 个，共 ${filteredPackets.length} 个数据包`;
    list.insertBefore(more, list.firstChild);
  }
}

function createPacketRow(index, packet) {
  const row = document.createElement('div');
  row.className = 'packet-row';
  row.dataset.index = index;
  
  if (packet.status === 'error') row.classList.add('error');
  row.classList.add(packet.direction);
  if (packet.isControlTransfer) row.style.borderLeft = '3px solid #4ec9b0';
  
  const time = new Date(packet.timestamp);
  const timeStr = time.toLocaleTimeString() + '.' + Math.floor(packet.timestamp % 1000).toString().padStart(3, '0');
  
  const typeLabel = packet.isControlTransfer ? `CTRL ${packet.type}` : packet.type;
  
  row.innerHTML = `
    <div>${index + 1}</div>
    <div>${timeStr}</div>
    <div>${typeLabel}</div>
    <div>${packet.direction.toUpperCase()}</div>
    <div>EP ${packet.endpoint}</div>
    <div>${packet.length} bytes</div>
  `;
  
  row.onclick = () => selectPacket(index);
  return row;
}

function appendPacketRow(index, packet) {
  const list = $('packetList');
  const row = createPacketRow(index, packet);
  list.appendChild(row);
}

function selectPacket(index) {
  selectedPacketIndex = index;
  
  document.querySelectorAll('.packet-row').forEach(row => {
    row.classList.toggle('selected', parseInt(row.dataset.index) === index);
  });
  
  renderHexView(packets[index]);
}

function renderHexView(packet) {
  const view = $('hexView');
  if (!packet || !packet.data) {
    view.textContent = '无数据';
    return;
  }
  
  const data = packet.data;
  let html = '';
  
  let infoHtml = `<div style="margin-bottom: 10px; padding-bottom: 10px; border-bottom: 1px solid #3e3e3e;">
    <strong>类型:</strong> ${packet.type} | 
    <strong>方向:</strong> ${packet.direction.toUpperCase()} | 
    <strong>端点:</strong> ${packet.endpoint} | 
    <strong>长度:</strong> ${data.length} bytes |
    <strong>状态:</strong> ${packet.status}`;
  
  if (packet.isControlTransfer) {
    infoHtml += ` | <strong style="color: #4ec9b0;">控制传输</strong>`;
  }
  infoHtml += '</div>';
  
  if (packet.isControlTransfer || (packet.setupPacket && data.length >= 8)) {
    const setup = packet.setupPacket || parseSetupPacket(data);
    if (setup) {
      const bRequestNum = parseInt(setup.bRequest) || 0;
      const requestName = getStandardRequestName(bRequestNum);
      
      infoHtml += `<div style="margin-bottom: 10px; padding: 10px; background: #2a2d2e; border-radius: 4px;">
        <div style="font-weight: bold; color: #4ec9b0; margin-bottom: 8px;">Setup Packet (bmRequestType: ${setup.bmRequestType})</div>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 4px; font-size: 12px;">
          <div><span style="color: #9cdcfe;">bmRequestType:</span> ${setup.bmRequestType}</div>
          <div><span style="color: #9cdcfe;">bRequest:</span> ${setup.bRequest} (${requestName})</div>
          <div><span style="color: #9cdcfe;">wValue:</span> ${setup.wValue}</div>
          <div><span style="color: #9cdcfe;">wIndex:</span> ${setup.wIndex}</div>
          <div><span style="color: #9cdcfe;">wLength:</span> ${setup.wLength} bytes</div>
          <div><span style="color: #9cdcfe;">方向:</span> ${setup.directionBit || setup.direction}</div>
          <div><span style="color: #9cdcfe;">类型:</span> ${setup.requestType || 'N/A'}</div>
          <div><span style="color: #9cdcfe;">接收者:</span> ${setup.recipient || 'N/A'}</div>
        </div>
      </div>`;
    }
  }
  
  html = infoHtml;
  
  for (let i = 0; i < data.length; i += 16) {
    const bytes = data.slice(i, i + 16);
    const hex = bytes.map(b => b.toString(16).padStart(2, '0')).join(' ');
    const ascii = bytes.map(b => b >= 32 && b <= 126 ? String.fromCharCode(b) : '.').join('');
    
    html += `<div class="hex-row">
      <span class="hex-offset">${i.toString(16).padStart(8, '0')}</span>
      <span class="hex-bytes">${hex.padEnd(48, ' ')}</span>
      <span class="hex-ascii">${ascii}</span>
    </div>`;
  }
  
  view.innerHTML = html;
}

async function savePcap() {
  const result = await ipcRenderer.invoke('save-pcap');
  if (result.success) {
    $('statusText').textContent = `已保存到: ${result.path}`;
  }
}

async function loadPcap() {
  const result = await ipcRenderer.invoke('load-pcap');
  if (result.success) {
    packets = result.packets;
    applyFilters();
    $('statusText').textContent = `加载了 ${packets.length} 个数据包`;
    $('packetCount').textContent = `${packets.length} 个数据包`;
  }
}

const presetRequests = {
  custom: null,
  get_descriptor: { dir: 128, type: 0, recipient: 0, bRequest: 0x06, wValue: 0x0100, wIndex: 0x0000, wLength: 18 },
  get_config: { dir: 128, type: 0, recipient: 0, bRequest: 0x08, wValue: 0x0000, wIndex: 0x0000, wLength: 1 },
  set_config: { dir: 0, type: 0, recipient: 0, bRequest: 0x09, wValue: 0x0001, wIndex: 0x0000, wLength: 0 },
  get_status: { dir: 128, type: 0, recipient: 0, bRequest: 0x00, wValue: 0x0000, wIndex: 0x0000, wLength: 2 },
  set_address: { dir: 0, type: 0, recipient: 0, bRequest: 0x05, wValue: 0x0001, wIndex: 0x0000, wLength: 0 },
  clear_feature: { dir: 0, type: 0, recipient: 0, bRequest: 0x01, wValue: 0x0000, wIndex: 0x0000, wLength: 0 },
  set_feature: { dir: 0, type: 0, recipient: 0, bRequest: 0x03, wValue: 0x0000, wIndex: 0x0000, wLength: 0 }
};

function initSidebarTabs() {
  document.querySelectorAll('.sidebar-tab').forEach(tab => {
    tab.onclick = () => {
      document.querySelectorAll('.sidebar-tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.sidebar-content').forEach(c => c.classList.remove('active'));
      tab.classList.add('active');
      $(`tab-${tab.dataset.tab}`).classList.add('active');
    };
  });
}

function initDetailTabs() {
  document.querySelectorAll('.detail-tab').forEach(tab => {
    tab.onclick = () => {
      document.querySelectorAll('.detail-tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.detail-content').forEach(c => c.classList.remove('active'));
      tab.classList.add('active');
      $(`detail-${tab.dataset.detail}`).classList.add('active');
      
      if (tab.dataset.detail === 'timeline') {
        renderTimeline();
      }
    };
  });
}

function updateDeviceSelect() {
  const select = $('targetDevice');
  select.innerHTML = '<option value="">选择设备</option>';
  devices.forEach((device, index) => {
    const vid = `0x${device.vendorId.toString(16).padStart(4, '0')}`;
    const pid = `0x${device.productId.toString(16).padStart(4, '0')}`;
    const option = document.createElement('option');
    option.value = index;
    option.textContent = `设备 ${index + 1} - ${vid}:${pid}`;
    select.appendChild(option);
  });
}

function applyPreset(preset) {
  if (!preset) return;
  $('reqDirection').value = preset.dir;
  $('reqType').value = preset.type;
  $('reqRecipient').value = preset.recipient;
  $('reqBRequest').value = '0x' + preset.bRequest.toString(16).padStart(2, '0');
  $('reqWValue').value = '0x' + preset.wValue.toString(16).padStart(4, '0');
  $('reqWIndex').value = '0x' + preset.wIndex.toString(16).padStart(4, '0');
  $('reqWLength').value = preset.wLength;
}

function parseHex(str) {
  return parseInt(str.replace('0x', ''), 16) || 0;
}

async function sendRequest() {
  const deviceIndex = parseInt($('targetDevice').value);
  if (isNaN(deviceIndex)) {
    $('responseArea').textContent = '错误: 请选择目标设备';
    return;
  }
  
  const bmRequestType = parseInt($('reqDirection').value) | parseInt($('reqType').value) | parseInt($('reqRecipient').value);
  const bRequest = parseHex($('reqBRequest').value);
  const wValue = parseHex($('reqWValue').value);
  const wIndex = parseHex($('reqWIndex').value);
  const wLength = parseInt($('reqWLength').value) || 0;
  
  let data = null;
  const dataStr = $('reqData').value.trim();
  if (dataStr) {
    data = dataStr.split(/\s+/).map(s => parseInt(s, 16)).filter(n => !isNaN(n));
  }
  
  $('responseArea').textContent = '正在发送请求...';
  
  const result = await ipcRenderer.invoke('send-control-request', {
    deviceIndex,
    bmRequestType,
    bRequest,
    wValue,
    wIndex,
    wLength,
    data
  });
  
  if (result.success) {
    const hex = result.data.map(b => b.toString(16).padStart(2, '0')).join(' ');
    $('responseArea').innerHTML = `<div style="color: #4ec9b0;">成功!</div><div>响应数据 (${result.data.length} bytes):<br>${hex || '(无数据)'}</div>`;
  } else {
    $('responseArea').innerHTML = `<div style="color: #c94c4c;">错误: ${result.error}</div>`;
  }
}

async function exportPackets() {
  const format = document.querySelector('input[name="exportFormat"]:checked').value;
  const includeSetup = $('includeSetup').checked;
  
  const result = await ipcRenderer.invoke('export-packets', format, includeSetup);
  if (result.success) {
    $('statusText').textContent = `已导出到: ${result.path}`;
  }
}

function renderTimeline() {
  const svg = $('timelineSvg');
  const count = parseInt($('timelineCount').value);
  const displayPackets = packets.slice(-count);
  
  const width = svg.clientWidth || 800;
  const height = svg.clientHeight || 300;
  const hostY = 60;
  const deviceY = height - 60;
  const padding = 80;
  
  if (displayPackets.length === 0) {
    svg.innerHTML = `
      <text x="${width/2}" y="${height/2}" text-anchor="middle" fill="#888">没有数据包可显示</text>
    `;
    return;
  }
  
  const startTime = displayPackets[0].timestamp;
  const endTime = displayPackets[displayPackets.length - 1].timestamp;
  const timeRange = endTime - startTime || 1;
  
  let html = '';
  
  html += `<line x1="${padding}" y1="${hostY}" x2="${width - padding}" y2="${hostY}" class="timeline-host-line"/>`;
  html += `<text x="${padding/2}" y="${hostY + 4}" text-anchor="middle" fill="#4ec9b0" font-size="12">HOST</text>`;
  
  html += `<line x1="${padding}" y1="${deviceY}" x2="${width - padding}" y2="${deviceY}" class="timeline-device-line"/>`;
  html += `<text x="${padding/2}" y="${deviceY + 4}" text-anchor="middle" fill="#ce9178" font-size="12">DEVICE</text>`;
  
  displayPackets.forEach((packet, i) => {
    const x = padding + ((packet.timestamp - startTime) / timeRange) * (width - padding * 2);
    const isIn = packet.direction === 'in';
    const y1 = isIn ? deviceY : hostY;
    const y2 = isIn ? hostY : deviceY;
    const color = isIn ? '#4ec9b0' : '#ce9178';
    
    const arrowId = `arrow-${i}`;
    html += `
      <defs>
        <marker id="${arrowId}" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto" markerUnits="strokeWidth">
          <path d="M0,0 L0,6 L9,3 z" fill="${color}"/>
        </marker>
      </defs>
    `;
    
    html += `
      <line x1="${x}" y1="${y1}" x2="${x}" y2="${y2 - 10}" 
            stroke="${color}" stroke-width="1.5" 
            marker-end="url(#${arrowId})"
            style="cursor: pointer;"
            onclick="selectPacket(${packets.indexOf(packet)})"/>
    `;
    
    if (i % Math.ceil(displayPackets.length / 10) === 0 || i === displayPackets.length - 1) {
      const time = new Date(packet.timestamp);
      const timeStr = time.toLocaleTimeString() + '.' + Math.floor(packet.timestamp % 1000).toString().padStart(3, '0');
      html += `<text x="${x}" y="${height - 15}" text-anchor="middle" fill="#888" font-size="9">${timeStr}</text>`;
      html += `<line x1="${x}" y1="${deviceY + 5}" x2="${x}" y2="${height - 20}" stroke="#555" stroke-width="1"/>`;
    }
    
    const label = `EP${packet.endpoint}`;
    html += `<text x="${x}" y="${y1 + (isIn ? -8 : 18)}" text-anchor="middle" fill="${color}" font-size="9"
                  style="cursor: pointer;"
                  onclick="selectPacket(${packets.indexOf(packet)})">${label}</text>`;
  });
  
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.innerHTML = html;
}

$('refreshBtn').onclick = () => {
  refreshDevices().then(updateDeviceSelect);
};
$('startBtn').onclick = startCapture;
$('stopBtn').onclick = stopCapture;
$('saveBtn').onclick = savePcap;
$('loadBtn').onclick = loadPcap;
$('dirFilter').onchange = applyFilters;
$('typeFilter').onchange = applyFilters;
$('epFilter').onchange = applyFilters;
$('searchInput').oninput = applyFilters;

$('presetRequest').onchange = (e) => {
  const preset = presetRequests[e.target.value];
  if (preset) applyPreset(preset);
};
$('sendRequestBtn').onclick = sendRequest;
$('exportBtn').onclick = exportPackets;
$('refreshTimeline').onclick = renderTimeline;
$('timelineCount').onchange = renderTimeline;

initSidebarTabs();
initDetailTabs();
refreshDevices().then(updateDeviceSelect);

window.selectPacket = selectPacket;
