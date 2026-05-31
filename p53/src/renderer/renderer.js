const { ipcRenderer } = require('electron');

let map;
let aircraftMarkers = {};
let flightTrails = {};
let selectedFlight = null;
let isConnected = false;
let isPlaying = false;
let playbackData = [];
let playbackIndex = 0;
let playbackInterval = null;
let activeConflicts = {};
let weatherLayers = {};
let weatherData = null;

function initMap() {
  map = L.map('map').setView([39.9042, 116.4074], 5);
  
  L.tileLayer('https://cartodb-basemaps-{s}.global.ssl.fastly.net/dark_all/{z}/{x}/{y}.png', {
    attribution: '© CartoDB © OpenStreetMap',
    maxZoom: 19
  }).addTo(map);
  
  weatherLayers.storms = L.layerGroup().addTo(map);
  weatherLayers.wind = L.layerGroup().addTo(map);
  weatherLayers.clouds = L.layerGroup().addTo(map);
}

function createAircraftIcon(flight, hasConflict = false) {
  const rotation = flight.heading || 0;
  const color = hasConflict ? '#dc3545' : '#e94560';
  const pulse = hasConflict ? 'animation: pulse 1s infinite;' : '';
  
  return L.divIcon({
    className: 'aircraft-icon',
    html: `
      <div style="transform: rotate(${rotation}deg); width: 24px; height: 24px; ${pulse}">
        <svg viewBox="0 0 24 24" fill="${color}" stroke="#fff" stroke-width="1">
          <path d="M12 2L8 10L2 12L8 14L12 22L16 14L22 12L16 10L12 2Z"/>
        </svg>
      </div>
    `,
    iconSize: [24, 24],
    iconAnchor: [12, 12]
  });
}

function checkFlightConflict(icao24) {
  for (const conflict of Object.values(activeConflicts)) {
    if (conflict.flight1.icao24 === icao24 || conflict.flight2.icao24 === icao24) {
      return conflict;
    }
  }
  return null;
}

function updateAircraftMarker(flight) {
  const icao24 = flight.icao24;
  
  if (!flight.latitude || !flight.longitude) return;
  
  const latlng = [flight.latitude, flight.longitude];
  const hasConflict = checkFlightConflict(icao24) !== null;
  
  if (aircraftMarkers[icao24]) {
    aircraftMarkers[icao24].setLatLng(latlng);
    aircraftMarkers[icao24].setIcon(createAircraftIcon(flight, hasConflict));
  } else {
    const marker = L.marker(latlng, { icon: createAircraftIcon(flight, hasConflict) })
      .addTo(map)
      .on('click', () => selectFlight(icao24));
    
    aircraftMarkers[icao24] = marker;
  }
  
  aircraftMarkers[icao24].bindPopup(createPopupContent(flight));
  
  if (!flightTrails[icao24]) {
    flightTrails[icao24] = L.polyline([], {
      color: hasConflict ? '#dc3545' : '#e94560',
      weight: 2,
      opacity: 0.7
    }).addTo(map);
  } else if (hasConflict) {
    flightTrails[icao24].setStyle({ color: '#dc3545' });
  }
  
  flightTrails[icao24].addLatLng(latlng);
}

function createPopupContent(flight) {
  const conflict = checkFlightConflict(flight.icao24);
  let conflictHtml = '';
  
  if (conflict) {
    const levelClass = conflict.level === 'alert' ? 'danger' : 'warning';
    conflictHtml = `
      <div style="margin-top: 10px; padding: 8px; background: ${conflict.level === 'alert' ? 'rgba(220,53,69,0.3)' : 'rgba(255,193,7,0.3)'}; border-radius: 4px;">
        <strong style="color: ${conflict.level === 'alert' ? '#dc3545' : '#ffc107'}">⚠️ 冲突${conflict.level === 'alert' ? '告警' : '预警'}</strong><br>
        距离: ${conflict.horizontalDistance.toFixed(2)} km / ${conflict.verticalDistance} ft
      </div>
    `;
  }
  
  return `
    <div style="min-width: 200px;">
      <h3 style="color: #e94560; margin-bottom: 10px;">
        ${flight.callsign || '未知航班'}
      </h3>
      <p><strong>ICAO24:</strong> ${flight.icao24}</p>
      <p><strong>高度:</strong> ${flight.altitude ? flight.altitude + ' ft' : 'N/A'}</p>
      <p><strong>速度:</strong> ${flight.velocity ? Math.round(flight.velocity) + ' kt' : 'N/A'}</p>
      <p><strong>航向:</strong> ${flight.heading ? Math.round(flight.heading) + '°' : 'N/A'}</p>
      <p><strong>升降速度:</strong> ${flight.vertical_rate ? flight.vertical_rate + ' ft/min' : 'N/A'}</p>
      ${flight.interpolated ? '<p style="color: #888; font-size: 0.8em;">(插值数据)</p>' : ''}
      ${conflictHtml}
      <button onclick="exportSingleFlight('${flight.icao24}')" style="margin-top: 10px; padding: 5px 10px; background: #0f3460; color: white; border: none; border-radius: 4px; cursor: pointer;">
        📊 导出轨迹
      </button>
    </div>
  `;
}

