const { ipcRenderer } = require('electron');

let rangeChart = null;
let velocityChart = null;
let rdMapChart = null;
let currentResult = null;

document.addEventListener('DOMContentLoaded', () => {
  initCharts();
  initEventListeners();
  updateInfoPanel();
  loadHistory();
});

function initCharts() {
  const rangeCtx = document.getElementById('rangeChart').getContext('2d');
  rangeChart = new Chart(rangeCtx, {
    type: 'line',
    data: {
      labels: [],
      datasets: [{
        label: '幅度',
        data: [],
        borderColor: '#00d4ff',
        backgroundColor: 'rgba(0, 212, 255, 0.1)',
        fill: true,
        tension: 0.1,
        pointRadius: 0,
        borderWidth: 2
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 500 },
      plugins: {
        legend: { display: false },
        tooltip: {
          mode: 'index', intersect: false,
          backgroundColor: 'rgba(0, 0, 0, 0.8)',
          titleColor: '#00d4ff', bodyColor: '#e0e0e0',
          callbacks: {
            title: (items) => `距离: ${parseFloat(items[0].label).toFixed(2)} m`,
            label: (item) => `幅度: ${item.raw.toFixed(2)}`
          }
        }
      },
      scales: {
        x: { title: { display: true, text: '距离 (m)', color: '#888' },
             grid: { color: 'rgba(255, 255, 255, 0.05)' }, ticks: { color: '#888', maxTicksLimit: 10 } },
        y: { title: { display: true, text: '幅度', color: '#888' },
             grid: { color: 'rgba(255, 255, 255, 0.05)' }, ticks: { color: '#888' } }
      }
    }
  });

  const velocityCtx = document.getElementById('velocityChart').getContext('2d');
  velocityChart = new Chart(velocityCtx, {
    type: 'line',
    data: {
      labels: [],
      datasets: [{
        label: '幅度',
        data: [],
        borderColor: '#ff6b6b',
        backgroundColor: 'rgba(255, 107, 107, 0.1)',
        fill: true,
        tension: 0.1,
        pointRadius: 0,
        borderWidth: 2
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 500 },
      plugins: {
        legend: { display: false },
        tooltip: {
          mode: 'index', intersect: false,
          backgroundColor: 'rgba(0, 0, 0, 0.8)',
          titleColor: '#ff6b6b', bodyColor: '#e0e0e0',
          callbacks: {
            title: (items) => `速度: ${parseFloat(items[0].label).toFixed(2)} m/s`,
            label: (item) => `幅度: ${item.raw.toFixed(2)}`
          }
        }
      },
      scales: {
        x: { title: { display: true, text: '速度 (m/s)', color: '#888' },
             grid: { color: 'rgba(255, 255, 255, 0.05)' }, ticks: { color: '#888', maxTicksLimit: 10 } },
        y: { title: { display: true, text: '幅度', color: '#888' },
             grid: { color: 'rgba(255, 255, 255, 0.05)' }, ticks: { color: '#888' } }
      }
    }
  });

  const rdMapCtx = document.getElementById('rdMapChart').getContext('2d');
  rdMapChart = new Chart(rdMapCtx, {
    type: 'line',
    data: { labels: [], datasets: [{ label: 'RD Map', data: [], pointRadius: 0 }] },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { enabled: false } },
      scales: {
        x: { title: { display: true, text: '距离 (m)', color: '#888' },
             grid: { color: 'rgba(255, 255, 255, 0.05)' }, ticks: { color: '#888' } },
        y: { title: { display: true, text: '速度 (m/s)', color: '#888' },
             grid: { color: 'rgba(255, 255, 255, 0.05)' }, ticks: { color: '#888' } }
      }
    },
    plugins: [{
      id: 'rdMapPlugin',
      beforeDraw: (chart) => {
        if (!currentResult || !currentResult.rd_map) return;
        
        const { ctx, chartArea } = chart;
        const rd_map = currentResult.rd_map;
        const ranges = currentResult.ranges;
        const velocities = currentResult.velocities;
        
        const width = chartArea.right - chartArea.left;
        const height = chartArea.bottom - chartArea.top;
        
        const rows = rd_map.length;
        const cols = Math.min(rd_map[0].length, 200);
        const cellWidth = width / cols;
        const cellHeight = height / rows;
        
        let powerMin = Infinity, powerMax = -Infinity;
        for (let i = 0; i < rows; i++) {
          for (let j = 0; j < cols; j++) {
            const val = rd_map[i][j];
            if (val < powerMin) powerMin = val;
            if (val > powerMax) powerMax = val;
          }
        }
        
        for (let i = 0; i < rows; i++) {
          for (let j = 0; j < cols; j++) {
            const val = rd_map[i][j];
            const normalized = Math.max(0, Math.min(1, (val - powerMin) / (powerMax - powerMin)));
            ctx.fillStyle = getColorForValue(normalized);
            ctx.fillRect(
              chartArea.left + j * cellWidth,
              chartArea.top + (rows - 1 - i) * cellHeight,
              cellWidth + 1,
              cellHeight + 1
            );
          }
        }
        
        if (currentResult.detections) {
          ctx.fillStyle = '#ff0000';
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 2;
          currentResult.detections.forEach(det => {
            const xNorm = (det.range - ranges[0]) / (ranges[ranges.length - 1] - ranges[0]);
            const yNorm = (det.velocity - velocities[0]) / (velocities[velocities.length - 1] - velocities[0]);
            const x = chartArea.left + xNorm * width;
            const y = chartArea.bottom - yNorm * height;
            
            if (x >= chartArea.left && x <= chartArea.right && y >= chartArea.top && y <= chartArea.bottom) {
              ctx.beginPath();
              ctx.arc(x, y, 6, 0, Math.PI * 2);
              ctx.fill();
              ctx.stroke();
            }
          });
        }
      }
    }]
  });
}

