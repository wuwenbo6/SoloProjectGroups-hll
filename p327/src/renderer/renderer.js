let beaconsData = [];
let scanning = false;

const btnStart = document.getElementById('btnStart');
const btnStop = document.getElementById('btnStop');
const btnClear = document.getElementById('btnClear');
const btnExport = document.getElementById('btnExport');
const simModeToggle = document.getElementById('simModeToggle');
const modeBadge = document.getElementById('modeBadge');
const beaconList = document.getElementById('beaconList');
const filterInput = document.getElementById('filterInput');
const filterType = document.getElementById('filterType');
const totalCount = document.getElementById('totalCount');
const ibeaconCount = document.getElementById('ibeaconCount');
const eddystoneCount = document.getElementById('eddystoneCount');
const avgRssi = document.getElementById('avgRssi');
const avgDistance = document.getElementById('avgDistance');

window.bleAPI.onBeaconsUpdate((beacons) => {
  beaconsData = beacons;
  renderBeacons();
  updateStats();
});

btnStart.addEventListener('click', async () => {
  const useSimulation = simModeToggle.checked;
  btnStart.disabled = true;
  btnStop.disabled = false;

  const result = await window.bleAPI.startScan(useSimulation);
  scanning = true;

  if (result.mode === 'simulation') {
    modeBadge.textContent = result.fallback ? '模拟模式 (回退)' : '模拟模式';
    modeBadge.className = 'mode-badge simulation';
  } else {
    modeBadge.textContent = '蓝牙扫描中';
    modeBadge.className = 'mode-badge active';
  }
});

btnStop.addEventListener('click', async () => {
  await window.bleAPI.stopScan();
  scanning = false;
  btnStart.disabled = false;
  btnStop.disabled = true;
  modeBadge.textContent = '已停止';
  modeBadge.className = 'mode-badge';
});

btnClear.addEventListener('click', async () => {
  await window.bleAPI.clearDevices();
  beaconsData = [];
  renderBeacons();
  updateStats();
});

btnExport.addEventListener('click', async () => {
  const result = await window.bleAPI.exportTimeSeries();
  if (result.success) {
    alert('数据已导出至：\n' + result.path);
  } else if (!result.canceled) {
    alert('导出失败：' + (result.error || '未知错误'));
  }
});

filterInput.addEventListener('input', renderBeacons);
filterType.addEventListener('change', renderBeacons);

function getRssiInfo(rssi) {
  const pct = Math.min(100, Math.max(0, ((rssi + 100) / 70) * 100));
  let cls = 'rssi-poor';
  let color = 'var(--accent-red)';
  if (rssi >= -55) {
    cls = 'rssi-excellent';
    color = 'var(--accent-green)';
  } else if (rssi >= -70) {
    cls = 'rssi-good';
    color = 'var(--accent-blue)';
  } else if (rssi >= -85) {
    cls = 'rssi-fair';
    color = 'var(--accent-orange)';
  }
  return { pct, cls, color };
}

function getBeaconTypeBadge(beacon) {
  const map = {
    'ibeacon': { label: 'iBeacon', cls: 'badge-ibeacon' },
    'eddystone-url': { label: 'Eddystone URL', cls: 'badge-eddystone-url' },
    'eddystone-tlm': { label: 'Eddystone TLM', cls: 'badge-eddystone-tlm' },
    'eddystone-uid': { label: 'Eddystone UID', cls: 'badge-eddystone-uid' }
  };
  const info = map[beacon.type] || { label: beacon.type, cls: '' };
  return `<span class="beacon-type-badge ${info.cls}">${info.label}</span>`;
}