function selectFlight(icao24) {
  if (selectedFlight && aircraftMarkers[selectedFlight]) {
    aircraftMarkers[selectedFlight].setZIndexOffset(0);
  }
  
  selectedFlight = icao24;
  
  if (aircraftMarkers[icao24]) {
    aircraftMarkers[icao24].setZIndexOffset(1000);
    map.panTo(aircraftMarkers[icao24].getLatLng());
  }
  
  updateFlightList();
}

function updateFlightList() {
  const flightList = document.getElementById('flightList');
  const flightCount = document.getElementById('flightCount');
  
  const flights = Object.values(aircraftMarkers).map(marker => {
    const icao24 = Object.keys(aircraftMarkers).find(key => aircraftMarkers[key] === marker);
    return { icao24, marker };
  });
  
  flightCount.textContent = flights.length;
  flightList.innerHTML = '';
  
  flights.forEach(({ icao24, marker }) => {
    const popup = marker.getPopup();
    const hasConflict = checkFlightConflict(icao24);
    
    const item = document.createElement('div');
    item.className = `flight-item ${selectedFlight === icao24 ? 'selected' : ''}`;
    
    const conflictBadge = hasConflict ? 
      `<span class="conflict-level ${hasConflict.level}" style="float: right;">${hasConflict.level === 'alert' ? '⚠️' : '⚡'}</span>` : '';
    
    item.innerHTML = `
      <div class="flight-callsign">
        ${hasConflict ? (hasConflict.level === 'alert' ? '🚨' : '⚠️') : ''} ${icao24}
        ${conflictBadge}
      </div>
      <div class="flight-icao">${icao24}</div>
    `;
    
    item.addEventListener('click', () => selectFlight(icao24));
    flightList.appendChild(item);
  });
}

function updateConflictList() {
  const conflictList = document.getElementById('conflictList');
  const conflictCount = document.getElementById('conflictCount');
  const conflicts = Object.values(activeConflicts);
  
  conflictCount.textContent = conflicts.length;
  conflictList.innerHTML = '';
  
  if (conflicts.length === 0) {
    conflictList.innerHTML = '<div style="padding: 20px; text-align: center; color: #888;">暂无冲突</div>';
    return;
  }
  
  conflicts.forEach(conflict => {
    const item = document.createElement('div');
    item.className = `conflict-item ${conflict.level}`;
    
    const timeStr = conflict.timeToClosest ? 
      `${Math.round(conflict.timeToClosest)}秒` : 'N/A';
    
    item.innerHTML = `
      <div class="conflict-title">
        <span class="conflict-level ${conflict.level}">
          ${conflict.level === 'alert' ? '🚨 告警' : '⚠️ 预警'}
        </span>
      </div>
      <div class="conflict-flights">
        <span>${conflict.flight1.callsign || conflict.flight1.icao24}</span>
        <span class="conflict-arrow">⇄</span>
        <span>${conflict.flight2.callsign || conflict.flight2.icao24}</span>
      </div>
      <div class="conflict-metrics">
        <span>水平: ${conflict.horizontalDistance.toFixed(2)} km</span>
        <span>垂直: ${conflict.verticalDistance} ft</span>
        <span>预计: ${timeStr}</span>
      </div>
    `;
    
    item.addEventListener('click', () => {
      if (aircraftMarkers[conflict.flight1.icao24]) {
        map.panTo(aircraftMarkers[conflict.flight1.icao24].getLatLng());
      }
    });
    
    conflictList.appendChild(item);
  });
}