function getColorForValue(value) {
  const colors = [
    { pos: 0.0, r: 0, g: 0, b: 51 },
    { pos: 0.125, r: 0, g: 0, b: 128 },
    { pos: 0.25, r: 0, g: 102, b: 255 },
    { pos: 0.375, r: 0, g: 204, b: 255 },
    { pos: 0.5, r: 102, g: 255, b: 102 },
    { pos: 0.625, r: 255, g: 255, b: 0 },
    { pos: 0.75, r: 255, g: 102, b: 0 },
    { pos: 1.0, r: 255, g: 0, b: 0 }
  ];
  for (let i = 0; i < colors.length - 1; i++) {
    if (value >= colors[i].pos && value <= colors[i + 1].pos) {
      const t = (value - colors[i].pos) / (colors[i + 1].pos - colors[i].pos);
      return `rgba(${Math.round(colors[i].r + t * (colors[i + 1].r - colors[i].r))}, ${Math.round(colors[i].g + t * (colors[i + 1].g - colors[i].g))}, ${Math.round(colors[i].b + t * (colors[i + 1].b - colors[i].b))}, 0.9)`;
    }
  }
  return 'rgba(255, 0, 0, 0.9)';
}

function initEventListeners() {
  const bandwidthSlider = document.getElementById('bandwidth');
  const sweepTimeSlider = document.getElementById('sweepTime');
  const sampleRateSlider = document.getElementById('sampleRate');
  const numChirpsSlider = document.getElementById('numChirps');

  bandwidthSlider.addEventListener('input', () => {
    document.getElementById('bandwidth-value').textContent = `${bandwidthSlider.value} MHz`;
    updateInfoPanel();
  });

  sweepTimeSlider.addEventListener('input', () => {
    document.getElementById('sweepTime-value').textContent = `${sweepTimeSlider.value} ms`;
    updateInfoPanel();
  });

  sampleRateSlider.addEventListener('input', () => {
    document.getElementById('sampleRate-value').textContent = `${sampleRateSlider.value} MHz`;
    updateInfoPanel();
  });

  numChirpsSlider.addEventListener('input', () => {
    document.getElementById('numChirps-value').textContent = numChirpsSlider.value;
    updateInfoPanel();
  });

  document.getElementById('startBtn').addEventListener('click', processRadar);
  document.getElementById('saveBtn').addEventListener('click', saveMeasurement);
  document.getElementById('exportIqBtn').addEventListener('click', exportIqData);
  document.getElementById('exportDetBtn').addEventListener('click', exportDetections);
  document.getElementById('loadHistoryBtn').addEventListener('click', loadHistory);
}

function updateInfoPanel() {
  const bandwidth = parseFloat(document.getElementById('bandwidth').value) * 1e6;
  const sampleRate = parseFloat(document.getElementById('sampleRate').value) * 1e6;
  const sweepTime = parseFloat(document.getElementById('sweepTime').value) * 1e-3;
  const numChirps = parseInt(document.getElementById('numChirps').value);
  const c = 3e8;
  const wavelength = c / 24e9;

  const rangeResolution = c / (2 * bandwidth);
  const maxRange = c * sampleRate / (4 * bandwidth);
  const velocityResolution = wavelength / (2 * numChirps * sweepTime);
  const maxVelocity = wavelength / (4 * sweepTime);

  document.getElementById('rangeResolution').textContent = `${rangeResolution.toFixed(2)} m`;
  document.getElementById('maxRange').textContent = `${maxRange.toFixed(2)} m`;
  document.getElementById('velocityResolution').textContent = `${velocityResolution.toFixed(2)} m/s`;
  document.getElementById('maxVelocity').textContent = `${maxVelocity.toFixed(2)} m/s`;
}

