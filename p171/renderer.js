const { electronAPI } = window;

let monitoringChart = null;
let curvePreviewChart = null;
let loadTestChart = null;
let rippleChart = null;
let monitoringData = {
  timestamps: [],
  voltages: [],
  currents: []
};
let curvePoints = [];
let isConnected = false;
let isMonitoring = false;
let loadTestRunning = false;
let rippleTestRunning = false;
let lastRippleTestData = null;
let rippleSampleData = [];

document.addEventListener('DOMContentLoaded', () => {
  initCharts();
  setupEventListeners();
  setupIPCListeners();
});

function initCharts() {
  const monitoringCtx = document.getElementById('monitoring-chart').getContext('2d');
  monitoringChart = new Chart(monitoringCtx, {
    type: 'line',
    data: {
      labels: [],
      datasets: [
        {
          label: '电压 (V)',
          data: [],
          borderColor: '#4facfe',
          backgroundColor: 'rgba(79, 172, 254, 0.1)',
          yAxisID: 'y',
          tension: 0.4,
          fill: true
        },
        {
          label: '电流 (A)',
          data: [],
          borderColor: '#22c55e',
          backgroundColor: 'rgba(34, 197, 94, 0.1)',
          yAxisID: 'y1',
          tension: 0.4,
          fill: true
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: 'index',
        intersect: false
      },
      plugins: {
        legend: {
          labels: {
            color: '#e0e0e0'
          }
        }
      },
      scales: {
        x: {
          type: 'linear',
          title: {
            display: true,
            text: '时间 (s)',
            color: '#a0a0a0'
          },
          ticks: {
            color: '#a0a0a0'
          },
          grid: {
            color: 'rgba(255, 255, 255, 0.1)'
          }
        },
        y: {
          type: 'linear',
          display: true,
          position: 'left',
          title: {
            display: true,
            text: '电压 (V)',
            color: '#4facfe'
          },
          ticks: {
            color: '#4facfe'
          },
          grid: {
            color: 'rgba(255, 255, 255, 0.1)'
          },
          min: 0,
          max: 25
        },
        y1: {
          type: 'linear',
          display: true,
          position: 'right',
          title: {
            display: true,
            text: '电流 (A)',
            color: '#22c55e'
          },
          ticks: {
            color: '#22c55e'
          },
          grid: {
            drawOnChartArea: false
          },
          min: 0,
          max: 6
        }
      }
    }
  });

  const curvePreviewCtx = document.getElementById('curve-preview-chart').getContext('2d');
  curvePreviewChart = new Chart(curvePreviewCtx, {
    type: 'line',
    data: {
      labels: [],
      datasets: [
        {
          label: '电压 (V)',
          data: [],
          borderColor: '#4facfe',
          backgroundColor: 'rgba(79, 172, 254, 0.2)',
          yAxisID: 'y',
          tension: 0.1,
          fill: false,
          pointRadius: 6,
          pointBackgroundColor: '#4facfe'
        },
        {
          label: '电流 (A)',
          data: [],
          borderColor: '#22c55e',
          backgroundColor: 'rgba(34, 197, 94, 0.2)',
          yAxisID: 'y1',
          tension: 0.1,
          fill: false,
          pointRadius: 6,
          pointBackgroundColor: '#22c55e'
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          labels: {
            color: '#e0e0e0'
          }
        }
      },
      scales: {
        x: {
          type: 'linear',
          title: {
            display: true,
            text: '步骤',
            color: '#a0a0a0'
          },
          ticks: {
            color: '#a0a0a0',
            stepSize: 1
          },
          grid: {
            color: 'rgba(255, 255, 255, 0.1)'
          }
        },
        y: {
          type: 'linear',
          display: true,
          position: 'left',
          title: {
            display: true,
            text: '电压 (V)',
            color: '#4facfe'
          },
          ticks: {
            color: '#4facfe'
          },
          grid: {
            color: 'rgba(255, 255, 255, 0.1)'
          },
          min: 0,
          max: 25
        },
        y1: {
          type: 'linear',
          display: true,
          position: 'right',
          title: {
            display: true,
            text: '电流 (A)',
            color: '#22c55e'
          },
          ticks: {
            color: '#22c55e'
          },
          grid: {
            drawOnChartArea: false
          },
          min: 0,
          max: 6
        }
      }
    }
  });

  const loadTestCtx = document.getElementById('load-test-chart').getContext('2d');
  loadTestChart = new Chart(loadTestCtx, {
    type: 'line',
    data: {
      labels: [],
      datasets: [
        {
          label: '电压 (V)',
          data: [],
          borderColor: '#4facfe',
          backgroundColor: 'rgba(79, 172, 254, 0.1)',
          yAxisID: 'y',
          tension: 0.2,
          fill: true
        },
        {
          label: '电流 (A)',
          data: [],
          borderColor: '#22c55e',
          backgroundColor: 'rgba(34, 197, 94, 0.1)',
          yAxisID: 'y1',
          tension: 0.2,
          fill: true
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: 'index',
        intersect: false
      },
      plugins: {
        legend: {
          labels: {
            color: '#e0e0e0'
          }
        }
      },
      scales: {
        x: {
          type: 'linear',
          title: {
            display: true,
            text: '周期',
            color: '#a0a0a0'
          },
          ticks: {
            color: '#a0a0a0',
            stepSize: 1
          },
          grid: {
            color: 'rgba(255, 255, 255, 0.1)'
          }
        },
        y: {
          type: 'linear',
          display: true,
          position: 'left',
          title: {
            display: true,
            text: '电压 (V)',
            color: '#4facfe'
          },
          ticks: {
            color: '#4facfe'
          },
          grid: {
            color: 'rgba(255, 255, 255, 0.1)'
          }
        },
        y1: {
          type: 'linear',
          display: true,
          position: 'right',
          title: {
            display: true,
            text: '电流 (A)',
            color: '#22c55e'
          },
          ticks: {
            color: '#22c55e'
          },
          grid: {
            drawOnChartArea: false
          }
        }
      }
    }
  });

  const rippleCtx = document.getElementById('ripple-chart').getContext('2d');
  rippleChart = new Chart(rippleCtx, {
    type: 'line',
    data: {
      labels: [],
      datasets: [
        {
          label: '电压 (V)',
          data: [],
          borderColor: '#f97316',
          backgroundColor: 'rgba(249, 115, 22, 0.1)',
          tension: 0.1,
          fill: true,
          pointRadius: 0
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          labels: {
            color: '#e0e0e0'
          }
        }
      },
      scales: {
        x: {
          type: 'linear',
          title: {
            display: true,
            text: '时间 (ms)',
            color: '#a0a0a0'
          },
          ticks: {
            color: '#a0a0a0'
          },
          grid: {
            color: 'rgba(255, 255, 255, 0.1)'
          }
        },
        y: {
          type: 'linear',
          display: true,
          position: 'left',
          title: {
            display: true,
            text: '电压 (V)',
            color: '#f97316'
          },
          ticks: {
            color: '#f97316'
          },
          grid: {
            color: 'rgba(255, 255, 255, 0.1)'
          }
        }
      }
    }
  });
}

function setupEventListeners() {
  document.getElementById('connect-btn').addEventListener('click', connectDevice);
  document.getElementById('disconnect-btn').addEventListener('click', disconnectDevice);
  document.getElementById('set-pps-btn').addEventListener('click', setPPS);
  document.getElementById('start-monitor-btn').addEventListener('click', startMonitoring);
  document.getElementById('stop-monitor-btn').addEventListener('click', stopMonitoring);
  document.getElementById('add-point-btn').addEventListener('click', addCurvePoint);
  document.getElementById('clear-curve-btn').addEventListener('click', clearCurve);
  document.getElementById('execute-curve-btn').addEventListener('click', executeCurve);
  document.getElementById('stop-curve-btn').addEventListener('click', stopCurve);
  document.getElementById('start-load-test-btn').addEventListener('click', startLoadTransientTest);
  document.getElementById('stop-load-test-btn').addEventListener('click', stopLoadTransientTest);
  document.getElementById('start-ripple-test-btn').addEventListener('click', startRippleTest);
  document.getElementById('export-report-btn').addEventListener('click', exportReport);

  document.getElementById('voltage-slider').addEventListener('input', (e) => {
    document.getElementById('voltage-input').value = e.target.value;
  });
  document.getElementById('voltage-input').addEventListener('input', (e) => {
    document.getElementById('voltage-slider').value = e.target.value;
  });
  document.getElementById('current-slider').addEventListener('input', (e) => {
    document.getElementById('current-input').value = e.target.value;
  });
  document.getElementById('current-input').addEventListener('input', (e) => {
    document.getElementById('current-slider').value = e.target.value;
  });
}

function setupIPCListeners() {
  electronAPI.onMonitoringData((data) => {
    updateMonitoringData(data);
  });

  electronAPI.onCurveProgress((data) => {
    updateCurveProgress(data);
  });

  electronAPI.onLoadTestProgress((progress) => {
    updateTestProgress(progress);
  });

  electronAPI.onRippleSample((sample) => {
    updateRippleSample(sample);
  });
}

async function connectDevice() {
  const result = await electronAPI.connectDevice();
  if (result.success) {
    isConnected = true;
    updateConnectionStatus(true);
    enableControls(true);
    updateStatusDisplay(result);
    console.log('Device connected:', result);
  } else {
    console.error('Connection failed:', result.error);
  }
}

async function disconnectDevice() {
  const result = await electronAPI.disconnectDevice();
  if (result.success) {
    isConnected = false;
    isMonitoring = false;
    updateConnectionStatus(false);
    enableControls(false);
    resetDisplay();
  }
}

async function setPPS() {
  const voltage = parseFloat(document.getElementById('voltage-input').value);
  const current = parseFloat(document.getElementById('current-input').value);
  
  const result = await electronAPI.setPPS(voltage, current);
  if (result.success) {
    updateStatusDisplay(result);
  } else {
    console.error('Set PPS failed:', result.error);
  }
}

async function startMonitoring() {
  const result = await electronAPI.startMonitoring();
  if (result.success) {
    isMonitoring = true;
    document.getElementById('start-monitor-btn').disabled = true;
    document.getElementById('stop-monitor-btn').disabled = false;
  }
}

async function stopMonitoring() {
  const result = await electronAPI.stopMonitoring();
  if (result.success) {
    isMonitoring = false;
    document.getElementById('start-monitor-btn').disabled = false;
    document.getElementById('stop-monitor-btn').disabled = true;
  }
}

function updateMonitoringData(data) {
  const elapsedSeconds = (data.timestamp - (monitoringData.startTime || data.timestamp)) / 1000;
  if (!monitoringData.startTime) {
    monitoringData.startTime = data.timestamp;
  }

  monitoringData.timestamps.push(elapsedSeconds);
  monitoringData.voltages.push(data.voltage);
  monitoringData.currents.push(data.current);

  const maxPoints = 1000;
  if (monitoringData.timestamps.length > maxPoints) {
    monitoringData.timestamps.shift();
    monitoringData.voltages.shift();
    monitoringData.currents.shift();
  }

  monitoringChart.data.labels = monitoringData.timestamps;
  monitoringChart.data.datasets[0].data = monitoringData.voltages;
  monitoringChart.data.datasets[1].data = monitoringData.currents;
  monitoringChart.update('none');

  document.getElementById('voltage-value').textContent = data.voltage.toFixed(3);
  document.getElementById('current-value').textContent = data.current.toFixed(3);
  document.getElementById('power-value').textContent = data.power.toFixed(3);
}

function addCurvePoint() {
  const voltage = parseFloat(document.getElementById('voltage-input').value);
  const current = parseFloat(document.getElementById('current-input').value);
  const holdTime = 2000;

  const point = {
    id: Date.now(),
    voltage,
    current,
    holdTime
  };

  curvePoints.push(point);
  updateCurvePointsList();
  updateCurvePreview();
}

function removeCurvePoint(id) {
  curvePoints = curvePoints.filter(p => p.id !== id);
  updateCurvePointsList();
  updateCurvePreview();
}

function clearCurve() {
  curvePoints = [];
  updateCurvePointsList();
  updateCurvePreview();
}

function updateCurvePointsList() {
  const list = document.getElementById('curve-points-list');
  list.innerHTML = curvePoints.map((point, index) => `
    <div class="curve-point-item">
      <div class="point-info">
        #${index + 1}: ${point.voltage.toFixed(2)}V / ${point.current.toFixed(2)}A
        <br>
        <small>保持: ${(point.holdTime / 1000).toFixed(1)}s</small>
      </div>
      <div class="point-actions">
        <button onclick="window.removeCurvePoint(${point.id})">删除</button>
      </div>
    </div>
  `).join('');
}

function updateCurvePreview() {
  const indices = curvePoints.map((_, i) => i);
  const voltages = curvePoints.map(p => p.voltage);
  const currents = curvePoints.map(p => p.current);

  curvePreviewChart.data.labels = indices;
  curvePreviewChart.data.datasets[0].data = voltages;
  curvePreviewChart.data.datasets[1].data = currents;
  curvePreviewChart.update();
}

async function executeCurve() {
  if (curvePoints.length === 0) return;

  document.getElementById('curve-progress-container').style.display = 'block';
  document.getElementById('execute-curve-btn').disabled = true;
  document.getElementById('stop-curve-btn').disabled = false;

  const result = await electronAPI.executeCurve(curvePoints);
  
  if (result.success) {
    console.log('Curve execution completed');
  } else {
    console.error('Curve execution failed:', result.error);
  }

  document.getElementById('execute-curve-btn').disabled = false;
  document.getElementById('stop-curve-btn').disabled = true;
}

async function stopCurve() {
  await electronAPI.stopCurve();
  document.getElementById('execute-curve-btn').disabled = false;
  document.getElementById('stop-curve-btn').disabled = true;
}

function updateCurveProgress(data) {
  const progressPercent = Math.round(data.progress * 100);
  document.getElementById('progress-fill').style.width = `${progressPercent}%`;
  document.getElementById('progress-text').textContent = `${progressPercent}%`;
  
  if (data.data) {
    document.getElementById('target-voltage-value').textContent = data.data.voltage.toFixed(2);
  }
}

function updateConnectionStatus(connected) {
  const indicator = document.getElementById('status-indicator');
  const text = document.getElementById('status-text');
  
  if (connected) {
    indicator.classList.remove('disconnected');
    indicator.classList.add('connected');
    text.textContent = '已连接';
  } else {
    indicator.classList.remove('connected');
    indicator.classList.add('disconnected');
    text.textContent = '未连接';
  }
}

function enableControls(enabled) {
  document.getElementById('connect-btn').disabled = enabled;
  document.getElementById('disconnect-btn').disabled = !enabled;
  document.getElementById('voltage-slider').disabled = !enabled;
  document.getElementById('voltage-input').disabled = !enabled;
  document.getElementById('current-slider').disabled = !enabled;
  document.getElementById('current-input').disabled = !enabled;
  document.getElementById('set-pps-btn').disabled = !enabled;
  document.getElementById('start-monitor-btn').disabled = !enabled || isMonitoring;
  document.getElementById('stop-monitor-btn').disabled = !enabled || !isMonitoring;
  document.getElementById('add-point-btn').disabled = !enabled;
  document.getElementById('clear-curve-btn').disabled = !enabled;
  document.getElementById('execute-curve-btn').disabled = !enabled || curvePoints.length === 0;
  document.getElementById('stop-curve-btn').disabled = true;

  document.getElementById('load-low-current').disabled = !enabled;
  document.getElementById('load-high-current').disabled = !enabled;
  document.getElementById('load-cycles').disabled = !enabled;
  document.getElementById('load-settle-time').disabled = !enabled;
  document.getElementById('start-load-test-btn').disabled = !enabled || loadTestRunning;
  document.getElementById('stop-load-test-btn').disabled = true;

  document.getElementById('ripple-voltage').disabled = !enabled;
  document.getElementById('ripple-current').disabled = !enabled;
  document.getElementById('ripple-duration').disabled = !enabled;
  document.getElementById('ripple-sample-rate').disabled = !enabled;
  document.getElementById('start-ripple-test-btn').disabled = !enabled || rippleTestRunning;
  document.getElementById('export-report-btn').disabled = !enabled || !lastRippleTestData;
}

function updateStatusDisplay(data) {
  if (data.voltage !== undefined) {
    document.getElementById('target-voltage-value').textContent = data.voltage.toFixed(2);
  }
}

function resetDisplay() {
  document.getElementById('voltage-value').textContent = '--';
  document.getElementById('current-value').textContent = '--';
  document.getElementById('power-value').textContent = '--';
  document.getElementById('target-voltage-value').textContent = '--';
  
  monitoringData = { timestamps: [], voltages: [], currents: [] };
  monitoringChart.data.labels = [];
  monitoringChart.data.datasets[0].data = [];
  monitoringChart.data.datasets[1].data = [];
  monitoringChart.update();
}

async function startLoadTransientTest() {
  if (loadTestRunning) return;

  const config = {
    currentLow: parseFloat(document.getElementById('load-low-current').value),
    currentHigh: parseFloat(document.getElementById('load-high-current').value),
    cycles: parseInt(document.getElementById('load-cycles').value),
    settleTime: parseInt(document.getElementById('load-settle-time').value),
    transitionTime: 10
  };

  loadTestRunning = true;
  document.getElementById('start-load-test-btn').disabled = true;
  document.getElementById('stop-load-test-btn').disabled = false;
  document.getElementById('test-progress-container').style.display = 'block';

  const result = await electronAPI.runLoadTransientTest(config);

  if (result.success) {
    updateLoadTestChart(result.testData);
  }

  loadTestRunning = false;
  document.getElementById('start-load-test-btn').disabled = false;
  document.getElementById('stop-load-test-btn').disabled = true;
  document.getElementById('test-progress-container').style.display = 'none';
}

async function stopLoadTransientTest() {
  loadTestRunning = false;
  document.getElementById('start-load-test-btn').disabled = false;
  document.getElementById('stop-load-test-btn').disabled = true;
}

function updateLoadTestChart(testData) {
  document.getElementById('load-test-container').style.display = 'block';

  const cycles = testData.map(d => d.cycle);
  const voltages = testData.map(d => d.voltage);
  const currents = testData.map(d => d.current);

  loadTestChart.data.labels = cycles;
  loadTestChart.data.datasets[0].data = voltages;
  loadTestChart.data.datasets[1].data = currents;
  loadTestChart.update();
}

async function startRippleTest() {
  if (rippleTestRunning) return;

  const config = {
    voltage: parseFloat(document.getElementById('ripple-voltage').value),
    current: parseFloat(document.getElementById('ripple-current').value),
    duration: parseInt(document.getElementById('ripple-duration').value),
    sampleRate: parseInt(document.getElementById('ripple-sample-rate').value)
  };

  rippleTestRunning = true;
  rippleSampleData = [];
  document.getElementById('start-ripple-test-btn').disabled = true;
  document.getElementById('test-progress-container').style.display = 'block';

  const result = await electronAPI.runRippleTest(config);

  if (result.success) {
    lastRippleTestData = result;
    updateRippleTestResults(result.statistics);
    document.getElementById('export-report-btn').disabled = false;
  }

  rippleTestRunning = false;
  document.getElementById('start-ripple-test-btn').disabled = false;
  document.getElementById('test-progress-container').style.display = 'none';
}

function updateRippleSample(sample) {
  rippleSampleData.push(sample);

  if (rippleSampleData.length > 500) {
    rippleSampleData.shift();
  }

  const timestamps = rippleSampleData.map((_, i) => i);
  const voltages = rippleSampleData.map(d => d.voltage);

  document.getElementById('ripple-test-container').style.display = 'block';
  rippleChart.data.labels = timestamps;
  rippleChart.data.datasets[0].data = voltages;
  rippleChart.update('none');
}

function updateRippleTestResults(statistics) {
  document.getElementById('ripple-results-container').style.display = 'block';

  document.getElementById('avg-voltage-value').textContent = statistics.averageVoltage.toFixed(4);
  document.getElementById('min-voltage-value').textContent = statistics.minVoltage.toFixed(4);
  document.getElementById('max-voltage-value').textContent = statistics.maxVoltage.toFixed(4);
  document.getElementById('ripple-pp-value').textContent = (statistics.ripplePp * 1000).toFixed(2);
}

async function exportReport() {
  if (!lastRippleTestData) {
    console.error('No test data to export');
    return;
  }

  const report = {
    reportType: 'voltage-ripple',
    generatedAt: new Date().toISOString(),
    deviceInfo: {
      product: 'USB-PD PPS Controller'
    },
    testData: {
      samples: lastRippleTestData.samples.slice(0, 100)
    },
    statistics: lastRippleTestData.statistics
  };

  const result = await electronAPI.saveReport(report);
  
  if (result.success && !result.canceled) {
    console.log('Report saved to:', result.filePath);
  }
}

function updateTestProgress(progress) {
  const progressPercent = Math.round(progress * 100);
  document.getElementById('test-progress-fill').style.width = `${progressPercent}%`;
  document.getElementById('test-progress-text').textContent = `${progressPercent}%`;
}

window.removeCurvePoint = removeCurvePoint;