function updateWeatherDisplay() {
  if (!weatherData) return;
  
  const showStorms = document.getElementById('showStorms').checked;
  const showWind = document.getElementById('showWind').checked;
  const showClouds = document.getElementById('showClouds').checked;
  
  weatherLayers.storms.clearLayers();
  weatherLayers.wind.clearLayers();
  weatherLayers.clouds.clearLayers();
  
  if (showStorms && weatherData.storms) {
    weatherData.storms.forEach(storm => {
      const color = storm.intensity > 0.7 ? '#dc3545' : storm.intensity > 0.4 ? '#ffc107' : '#28a745';
      
      const circle = L.circle([storm.lat, storm.lon], {
        radius: storm.radius * 1000,
        color: color,
        fillColor: color,
        fillOpacity: storm.intensity * 0.3,
        weight: 2
      }).addTo(weatherLayers.storms);
      
      circle.bindPopup(`
        <strong>🌩️ 雷暴区</strong><br>
        强度: ${Math.round(storm.intensity * 100)}%<br>
        半径: ${storm.radius.toFixed(1)} km<br>
        移动: ${Math.round(storm.direction)}° @ ${Math.round(storm.speed)} km/h
      `);
    });
  }
  
  if (showWind && weatherData.wind) {
    weatherData.wind.forEach(wind => {
      const arrowLength = Math.min(wind.speed / 2, 20) * 1000;
      const endLat = wind.lat + (arrowLength / 111000) * Math.cos(wind.direction * Math.PI / 180);
      const endLon = wind.lon + (arrowLength / (111000 * Math.cos(wind.lat * Math.PI / 180))) * Math.sin(wind.direction * Math.PI / 180);
      
      const color = wind.speed > 30 ? '#dc3545' : wind.speed > 15 ? '#ffc107' : '#28a745';
      
      const line = L.polyline([[wind.lat, wind.lon], [endLat, endLon]], {
        color: color,
        weight: 2,
        opacity: 0.6
      }).addTo(weatherLayers.wind);
      
      const arrowHead = L.circleMarker([endLat, endLon], {
        radius: 3,
        fillColor: color,
        color: color,
        fillOpacity: 1
      }).addTo(weatherLayers.wind);
    });
  }
  
  if (showClouds && weatherData.clouds) {
    weatherData.clouds.forEach(cloud => {
      const circle = L.circle([cloud.lat, cloud.lon], {
        radius: cloud.radius * 1000,
        color: '#888',
        fillColor: '#666',
        fillOpacity: 0.2,
        weight: 1,
        dashArray: '5, 5'
      }).addTo(weatherLayers.clouds);
      
      circle.bindPopup(`
        <strong>☁️ 云层</strong><br>
        云底: ${cloud.floor} ft<br>
        云顶: ${cloud.ceiling} ft
      `);
    });
  }
  
  updateStormList();
}

function updateStormList() {
  const stormList = document.getElementById('stormList');
  
  if (!weatherData || !weatherData.storms) {
    stormList.innerHTML = '<div style="padding: 20px; text-align: center; color: #888;">暂无气象数据</div>';
    return;
  }
  
  stormList.innerHTML = '';
  
  weatherData.storms.forEach((storm, index) => {
    const intensity = storm.intensity > 0.7 ? 'high' : storm.intensity > 0.4 ? 'medium' : 'low';
    const intensityText = storm.intensity > 0.7 ? '强' : storm.intensity > 0.4 ? '中' : '弱';
    
    const item = document.createElement('div');
    item.className = `storm-item ${intensity}`;
    item.innerHTML = `
      <div class="storm-name">🌩️ 雷暴 ${index + 1}</div>
      <div class="storm-info">
        位置: ${storm.lat.toFixed(2)}°N, ${storm.lon.toFixed(2)}°E<br>
        半径: ${storm.radius.toFixed(1)} km<br>
        移动: ${Math.round(storm.direction)}° @ ${Math.round(storm.speed)} km/h
      </div>
      <span class="storm-intensity ${intensity}">强度: ${intensityText} (${Math.round(storm.intensity * 100)}%)</span>
    `;
    
    item.addEventListener('click', () => {
      map.panTo([storm.lat, storm.lon]);
      map.setZoom(7);
    });
    
    stormList.appendChild(item);
  });
}

ipcRenderer.on('flightUpdate', (event, flight) => {
  updateAircraftMarker(flight);
  updateFlightList();
});

ipcRenderer.on('conflictAlert', (event, conflict) => {
  activeConflicts[conflict.id] = conflict;
  
  showAlertPanel(conflict);
  updateConflictList();
  
  if (aircraftMarkers[conflict.flight1.icao24]) {
    const flight = { icao24: conflict.flight1.icao24 };
    updateAircraftMarker(flight);
  }
  if (aircraftMarkers[conflict.flight2.icao24]) {
    const flight = { icao24: conflict.flight2.icao24 };
    updateAircraftMarker(flight);
  }
});