async function processRadar() {
  const startBtn = document.getElementById('startBtn');
  const saveBtn = document.getElementById('saveBtn');
  const exportIqBtn = document.getElementById('exportIqBtn');
  const exportDetBtn = document.getElementById('exportDetBtn');
  const statusBar = document.querySelector('.status-bar');
  const statusText = document.getElementById('statusText');

  startBtn.disabled = true;
  saveBtn.disabled = true;
  exportIqBtn.disabled = true;
  exportDetBtn.disabled = true;
  statusBar.className = 'status-bar working';
  statusText.textContent = '正在处理信号...';

  try {
    const params = {
      bandwidth: parseFloat(document.getElementById('bandwidth').value) * 1e6,
      sweep_time: parseFloat(document.getElementById('sweepTime').value) * 1e-3,
      sample_rate: parseFloat(document.getElementById('sampleRate').value) * 1e6,
      window_type: document.getElementById('windowType').value,
      num_chirps: parseInt(document.getElementById('numChirps').value)
    };

    const result = await ipcRenderer.invoke('process-radar', params);
    
    if (result.success) {
      currentResult = result;
      updateCharts(result);
      updateDetectionResults(result);
      
      statusBar.className = 'status-bar success';
      statusText.textContent = '处理完成！检测到 ' + result.detections.length + ' 个目标';
      saveBtn.disabled = false;
      exportIqBtn.disabled = false;
      exportDetBtn.disabled = false;
    } else {
      throw new Error(result.error || '处理失败');
    }
  } catch (error) {
    console.error('Error:', error);
    statusBar.className = 'status-bar error';
    statusText.textContent = `错误: ${error.message}`;
  } finally {
    startBtn.disabled = false;
  }
}

function updateCharts(result) {
  const { ranges, range_profile, velocities, velocity_profile } = result;

  const rangeDownsample = Math.ceil(ranges.length / 500);
  const sampledRanges = ranges.filter((_, i) => i % rangeDownsample === 0);
  const sampledRangeProfile = range_profile.filter((_, i) => i % rangeDownsample === 0);

  rangeChart.data.labels = sampledRanges.map(r => r.toFixed(1));
  rangeChart.data.datasets[0].data = sampledRangeProfile;
  rangeChart.update();

  const velDownsample = Math.ceil(velocities.length / 200);
  const sampledVelocities = velocities.filter((_, i) => i % velDownsample === 0);
  const sampledVelProfile = velocity_profile.filter((_, i) => i % velDownsample === 0);

  velocityChart.data.labels = sampledVelocities.map(v => v.toFixed(1));
  velocityChart.data.datasets[0].data = sampledVelProfile;
  velocityChart.update();

  rdMapChart.data.labels = sampledRanges.map(r => r.toFixed(1));
  rdMapChart.options.scales.x.max = sampledRanges[sampledRanges.length - 1];
  rdMapChart.options.scales.y.min = velocities[0];
  rdMapChart.options.scales.y.max = velocities[velocities.length - 1];
  rdMapChart.update();
}

function updateDetectionResults(result) {
  const detectionResults = document.getElementById('detectionResults');
  
  let html = '';
  
  html += '<div class="detection-section">';
  html += '<h4>OS-CFAR 检测结果</h4>';
  
  if (result.detections && result.detections.length > 0) {
    result.detections.forEach((det, index) => {
      html += `<div class="detection-item">
        <span class="label">目标 ${index + 1}:</span>
        <span class="value">R=${det.range.toFixed(1)}m, V=${det.velocity.toFixed(2)}m/s, P=${det.power.toFixed(1)}dB</span>
      </div>`;
    });
  } else {
    html += '<p style="color: #888;">未检测到目标</p>';
  }
  html += '</div>';
  
  html += '<div class="detection-section">';
  html += '<h4>模拟真实目标</h4>';
  result.true_distances.forEach((dist, index) => {
    html += `<div class="detection-item true-target">
      <span class="label">目标 ${index + 1}:</span>
      <span class="value">R=${dist.toFixed(1)}m, V=${result.true_velocities[index].toFixed(2)}m/s</span>
    </div>`;
  });
  html += '</div>';
  
  html += '<div class="detection-section">';
  html += '<h4>雷达参数</h4>';
  html += `<div class="detection-item"><span class="label">带宽:</span><span class="value">${(result.params.bandwidth / 1e6).toFixed(0)} MHz</span></div>`;
  html += `<div class="detection-item"><span class="label">Chirp周期:</span><span class="value">${(result.params.sweep_time * 1000).toFixed(1)} ms</span></div>`;
  html += `<div class="detection-item"><span class="label">采样率:</span><span class="value">${(result.params.sample_rate / 1e6).toFixed(1)} MHz</span></div>`;
  html += `<div class="detection-item"><span class="label">Chirp数量:</span><span class="value">${result.params.num_chirps}</span></div>`;
  html += `<div class="detection-item"><span class="label">窗函数:</span><span class="value">${result.params.window_type}</span></div>`;
  html += '</div>';
  
  detectionResults.innerHTML = html;
}