function getBeaconDetailTags(beacon, device) {
  const tags = [];
  const tag = (label, value) =>
    `<span class="beacon-detail-tag"><span class="label">${label}: </span><span class="value">${value}</span></span>`;

  if (device?.distance != null) {
    tags.push(tag('距离', `${device.distance.toFixed(2)} m`));
  }

  switch (beacon.type) {
    case 'ibeacon':
      tags.push(tag('UUID', beacon.uuid));
      tags.push(tag('Major', beacon.major));
      tags.push(tag('Minor', beacon.minor));
      tags.push(tag('TxPower', `${beacon.txPower} dBm`));
      break;
    case 'eddystone-url':
      tags.push(tag('URL', beacon.url));
      tags.push(tag('TxPower', `${beacon.txPower} dBm`));
      break;
    case 'eddystone-tlm':
      tags.push(tag('Version', beacon.version));
      tags.push(tag('Battery', `${beacon.batteryVoltage} V`));
      tags.push(tag('Temp', `${beacon.temperature} °C`));
      tags.push(tag('AdvCount', beacon.advCount));
      if (beacon.secSinceBoot != null) {
        const hours = Math.floor(beacon.secSinceBoot / 3600);
        tags.push(tag('Uptime', `${hours}h`));
      }
      break;
    case 'eddystone-uid':
      tags.push(tag('Namespace', beacon.namespace));
      tags.push(tag('Instance', beacon.instance));
      tags.push(tag('TxPower', `${beacon.txPower} dBm`));
      break;
  }

  return tags.join('');
}

function filterBeacons(device) {
  const textFilter = filterInput.value.toLowerCase();
  const typeFilter = filterType.value;

  if (typeFilter !== 'all') {
    const hasType = device.beacons.some(b => b.type === typeFilter);
    if (!hasType) return false;
  }

  if (textFilter) {
    const searchable = [
      device.address,
      device.localName,
      ...device.beacons.map(b => {
        if (b.uuid) return b.uuid;
        if (b.url) return b.url;
        if (b.namespace) return b.namespace;
        if (b.instance) return b.instance;
        return '';
      })
    ].join(' ').toLowerCase();
    if (!searchable.includes(textFilter)) return false;
  }

  return true;
}

function renderBeacons() {
  const filtered = beaconsData.filter(filterBeacons);

  if (filtered.length === 0) {
    beaconList.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📡</div>
        <p>${scanning ? '正在搜索信标...' : '点击「开始扫描」搜索附近的 BLE 信标'}</p>
        <p class="empty-hint">如无蓝牙适配器，请开启「模拟模式」体验</p>
      </div>`;
    return;
  }

  const sorted = [...filtered].sort((a, b) => b.rssi - a.rssi);

  beaconList.innerHTML = sorted.map(device => {
    const rssiInfo = getRssiInfo(device.rssi);
    const beaconsHtml = device.beacons.map(beacon => `
      <div class="beacon-card">
        <div>${getBeaconTypeBadge(beacon)}</div>
        <div class="beacon-info">
          <div class="beacon-title">${device.localName || device.address}</div>
          <div class="beacon-details">${getBeaconDetailTags(beacon, device)}</div>
          <div class="beacon-meta">
            ${device.address} · ${new Date(device.timestamp).toLocaleTimeString()}
          </div>
        </div>
        <div class="beacon-rssi">
          <div class="rssi-bar-container">
            <div class="rssi-bar" style="width: ${rssiInfo.pct}%; background: ${rssiInfo.color};"></div>
          </div>
          <div class="rssi-value ${rssiInfo.cls}">${device.rssi} dBm</div>
          <div class="rssi-label">RSSI</div>
        </div>
      </div>
    `).join('');

    return beaconsHtml;
  }).join('');
}

function updateStats() {
  totalCount.textContent = beaconsData.length;

  let ib = 0, ed = 0, rssiSum = 0, distSum = 0, distCount = 0;
  for (const d of beaconsData) {
    for (const b of d.beacons) {
      if (b.type === 'ibeacon') ib++;
      else ed++;
    }
    rssiSum += d.rssi;
    if (d.distance != null) {
      distSum += d.distance;
      distCount++;
    }
  }

  ibeaconCount.textContent = ib;
  eddystoneCount.textContent = ed;
  avgRssi.textContent = beaconsData.length > 0
    ? `${Math.round(rssiSum / beaconsData.length)}`
    : '--';
  avgDistance.textContent = distCount > 0
    ? (distSum / distCount).toFixed(2)
    : '--';
}
