const { ipcRenderer } = require('electron');

class GNSSApp {
  constructor() {
    this.satellites = new Map();
    this.anomalies = [];
    this.selectedSatellite = null;
    this.signalHistory = new Map();
    this.init();
  }

  init() {
    this.setupEventListeners();
    this.setupIPCHandlers();
    this.loadInitialData();
    this.startStatusPolling();
  }

  setupEventListeners() {
    document.getElementById('start-btn').addEventListener('click', () => this.startAnalysis());
    document.getElementById('stop-btn').addEventListener('click', () => this.stopAnalysis());
    document.getElementById('ack-all-btn').addEventListener('click', () => this.acknowledgeAll());
    document.getElementById('export-btn').addEventListener('click', () => this.exportData());
    
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', (e) => this.switchTab(e.target.dataset.tab));
    });

    document.getElementById('modal-close').addEventListener('click', () => this.closeModal());
    document.getElementById('ack-alarm-btn').addEventListener('click', () => this.acknowledgeCurrentAlarm());
    document.getElementById('view-details-btn').addEventListener('click', () => this.viewAlarmDetails());
    
    document.getElementById('filter-type').addEventListener('change', () => this.filterAnomalies());
    document.getElementById('filter-severity').addEventListener('change', () => this.filterAnomalies());
    
    document.getElementById('alarm-indicator').addEventListener('click', () => {
      this.switchTab('anomalies');
    });

    document.getElementById('generate-html-report').addEventListener('click', () => this.generateHTMLReport());
    document.getElementById('export-csv-report').addEventListener('click', () => this.exportCSVReport());
    document.getElementById('view-summary').addEventListener('click', () => this.viewSummary());
    document.getElementById('open-report').addEventListener('click', () => this.openReport());
  }

  setupIPCHandlers() {
    ipcRenderer.on('satellite-update', (_, data) => {
      this.handleSatelliteUpdate(data);
    });

    ipcRenderer.on('anomaly-detected', (_, anomaly) => {
      this.handleAnomalyDetected(anomaly);
    });

    ipcRenderer.on('alarm-triggered', (_, alarm) => {
      this.handleAlarmTriggered(alarm);
    });

    ipcRenderer.on('alarm-acknowledged', (_, alarmId) => {
      this.handleAlarmAcknowledged(alarmId);
    });

    ipcRenderer.on('doa-update', (_, data) => {
      this.handleDoAUpdate(data);
    });

    ipcRenderer.on('auth-update', (_, data) => {
      this.handleAuthUpdate(data);
    });
  }

  async loadInitialData() {
    try {
      const satellites = await ipcRenderer.invoke('get-satellites');
      const anomalies = await ipcRenderer.invoke('get-anomalies');
      
      satellites.forEach(sat => this.satellites.set(sat.prn, sat));
      this.anomalies = anomalies;
      
      this.updateSatelliteList();
      this.updateAnomalyList();
      this.updateStats();
    } catch (err) {
      console.error('Failed to load initial data:', err);
    }
  }

  async startStatusPolling() {
    setInterval(async () => {
      try {
        const status = await ipcRenderer.invoke('get-system-status');
        this.updateSystemStatus(status);
      } catch (err) {
        console.error('Status polling error:', err);
      }
    }, 2000);
  }

  async startAnalysis() {
    try {
      await ipcRenderer.invoke('start-analysis');
      document.getElementById('start-btn').disabled = true;
      document.getElementById('stop-btn').disabled = false;
      this.showNotification('success', '分析已启动', 'GNSS信号分析系统已启动');
    } catch (err) {
      this.showNotification('error', '启动失败', err.message);
    }
  }

  async stopAnalysis() {
    try {
      await ipcRenderer.invoke('stop-analysis');
      document.getElementById('start-btn').disabled = false;
      document.getElementById('stop-btn').disabled = true;
      this.showNotification('success', '分析已停止', 'GNSS信号分析系统已停止');
    } catch (err) {
      this.showNotification('error', '停止失败', err.message);
    }
  }

  handleSatelliteUpdate(data) {
    data.forEach(sat => {
      this.satellites.set(sat.prn, sat);
      
      if (!this.signalHistory.has(sat.prn)) {
        this.signalHistory.set(sat.prn, []);
      }
      
      const history = this.signalHistory.get(sat.prn);
      history.push({
        time: Date.now(),
        snr: sat.snr,
        pseudorange: sat.pseudorange
      });
      
      if (history.length > 50) {
        history.shift();
      }
    });

    this.updateSatelliteList();
    this.updateSkyView();
    this.updateStats();
    this.updateCharts();
  }

  handleAnomalyDetected(anomaly) {
    this.anomalies.unshift(anomaly);
    if (this.anomalies.length > 100) {
      this.anomalies.pop();
    }
    
    this.updateAnomalyList();
    this.updateStats();
    
    const satItem = document.querySelector(`[data-prn="${anomaly.satellite_prn}"]`);
    if (satItem) {
      satItem.classList.add('anomaly');
      setTimeout(() => satItem.classList.remove('anomaly'), 5000);
    }
  }

  handleAlarmTriggered(alarm) {
    this.showAlarmModal(alarm);
    this.updateAlarmCount();
  }

  handleAlarmAcknowledged(alarmId) {
    this.closeModal();
    this.updateAlarmCount();
  }

  updateSatelliteList() {
    const container = document.getElementById('satellite-list');
    container.innerHTML = '';

    const sortedSatellites = Array.from(this.satellites.values()).sort((a, b) => a.prn - b.prn);

    sortedSatellites.forEach(sat => {
      const item = document.createElement('div');
      item.className = 'satellite-item';
      item.dataset.prn = sat.prn;
      
      if (this.selectedSatellite === sat.prn) {
        item.classList.add('selected');
      }

      if (sat.isMultipath) {
        item.classList.add('multipath');
      }

      const snrClass = sat.snr >= 40 ? 'good' : sat.snr >= 30 ? 'warning' : 'poor';
      
      const multipathIndicator = sat.isMultipath 
        ? `<span class="multipath-badge" title="多径影响 (置信度: ${(sat.multipathConfidence * 100).toFixed(0)}%)">🌫️</span>` 
        : '';
      
      item.innerHTML = `
        <div class="satellite-prn">${sat.prn}</div>
        <div class="satellite-info">
          <div class="system">${sat.system} ${multipathIndicator}</div>
          <div class="snr ${snrClass}">SNR: ${sat.snr?.toFixed(1) || '--'} dB-Hz</div>
        </div>
      `;

      item.addEventListener('click', () => this.selectSatellite(sat.prn));
      container.appendChild(item);
    });
  }

  selectSatellite(prn) {
    this.selectedSatellite = prn;
    this.updateSatelliteList();
    this.loadEphemeris(prn);
  }

  async loadEphemeris(prn) {
    try {
      const ephemeris = await ipcRenderer.invoke('get-ephemeris', prn);
      const signalHistory = await ipcRenderer.invoke('get-signal-history', prn);
      
      this.updateEphemerisDisplay(prn, ephemeris, signalHistory);
    } catch (err) {
      console.error('Failed to load ephemeris:', err);
    }
  }

  updateEphemerisDisplay(prn, ephemeris, history) {
    const container = document.getElementById('ephemeris-content');
    const sat = this.satellites.get(prn);
    
    if (!sat) {
      container.innerHTML = '<p class="text-muted">卫星数据不可用</p>';
      return;
    }

    let multipathInfo = '';
    if (sat.isMultipath) {
      multipathInfo = `
        <div style="background: rgba(255, 165, 0, 0.2); padding: 12px; border-radius: 8px; margin-bottom: 16px; border-left: 4px solid #ffa502;">
          <div style="font-weight: bold; color: #ffa502; margin-bottom: 8px;">🌫️ 检测到多径影响</div>
          <div style="font-size: 0.9rem;">置信度: ${(sat.multipathConfidence * 100).toFixed(1)}%</div>
          <div style="font-size: 0.85rem; color: #aaa; margin-top: 4px;">
            原因: ${sat.multipathReasons?.join(', ') || '信号分析'}
          </div>
        </div>
      `;
    }

    const driftInfo = sat.gradualDrift ? `
      <div style="background: rgba(255, 71, 87, 0.2); padding: 12px; border-radius: 8px; margin-bottom: 16px; border-left: 4px solid #ff4757;">
        <div style="font-weight: bold; color: #ff4757; margin-bottom: 8px;">⚠️ 检测到渐进漂移</div>
        <div style="font-size: 0.9rem;">累计漂移量: ${sat.gradualDrift?.toFixed(2)}m</div>
      </div>
    ` : '';

    const ephemerisData = ephemeris || {
      toe: '--',
      sqrt_a: 5153.5,
      e: 0.01,
      i0: 55,
      omega0: 100,
      omega: 45,
      m0: 0,
      week: 2300
    };

    container.innerHTML = `
      <h4 style="margin-bottom: 16px; color: #00d9ff;">PRN ${prn} - ${sat.system}</h4>
      ${multipathInfo}
      ${driftInfo}
      <div class="ephemeris-grid">
        <div class="ephemeris-item">
          <div class="ephemeris-label">方位角</div>
          <div class="ephemeris-value">${sat.azimuth?.toFixed(1) || '--'}°</div>
        </div>
        <div class="ephemeris-item">
          <div class="ephemeris-label">仰角</div>
          <div class="ephemeris-value">${sat.elevation?.toFixed(1) || '--'}°</div>
        </div>
        <div class="ephemeris-item">
          <div class="ephemeris-label">SNR</div>
          <div class="ephemeris-value">${sat.snr?.toFixed(1) || '--'} dB</div>
        </div>
        <div class="ephemeris-item">
          <div class="ephemeris-label">伪距</div>
          <div class="ephemeris-value">${sat.pseudorange?.toFixed(0) || '--'} m</div>
        </div>
        <div class="ephemeris-item">
          <div class="ephemeris-label">轨道半长轴 (√a)</div>
          <div class="ephemeris-value">${ephemerisData.sqrt_a?.toFixed(3) || '--'} km</div>
        </div>
        <div class="ephemeris-item">
          <div class="ephemeris-label">偏心率 (e)</div>
          <div class="ephemeris-value">${ephemerisData.e?.toFixed(6) || '--'}</div>
        </div>
        <div class="ephemeris-item">
          <div class="ephemeris-label">轨道倾角 (i0)</div>
          <div class="ephemeris-value">${ephemerisData.i0?.toFixed(4) || '--'}°</div>
        </div>
        <div class="ephemeris-item">
          <div class="ephemeris-label">近地点角距 (ω)</div>
          <div class="ephemeris-value">${ephemerisData.omega?.toFixed(2) || '--'}°</div>
        </div>
        <div class="ephemeris-item">
          <div class="ephemeris-label">升交点赤经 (Ω0)</div>
          <div class="ephemeris-value">${ephemerisData.omega0?.toFixed(2) || '--'}°</div>
        </div>
        <div class="ephemeris-item">
          <div class="ephemeris-label">平近点角 (M0)</div>
          <div class="ephemeris-value">${ephemerisData.m0?.toFixed(2) || '--'}°</div>
        </div>
        <div class="ephemeris-item">
          <div class="ephemeris-label">星历参考时间 (TOE)</div>
          <div class="ephemeris-value">${ephemerisData.toe || '--'}</div>
        </div>
        <div class="ephemeris-item">
          <div class="ephemeris-label">GPS周</div>
          <div class="ephemeris-value">${ephemerisData.week || '--'}</div>
        </div>
      </div>
    `;
  }

  updateSkyView() {
    const canvas = document.getElementById('skyview-canvas');
    const ctx = canvas.getContext('2d');
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const radius = Math.min(centerX, centerY) - 20;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.strokeStyle = 'rgba(0, 217, 255, 0.3)';
    ctx.lineWidth = 1;

    for (let i = 1; i <= 3; i++) {
      ctx.beginPath();
      ctx.arc(centerX, centerY, (radius * i) / 3, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.beginPath();
    ctx.moveTo(centerX - radius, centerY);
    ctx.lineTo(centerX + radius, centerY);
    ctx.moveTo(centerX, centerY - radius);
    ctx.lineTo(centerX, centerY + radius);
    ctx.stroke();

    const directions = ['N', 'E', 'S', 'W'];
    const angles = [-Math.PI / 2, 0, Math.PI / 2, Math.PI];
    ctx.fillStyle = '#00d9ff';
    ctx.font = '12px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    directions.forEach((dir, i) => {
      const x = centerX + Math.cos(angles[i]) * (radius + 15);
      const y = centerY + Math.sin(angles[i]) * (radius + 15);
      ctx.fillText(dir, x, y);
    });

    this.satellites.forEach(sat => {
      if (sat.elevation !== undefined && sat.azimuth !== undefined) {
        const el = sat.elevation * (Math.PI / 180);
        const az = sat.azimuth * (Math.PI / 180) - Math.PI / 2;
        
        const r = radius * (1 - el / (Math.PI / 2));
        const x = centerX + r * Math.cos(az);
        const y = centerY + r * Math.sin(az);

        const snrRatio = Math.min(1, Math.max(0, (sat.snr - 20) / 40));
        const hue = 120 * snrRatio;
        const color = `hsl(${hue}, 100%, 50%)`;

        ctx.beginPath();
        ctx.arc(x, y, 8, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.fillStyle = '#fff';
        ctx.font = 'bold 10px Arial';
        ctx.fillText(sat.prn, x, y - 12);
      }
    });
  }

  updateCharts() {
    this.drawSNRChart();
    this.drawPseudorangeChart();
  }

  drawSNRChart() {
    const canvas = document.getElementById('snr-chart');
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    const rect = canvas.parentElement.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = 250;
    
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const padding = { top: 20, right: 20, bottom: 30, left: 50 };
    const chartWidth = canvas.width - padding.left - padding.right;
    const chartHeight = canvas.height - padding.top - padding.bottom;

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = padding.top + (chartHeight * i) / 4;
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(canvas.width - padding.right, y);
      ctx.stroke();
      
      ctx.fillStyle = '#888';
      ctx.font = '10px Arial';
      ctx.textAlign = 'right';
      ctx.fillText((60 - i * 10) + ' dB', padding.left - 5, y + 3);
    }

    const colors = ['#00d9ff', '#00ff88', '#ffa502', '#ff4757', '#a855f7', '#ec4899', '#14b8a6', '#f59e0b'];
    let colorIndex = 0;

    this.signalHistory.forEach((history, prn) => {
      if (history.length < 2) return;

      ctx.beginPath();
      ctx.strokeStyle = colors[colorIndex % colors.length];
      ctx.lineWidth = 2;

      history.forEach((point, i) => {
        const x = padding.left + (chartWidth * i) / (history.length - 1);
        const normalizedSNR = Math.max(0, Math.min(1, (point.snr - 20) / 40));
        const y = padding.top + chartHeight * (1 - normalizedSNR);
        
        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      });

      ctx.stroke();

      const lastPoint = history[history.length - 1];
      const lastX = padding.left + chartWidth;
      const normalizedSNR = Math.max(0, Math.min(1, (lastPoint.snr - 20) / 40));
      const lastY = padding.top + chartHeight * (1 - normalizedSNR);
      
      ctx.fillStyle = colors[colorIndex % colors.length];
      ctx.textAlign = 'left';
      ctx.fillText(`PRN ${prn}`, lastX + 5, lastY + 3);

      colorIndex++;
    });
  }

  drawPseudorangeChart() {
    const canvas = document.getElementById('pseudorange-chart');
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    const rect = canvas.parentElement.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = 250;
    
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const padding = { top: 20, right: 20, bottom: 30, left: 70 };
    const chartWidth = canvas.width - padding.left - padding.right;
    const chartHeight = canvas.height - padding.top - padding.bottom;

    let minRange = Infinity;
    let maxRange = -Infinity;

    this.signalHistory.forEach(history => {
      history.forEach(point => {
        if (point.pseudorange) {
          minRange = Math.min(minRange, point.pseudorange);
          maxRange = Math.max(maxRange, point.pseudorange);
        }
      });
    });

    if (minRange === Infinity) return;

    const rangePadding = (maxRange - minRange) * 0.1;
    minRange -= rangePadding;
    maxRange += rangePadding;

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = padding.top + (chartHeight * i) / 4;
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(canvas.width - padding.right, y);
      ctx.stroke();
      
      const value = maxRange - ((maxRange - minRange) * i) / 4;
      ctx.fillStyle = '#888';
      ctx.font = '10px Arial';
      ctx.textAlign = 'right';
      ctx.fillText((value / 1000).toFixed(1) + ' km', padding.left - 5, y + 3);
    }

    const colors = ['#00d9ff', '#00ff88', '#ffa502', '#ff4757', '#a855f7', '#ec4899', '#14b8a6', '#f59e0b'];
    let colorIndex = 0;

    this.signalHistory.forEach((history, prn) => {
      if (history.length < 2) return;

      ctx.beginPath();
      ctx.strokeStyle = colors[colorIndex % colors.length];
      ctx.lineWidth = 2;

      history.forEach((point, i) => {
        if (!point.pseudorange) return;
        
        const x = padding.left + (chartWidth * i) / (history.length - 1);
        const normalized = (point.pseudorange - minRange) / (maxRange - minRange);
        const y = padding.top + chartHeight * (1 - normalized);
        
        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      });

      ctx.stroke();
      colorIndex++;
    });
  }

  updateAnomalyList() {
    const container = document.getElementById('anomaly-list');
    const typeFilter = document.getElementById('filter-type').value;
    const severityFilter = document.getElementById('filter-severity').value;

    const filtered = this.anomalies.filter(a => {
      if (typeFilter && a.type !== typeFilter) return false;
      if (severityFilter && a.severity !== severityFilter) return false;
      return true;
    });

    if (filtered.length === 0) {
      container.innerHTML = '<p class="text-muted">暂无异常记录</p>';
      return;
    }

    container.innerHTML = filtered.map(anomaly => {
      const typeLabels = {
        pseudorange_jump: '📡 伪距突变',
        signal_power_spike: '📈 信号功率突升',
        signal_power_drop: '📉 信号功率突降',
        low_cn0: '⚠️ 载噪比过低',
        unnatural_stability: '🔒 异常稳定',
        gradual_pseudorange_drift: '📊 CUSUM伪距漂移',
        gradual_signal_drift: '📊 EWMA信号漂移',
        satellite_outlier: '⚠️ 卫星数据异常',
        unnatural_snr_uniformity: '🚨 SNR异常一致'
      };

      const methodLabels = {
        abrupt_change: '突变检测',
        CUSUM: 'CUSUM统计',
        EWMA: 'EWMA控制图',
        stability: '稳定性分析',
        threshold: '阈值检测',
        cross_validation: '交叉验证'
      };

      const time = new Date(anomaly.timestamp).toLocaleString('zh-CN');
      const detectionInfo = anomaly.detectionMethod 
        ? `<span class="method-badge">${methodLabels[anomaly.detectionMethod] || anomaly.detectionMethod}</span>`
        : '';

      const multipathTag = (anomaly.multipathConfidence > 0.3) 
        ? `<span class="multipath-tag" title="多径置信度: ${(anomaly.multipathConfidence * 100).toFixed(0)}%">🌫️ 多径影响</span>`
        : '';

      return `
        <div class="anomaly-item severity-${anomaly.severity} ${anomaly.acknowledged ? 'acknowledged' : ''}" data-anomaly-id="${anomaly.id}">
          <div class="anomaly-header">
            <span class="anomaly-type">${typeLabels[anomaly.type] || anomaly.type} ${detectionInfo} ${multipathTag}</span>
            <span class="anomaly-time">${time}</span>
          </div>
          <div class="anomaly-description">${anomaly.description}</div>
          <div class="anomaly-meta">
            <span>PRN: ${anomaly.satellite_prn || 'N/A'}</span>
            <span>级别: ${anomaly.severity}</span>
            ${anomaly.detectionMethod ? `<span>检测: ${methodLabels[anomaly.detectionMethod] || anomaly.detectionMethod}</span>` : ''}
            ${anomaly.value_before !== null && anomaly.value_before !== undefined ? `<span>变化: ${(anomaly.value_after - anomaly.value_before).toFixed(2)}</span>` : ''}
          </div>
          ${!anomaly.acknowledged ? `
            <div class="anomaly-actions">
              <button class="btn btn-sm btn-primary" onclick="app.acknowledgeAnomaly(${anomaly.id})">确认</button>
            </div>
          ` : ''}
        </div>
      `;
    }).join('');
  }

  filterAnomalies() {
    this.updateAnomalyList();
  }

  async acknowledgeAnomaly(anomalyId) {
    try {
      await ipcRenderer.invoke('acknowledge-alarm', anomalyId);
      
      const anomaly = this.anomalies.find(a => a.id === anomalyId);
      if (anomaly) {
        anomaly.acknowledged = true;
      }
      
      this.updateAnomalyList();
      this.updateAlarmCount();
      this.showNotification('success', '警报已确认', '异常事件已确认');
    } catch (err) {
      this.showNotification('error', '操作失败', err.message);
    }
  }

  async acknowledgeAll() {
    try {
      const count = this.anomalies.filter(a => !a.acknowledged).length;
      this.anomalies.forEach(a => a.acknowledged = true);
      
      this.updateAnomalyList();
      this.updateAlarmCount();
      this.showNotification('success', '已全部确认', `已确认 ${count} 条警报`);
    } catch (err) {
      this.showNotification('error', '操作失败', err.message);
    }
  }

  async exportData() {
    try {
      const path = await ipcRenderer.invoke('export-data', { includeHistory: true });
      this.showNotification('success', '导出成功', `数据已导出到: ${path}`);
    } catch (err) {
      this.showNotification('error', '导出失败', err.message);
    }
  }

  updateStats() {
    document.getElementById('stat-satellites').textContent = this.satellites.size;
    
    const unacknowledged = this.anomalies.filter(a => !a.acknowledged).length;
    document.getElementById('stat-anomalies').textContent = unacknowledged;

    if (this.satellites.size > 0) {
      const avgSNR = Array.from(this.satellites.values())
        .reduce((sum, sat) => sum + (sat.snr || 0), 0) / this.satellites.size;
      document.getElementById('stat-avg-snr').textContent = avgSNR.toFixed(1);
    }

    this.updateAlarmCount();
  }

  updateAlarmCount() {
    const activeCount = this.anomalies.filter(a => !a.acknowledged).length;
    document.getElementById('alarm-count').textContent = activeCount;
    document.getElementById('stat-alarms').textContent = activeCount;
    
    const indicator = document.getElementById('alarm-indicator');
    if (activeCount > 0) {
      indicator.classList.add('active');
    } else {
      indicator.classList.remove('active');
    }
  }

  updateSystemStatus(status) {
    const indicator = document.getElementById('status-indicator');
    const statusText = document.getElementById('status-text');

    if (status.running) {
      indicator.className = 'status-indicator online';
      statusText.textContent = '运行中';
      document.getElementById('start-btn').disabled = true;
      document.getElementById('stop-btn').disabled = false;
    } else {
      indicator.className = 'status-indicator offline';
      statusText.textContent = '已停止';
      document.getElementById('start-btn').disabled = false;
      document.getElementById('stop-btn').disabled = true;
    }
  }

  switchTab(tabName) {
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === tabName);
    });

    document.querySelectorAll('.tab-pane').forEach(pane => {
      pane.classList.toggle('active', pane.id === `tab-${tabName}`);
    });

    if (tabName === 'signals') {
      setTimeout(() => this.updateCharts(), 100);
    }
  }

  showAlarmModal(alarm) {
    const modal = document.getElementById('alarm-modal');
    const details = document.getElementById('alarm-details');
    
    details.innerHTML = `
      <div style="text-align: center; margin-bottom: 20px;">
        <div style="font-size: 4rem; margin-bottom: 10px;">🚨</div>
        <h3 style="color: #ff4757; margin-bottom: 10px;">检测到安全异常</h3>
      </div>
      <div style="background: rgba(0, 0, 0, 0.3); padding: 16px; border-radius: 8px;">
        <p style="margin-bottom: 12px;"><strong>类型:</strong> ${alarm.anomaly.type}</p>
        <p style="margin-bottom: 12px;"><strong>级别:</strong> ${alarm.anomaly.severity}</p>
        <p style="margin-bottom: 12px;"><strong>卫星:</strong> PRN ${alarm.anomaly.satellite_prn || 'N/A'}</p>
        <p style="margin-bottom: 12px;"><strong>描述:</strong> ${alarm.anomaly.description}</p>
        <p><strong>时间:</strong> ${new Date(alarm.timestamp).toLocaleString('zh-CN')}</p>
      </div>
    `;
    
    modal.classList.remove('hidden');
    this.currentAlarm = alarm;
  }

  closeModal() {
    document.getElementById('alarm-modal').classList.add('hidden');
  }

  acknowledgeCurrentAlarm() {
    if (this.currentAlarm) {
      this.acknowledgeAnomaly(this.currentAlarm.anomaly.id);
    }
  }

  viewAlarmDetails() {
    this.closeModal();
    this.switchTab('anomalies');
  }

  showNotification(type, title, message) {
    const container = document.getElementById('notification-area');
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.innerHTML = `
      <div class="notification-title">${title}</div>
      <div class="notification-message">${message}</div>
    `;
    
    container.appendChild(notification);
    
    notification.addEventListener('click', () => {
      notification.remove();
    });

    setTimeout(() => {
      if (notification.parentElement) {
        notification.style.opacity = '0';
        notification.style.transform = 'translateX(100%)';
        notification.style.transition = 'all 0.3s';
        setTimeout(() => notification.remove(), 300);
      }
    }, 5000);
  }

  handleDoAUpdate(data) {
    this.doaData = data;
    this.updateDoADisplay();
  }

  handleAuthUpdate(data) {
    this.authData = data;
    this.updateAuthDisplay();
  }

  updateDoADisplay() {
    const container = document.getElementById('doa-grid');
    if (!container) return;

    if (!this.doaData || Object.keys(this.doaData).length === 0) {
      container.innerHTML = '<p class="text-muted">启动分析后显示测向数据</p>';
      return;
    }

    container.innerHTML = Object.entries(this.doaData).map(([prn, doa]) => {
      if (!doa) return '';
      
      const stabilityClass = doa.stability > 0.95 ? 'high' : doa.stability > 0.85 ? 'medium' : 'low';
      const sat = this.satellites.get(parseInt(prn));
      const expectedAz = sat?.azimuth || doa.azimuth;
      const expectedEl = sat?.elevation || doa.elevation;
      const azDiff = Math.abs(doa.azimuth - expectedAz);
      
      return `
        <div class="doa-card">
          <div class="prn-header">
            <div class="prn-badge">${prn}</div>
            <div class="prn-title">PRN ${prn}</div>
          </div>
          <div class="doa-stats">
            <div class="stat">实测方位<span>${doa.azimuth?.toFixed(1) || '--'}°</span></div>
            <div class="stat">实测仰角<span>${doa.elevation?.toFixed(1) || '--'}°</span></div>
            <div class="stat">方位偏差<span>${azDiff.toFixed(1)}°</span></div>
            <div class="stat">稳定度<span>${(doa.stability * 100).toFixed(1)}%</span></div>
          </div>
          <div class="stability-bar">
            <div class="stability-fill ${stabilityClass}" style="width: ${doa.stability * 100}%"></div>
          </div>
        </div>
      `;
    }).join('');
  }

  updateAuthDisplay() {
    const container = document.getElementById('auth-grid');
    if (!container) return;

    if (!this.authData || Object.keys(this.authData).length === 0) {
      container.innerHTML = '<p class="text-muted">启动分析后显示认证数据</p>';
      return;
    }

    container.innerHTML = Object.entries(this.authData).map(([prn, auth]) => {
      if (!auth) return '';
      
      const score = Math.round(auth.score * 100);
      const scoreClass = score >= 80 ? 'good' : score >= 60 ? 'warning' : 'poor';
      
      const checkBadges = auth.checks?.map(check => `
        <span class="auth-check ${check.pass ? 'pass' : 'fail'}">${check.name}: ${check.pass ? '✓' : '✗'}</span>
      `).join('') || '';
      
      return `
        <div class="auth-card">
          <div class="prn-header">
            <div class="prn-badge">${prn}</div>
            <div class="prn-title">PRN ${prn}</div>
          </div>
          <div class="auth-score-circle ${scoreClass}">
            ${score}
          </div>
          <div style="text-align: center; margin-bottom: 10px;">
            <strong>${auth.authentic ? '✓ 认证通过' : '⚠ 认证警告'}</strong>
          </div>
          <div class="auth-checks">
            ${checkBadges}
          </div>
        </div>
      `;
    }).join('');
  }

  async generateHTMLReport() {
    try {
      this.showNotification('success', '生成中', '正在生成报告...');
      const result = await ipcRenderer.invoke('generate-report', {});
      
      this.currentReportPath = result.path;
      document.getElementById('report-path').textContent = `文件已保存到：${result.path}`;
      document.getElementById('report-result').classList.remove('hidden');
      
      this.showNotification('success', '报告生成成功', `已保存到用户目录`);
    } catch (err) {
      this.showNotification('error', '生成失败', err.message);
    }
  }

  async exportCSVReport() {
    try {
      const path = await ipcRenderer.invoke('export-csv', {});
      this.showNotification('success', '导出成功', `CSV文件已保存到：${path}`);
    } catch (err) {
      this.showNotification('error', '导出失败', err.message);
    }
  }

  async viewSummary() {
    try {
      const satellites = await ipcRenderer.invoke('get-satellites');
      const anomalies = await ipcRenderer.invoke('get-anomalies', {});
      const config = await ipcRenderer.invoke('get-detection-config');

      const summaryPanel = document.getElementById('summary-panel');
      const summaryContent = document.getElementById('summary-content');

      const unacknowledged = anomalies.filter(a => !a.acknowledged).length;
      const avgSNR = satellites.length > 0 
        ? (satellites.reduce((sum, s) => sum + (s.snr || 0), 0) / satellites.length).toFixed(1)
        : 0;

      summaryContent.innerHTML = `
        <div class="summary-item">
          <div class="value">${satellites.length}</div>
          <div class="label">可见卫星</div>
        </div>
        <div class="summary-item">
          <div class="value">${anomalies.length}</div>
          <div class="label">异常总数</div>
        </div>
        <div class="summary-item">
          <div class="value" style="color: ${unacknowledged > 0 ? '#ff4757' : '#2ed573'}">${unacknowledged}</div>
          <div class="label">未确认警报</div>
        </div>
        <div class="summary-item">
          <div class="value">${avgSNR}</div>
          <div class="label">平均SNR (dB)</div>
        </div>
        <div class="summary-item">
          <div class="value" style="color: ${config.directionFinding.enabled ? '#2ed573' : '#ff4757'}">${config.directionFinding.enabled ? '✓' : '✗'}</div>
          <div class="label">多天线测向</div>
        </div>
        <div class="summary-item">
          <div class="value" style="color: ${config.signalAuth.enabled ? '#2ed573' : '#ff4757'}">${config.signalAuth.enabled ? '✓' : '✗'}</div>
          <div class="label">信号认证</div>
        </div>
      `;

      summaryPanel.style.display = 'block';
    } catch (err) {
      this.showNotification('error', '获取摘要失败', err.message);
    }
  }

  async openReport() {
    if (this.currentReportPath) {
      await ipcRenderer.invoke('open-report', this.currentReportPath);
    }
  }
}

const app = new GNSSApp();
window.app = app;

window.addEventListener('resize', () => {
  app.updateCharts();
});