async function exportIqData() {
  if (!currentResult || !currentResult.iq_data) return;
  
  const result = await ipcRenderer.invoke('show-save-dialog', {
    title: '导出IQ数据',
    defaultPath: `radar_iq_data_${Date.now()}.csv`,
    filters: [
      { name: 'CSV Files', extensions: ['csv'] },
      { name: 'JSON Files', extensions: ['json'] }
    ]
  });
  
  if (!result.canceled && result.filePath) {
    const filepath = result.filePath;
    let exportResult;
    
    if (filepath.endsWith('.json')) {
      exportResult = await ipcRenderer.invoke('export-iq-json', {
        filepath,
        content: {
          params: currentResult.params,
          iq_data: currentResult.iq_data
        }
      });
    } else {
      exportResult = await ipcRenderer.invoke('export-iq-csv', {
        iq_data: currentResult.iq_data,
        params: currentResult.params,
        filepath
      });
    }
    
    if (exportResult.success) {
      const statusBar = document.querySelector('.status-bar');
      statusBar.className = 'status-bar success';
      document.getElementById('statusText').textContent = `IQ数据已导出到: ${filepath}`;
    }
  }
}

async function exportDetections() {
  if (!currentResult) return;
  
  const result = await ipcRenderer.invoke('show-save-dialog', {
    title: '导出检测结果',
    defaultPath: `radar_detections_${Date.now()}.csv`,
    filters: [{ name: 'CSV Files', extensions: ['csv'] }]
  });
  
  if (!result.canceled && result.filePath) {
    const exportResult = await ipcRenderer.invoke('export-detections-csv', {
      detections: currentResult.detections,
      true_targets: {
        distances: currentResult.true_distances,
        velocities: currentResult.true_velocities,
        rcs: currentResult.true_rcs
      },
      params: currentResult.params,
      filepath: result.filePath
    });
    
    if (exportResult.success) {
      const statusBar = document.querySelector('.status-bar');
      statusBar.className = 'status-bar success';
      document.getElementById('statusText').textContent = `检测结果已导出`;
    }
  }
}

async function saveMeasurement() {
  if (!currentResult) return;

  try {
    await ipcRenderer.invoke('save-measurement', {
      bandwidth: currentResult.params.bandwidth,
      sweep_time: currentResult.params.sweep_time,
      sample_rate: currentResult.params.sample_rate,
      true_distances: currentResult.true_distances,
      true_rcs: currentResult.true_rcs,
      peak_distances: currentResult.detected_ranges || [],
      peak_magnitudes: currentResult.detected_powers || []
    });

    const statusBar = document.querySelector('.status-bar');
    statusBar.className = 'status-bar success';
    document.getElementById('statusText').textContent = '结果已保存！';
    loadHistory();
  } catch (error) {
    console.error('Save error:', error);
  }
}

async function loadHistory() {
  try {
    const history = await ipcRenderer.invoke('get-history');
    const historyList = document.getElementById('historyList');

    if (history.length === 0) {
      historyList.innerHTML = '<p class="empty-hint">暂无历史记录</p>';
      return;
    }

    let html = '';
    history.forEach(item => {
      const time = new Date(item.timestamp).toLocaleString('zh-CN');
      const targets = item.peak_distances ? 
        item.peak_distances.slice(0, 2).map(d => d.toFixed(1)).join(', ') : 
        '无';
      
      html += `<div class="history-item" data-id="${item.id}">
        <div class="time">${time}</div>
        <div class="params">
          带宽: ${(item.bandwidth / 1e6).toFixed(0)} MHz | 
          扫频: ${(item.sweep_time * 1000).toFixed(1)} ms
        </div>
        <div class="targets">目标: ${targets} m</div>
      </div>`;
    });

    historyList.innerHTML = html;

    document.querySelectorAll('.history-item').forEach(el => {
      el.addEventListener('click', () => {
        const id = parseInt(el.dataset.id);
        deleteMeasurement(id);
      });
    });
  } catch (error) {
    console.error('Load history error:', error);
  }
}

async function deleteMeasurement(id) {
  if (confirm('确定要删除这条记录吗？')) {
    try {
      await ipcRenderer.invoke('delete-measurement', id);
      loadHistory();
    } catch (error) {
      console.error('Delete error:', error);
    }
  }
}