ipcRenderer.on('conflictResolved', (event, conflictId) => {
  delete activeConflicts[conflictId];
  updateConflictList();
  updateFlightList();
});

ipcRenderer.on('weatherUpdate', (event, data) => {
  weatherData = data;
  updateWeatherDisplay();
});

function showAlertPanel(conflict) {
  const panel = document.getElementById('alertPanel');
  const content = document.getElementById('alertContent');
  
  panel.className = `alert-panel ${conflict.level}`;
  
  const alertItem = document.createElement('div');
  alertItem.className = `alert-item ${conflict.level}`;
  alertItem.innerHTML = `
    <div class="alert-title">
      ${conflict.level === 'alert' ? '🚨 冲突告警' : '⚠️ 冲突预警'}
    </div>
    <div class="alert-details">
      ${conflict.flight1.callsign || conflict.flight1.icao24} ⇄ ${conflict.flight2.callsign || conflict.flight2.icao24}<br>
      距离: ${conflict.horizontalDistance.toFixed(2)} km / ${conflict.verticalDistance} ft
    </div>
  `;
  
  content.insertBefore(alertItem, content.firstChild);
  
  while (content.children.length > 5) {
    content.removeChild(content.lastChild);
  }
  
  panel.classList.remove('hidden');
}

document.getElementById('closeAlert').addEventListener('click', () => {
  document.getElementById('alertPanel').classList.add('hidden');
});

document.getElementById('connectBtn').addEventListener('click', () => {
  const host = document.getElementById('host').value;
  const port = parseInt(document.getElementById('port').value);
  
  ipcRenderer.send('start-receiver', host, port);
  
  isConnected = true;
  document.getElementById('connectBtn').disabled = true;
  document.getElementById('disconnectBtn').disabled = false;
});

document.getElementById('disconnectBtn').addEventListener('click', () => {
  ipcRenderer.send('stop-receiver');
  
  isConnected = false;
  document.getElementById('connectBtn').disabled = false;
  document.getElementById('disconnectBtn').disabled = true;
});

document.getElementById('weatherToggle').addEventListener('click', () => {
  document.querySelector('.tab-btn[data-tab="weather"]').click();
});

document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const tab = btn.dataset.tab;
    
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    
    btn.classList.add('active');
    document.getElementById(`${tab}Tab`).classList.add('active');
  });
});

document.getElementById('showStorms').addEventListener('change', updateWeatherDisplay);
document.getElementById('showWind').addEventListener('change', updateWeatherDisplay);
document.getElementById('showClouds').addEventListener('change', updateWeatherDisplay);

document.getElementById('exportBtn').addEventListener('click', () => {
  const now = new Date();
  const yesterday = new Date(now - 86400000);
  
  document.getElementById('exportStartTime').value = yesterday.toISOString().slice(0, 16);
  document.getElementById('exportEndTime').value = now.toISOString().slice(0, 16);
  
  loadFlightSelectOptions();
  document.getElementById('exportModal').classList.remove('hidden');
});

document.querySelectorAll('input[name="exportType"]').forEach(radio => {
  radio.addEventListener('change', () => {
    const type = document.querySelector('input[name="exportType"]:checked').value;
    document.getElementById('timeRangeInputs').classList.toggle('hidden', type === 'single');
    document.getElementById('flightSelectInput').classList.toggle('hidden', type !== 'single');
  });
});

async function loadFlightSelectOptions() {
  const select = document.getElementById('exportFlightSelect');
  const flights = await ipcRenderer.invoke('get-all-flights');
  
  select.innerHTML = '';
  flights.forEach(flight => {
    const option = document.createElement('option');
    option.value = flight.icao24;
    option.textContent = `${flight.callsign || flight.icao24} (${flight.icao24})`;
    select.appendChild(option);
  });
}

document.querySelector('.close-modal').addEventListener('click', () => {
  document.getElementById('exportModal').classList.add('hidden');
});

document.getElementById('cancelExport').addEventListener('click', () => {
  document.getElementById('exportModal').classList.add('hidden');
});

document.getElementById('confirmExport').addEventListener('click', async () => {
  const type = document.querySelector('input[name="exportType"]:checked').value;
  let result;
  
  if (type === 'flights') {
    const startTime = new Date(document.getElementById('exportStartTime').value).getTime();
    const endTime = new Date(document.getElementById('exportEndTime').value).getTime();
    result = await ipcRenderer.invoke('export-flights-csv', startTime, endTime);
  } else if (type === 'single') {
    const icao24 = document.getElementById('exportFlightSelect').value;
    result = await ipcRenderer.invoke('export-flight-history-csv', icao24);
  } else if (type === 'report') {
    const startTime = new Date(document.getElementById('exportStartTime').value).getTime();
    const endTime = new Date(document.getElementById('exportEndTime').value).getTime();
    result = await ipcRenderer.invoke('export-report', startTime, endTime);
  }
  
  if (result) {
    alert(`导出成功！\n文件: ${result.path || result.summaryPath}\n记录数: ${result.rows || result.totalFlights}`);
  }
  
  document.getElementById('exportModal').classList.add('hidden');
});

document.getElementById('exportConflictsBtn').addEventListener('click', async () => {
  const conflicts = Object.values(activeConflicts);
  if (conflicts.length === 0) {
    alert('没有冲突数据可导出');
    return;
  }
  
  const result = await ipcRenderer.invoke('export-conflicts-csv', conflicts);
  if (result) {
    alert(`导出成功！\n文件: ${result.path}\n记录数: ${result.rows}`);
  }
});

window.exportSingleFlight = async function(icao24) {
  const result = await ipcRenderer.invoke('export-flight-history-csv', icao24);
  if (result) {
    alert(`导出成功！\n文件: ${result.path}\n记录数: ${result.rows}`);
  }
};

document.getElementById('historyBtn').addEventListener('click', async () => {
  const startTime = new Date(Date.now() - 3600000).toISOString().slice(0, 16);
  const endTime = new Date().toISOString().slice(0, 16);
  
  const flights = await ipcRenderer.invoke('get-historical-flights', 
    new Date(startTime).getTime(), 
    new Date(endTime).getTime()
  );
  
  if (flights.length > 0) {
    document.getElementById('playbackPanel').classList.remove('hidden');
    playbackData = flights;
    loadPlaybackData();
  } else {
    alert('没有找到历史航班数据');
  }
});

async function loadPlaybackData() {
  const allTrails = {};
  
  for (const flight of playbackData) {
    const history = await ipcRenderer.invoke('get-flight-history', flight.icao24);
    if (history.length > 0) {
      allTrails[flight.icao24] = history;
    }
  }
  
  playbackData = Object.values(allTrails).flat().sort((a, b) => a.timestamp - b.timestamp);
  document.getElementById('playbackSlider').max = playbackData.length - 1;
}

document.getElementById('playPauseBtn').addEventListener('click', () => {
  if (isPlaying) {
    pausePlayback();
  } else {
    startPlayback();
  }
});

function startPlayback() {
  isPlaying = true;
  document.getElementById('playPauseBtn').textContent = '⏸ 暂停';
  
  const speed = parseInt(document.getElementById('playbackSpeed').value);
  
  playbackInterval = setInterval(() => {
    if (playbackIndex < playbackData.length - 1) {
      playbackIndex++;
      updatePlaybackPosition();
    } else {
      pausePlayback();
    }
  }, 100 / speed);
}

function pausePlayback() {
  isPlaying = false;
  document.getElementById('playPauseBtn').textContent = '▶ 播放';
  
  if (playbackInterval) {
    clearInterval(playbackInterval);
    playbackInterval = null;
  }
}

document.getElementById('stopPlaybackBtn').addEventListener('click', () => {
  pausePlayback();
  playbackIndex = 0;
  updatePlaybackPosition();
  document.getElementById('playbackPanel').classList.add('hidden');
  
  Object.values(aircraftMarkers).forEach(marker => marker.remove());
  Object.values(flightTrails).forEach(trail => trail.remove());
  aircraftMarkers = {};
  flightTrails = {};
});

document.getElementById('playbackSlider').addEventListener('input', (e) => {
  playbackIndex = parseInt(e.target.value);
  updatePlaybackPosition();
});

function updatePlaybackPosition() {
  document.getElementById('playbackSlider').value = playbackIndex;
  
  if (playbackData[playbackIndex]) {
    const point = playbackData[playbackIndex];
    updateAircraftMarker(point);
    
    const time = new Date(point.timestamp);
    document.getElementById('playbackTime').textContent = 
      time.toTimeString().slice(0, 8);
    
    updateFlightList();
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  initMap();
  
  weatherData = await ipcRenderer.invoke('get-weather-data');
  updateWeatherDisplay();
});
