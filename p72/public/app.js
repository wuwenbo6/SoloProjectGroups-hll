class FirmwareManager {
  constructor() {
    this.selectedFile = null;
    this.init();
  }

  init() {
    this.setupTabs();
    this.setupFileUpload();
    this.setupEventListeners();
    this.loadData();
    setInterval(() => this.loadData(), 5000);
  }

  setupTabs() {
    document.querySelectorAll('.tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        
        tab.classList.add('active');
        document.getElementById(tab.dataset.tab).classList.add('active');
        
        if (tab.dataset.tab === 'upgrades') {
          this.loadUpgradeOptions();
        }
      });
    });
  }

  setupFileUpload() {
    const fileUpload = document.getElementById('fileUpload');
    const fileInput = document.getElementById('firmwareFile');
    const selectedFile = document.getElementById('selectedFile');

    fileUpload.addEventListener('click', () => fileInput.click());

    fileInput.addEventListener('change', (e) => {
      if (e.target.files[0]) {
        this.selectedFile = e.target.files[0];
        selectedFile.textContent = `已选择: ${this.selectedFile.name} (${this.formatSize(this.selectedFile.size)})`;
      }
    });

    fileUpload.addEventListener('dragover', (e) => {
      e.preventDefault();
      fileUpload.classList.add('dragover');
    });

    fileUpload.addEventListener('dragleave', () => {
      fileUpload.classList.remove('dragover');
    });

    fileUpload.addEventListener('drop', (e) => {
      e.preventDefault();
      fileUpload.classList.remove('dragover');
      
      if (e.dataTransfer.files[0]) {
        this.selectedFile = e.dataTransfer.files[0];
        selectedFile.textContent = `已选择: ${this.selectedFile.name} (${this.formatSize(this.selectedFile.size)})`;
      }
    });
  }

  setupEventListeners() {
    document.getElementById('uploadBtn').addEventListener('click', () => this.uploadFirmware());
    document.getElementById('registerDeviceBtn').addEventListener('click', () => this.registerDevice());
    document.getElementById('startUpgradeBtn').addEventListener('click', () => this.startUpgrade());
    document.getElementById('generateDeltaBtn').addEventListener('click', () => this.generateDeltaPatch());
    document.getElementById('exportJsonBtn').addEventListener('click', () => this.exportStatistics('json'));
    document.getElementById('exportCsvBtn').addEventListener('click', () => this.exportStatistics('csv'));
  }

  async loadData() {
    await Promise.all([
      this.loadFirmware(),
      this.loadDevices(),
      this.loadUpgrades(),
      this.loadStatistics()
    ]);
    this.updateFirmwareSelects();
  }

  async loadFirmware() {
    try {
      const res = await fetch('/api/firmware');
      this.firmwareList = await res.json();
      this.renderFirmwareTable(this.firmwareList);
    } catch (e) {
      console.error('Failed to load firmware:', e);
    }
  }

  async loadDevices() {
    try {
      const res = await fetch('/api/devices');
      const data = await res.json();
      this.renderDevicesTable(data);
    } catch (e) {
      console.error('Failed to load devices:', e);
    }
  }

  async loadUpgrades() {
    try {
      const devicesRes = await fetch('/api/devices');
      const devices = await devicesRes.json();
      
      const allUpgrades = [];
      for (const device of devices) {
        try {
          const historyRes = await fetch(`/api/upgrade/history/${device.device_id}`);
          const history = await historyRes.json();
          allUpgrades.push(...history);
        } catch (e) {
          console.error(`Failed to load history for ${device.device_id}:`, e);
        }
      }
      
      allUpgrades.sort((a, b) => b.started_at - a.started_at);
      this.renderUpgradesTable(allUpgrades.slice(0, 50));
    } catch (e) {
      console.error('Failed to load upgrades:', e);
    }
  }

  async loadUpgradeOptions() {
    try {
      const [devicesRes, firmwareRes] = await Promise.all([
        fetch('/api/devices'),
        fetch('/api/firmware')
      ]);
      
      const devices = await devicesRes.json();
      const firmware = await firmwareRes.json();
      
      const deviceSelect = document.getElementById('upgradeDeviceId');
      const firmwareSelect = document.getElementById('upgradeFirmwareId');
      
      deviceSelect.innerHTML = '<option value="">请选择设备</option>';
      firmwareSelect.innerHTML = '<option value="">请选择固件</option>';
      
      devices.forEach(d => {
        deviceSelect.innerHTML += `<option value="${d.device_id}">${d.device_id} (${d.name || '未命名'})</option>`;
      });
      
      firmware.forEach(f => {
        firmwareSelect.innerHTML += `<option value="${f.id}">${f.version} - ${f.name}</option>`;
      });
    } catch (e) {
      console.error('Failed to load upgrade options:', e);
    }
  }

  async uploadFirmware() {
    const version = document.getElementById('firmwareVersion').value.trim();
    const name = document.getElementById('firmwareName').value.trim();
    const description = document.getElementById('firmwareDesc').value.trim();
    const alertEl = document.getElementById('uploadAlert');

    if (!this.selectedFile) {
      this.showAlert(alertEl, 'error', '请选择固件文件');
      return;
    }

    if (!version || !name) {
      this.showAlert(alertEl, 'error', '请填写版本和名称');
      return;
    }

    const formData = new FormData();
    formData.append('firmware', this.selectedFile);
    formData.append('version', version);
    formData.append('name', name);
    formData.append('description', description);

    try {
      const res = await fetch('/api/firmware/upload', {
        method: 'POST',
        body: formData
      });
      
      const data = await res.json();
      
      if (res.ok) {
        this.showAlert(alertEl, 'success', '固件上传成功！');
        this.selectedFile = null;
        document.getElementById('firmwareFile').value = '';
        document.getElementById('selectedFile').textContent = '';
        document.getElementById('firmwareVersion').value = '';
        document.getElementById('firmwareName').value = '';
        document.getElementById('firmwareDesc').value = '';
        this.loadFirmware();
      } else {
        this.showAlert(alertEl, 'error', data.error || '上传失败');
      }
    } catch (e) {
      this.showAlert(alertEl, 'error', '上传失败: ' + e.message);
    }
  }

  async registerDevice() {
    const deviceId = document.getElementById('newDeviceId').value.trim();
    const name = document.getElementById('newDeviceName').value.trim();

    if (!deviceId) {
      alert('请输入设备ID');
      return;
    }

    try {
      const res = await fetch('/api/devices/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceId, name })
      });
      
      if (res.ok) {
        document.getElementById('newDeviceId').value = '';
        document.getElementById('newDeviceName').value = '';
        this.loadDevices();
      } else {
        const data = await res.json();
        alert('注册失败: ' + data.error);
      }
    } catch (e) {
      alert('注册失败: ' + e.message);
    }
  }

  async startUpgrade() {
    const deviceId = document.getElementById('upgradeDeviceId').value;
    const firmwareId = document.getElementById('upgradeFirmwareId').value;
    const useDelta = document.getElementById('useDeltaUpgrade').checked;
    const alertEl = document.getElementById('upgradeAlert');

    if (!deviceId || !firmwareId) {
      this.showAlert(alertEl, 'error', '请选择设备和固件');
      return;
    }

    try {
      const res = await fetch('/api/upgrade/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceId, firmwareId: parseInt(firmwareId), useDelta })
      });
      
      const data = await res.json();
      
      if (res.ok) {
        const deltaText = data.isDelta ? '（差分升级）' : '';
        this.showAlert(alertEl, 'success', `升级任务已创建${deltaText}，记录ID: ${data.recordId}`);
        this.loadUpgrades();
      } else {
        this.showAlert(alertEl, 'error', data.error || '创建失败');
      }
    } catch (e) {
      this.showAlert(alertEl, 'error', '创建失败: ' + e.message);
    }
  }

  async generateDeltaPatch() {
    const baseId = document.getElementById('baseFirmwareSelect').value;
    const targetId = document.getElementById('targetFirmwareSelect').value;
    const resultEl = document.getElementById('deltaResult');

    if (!baseId || !targetId) {
      this.showAlert(resultEl, 'error', '请选择基准版本和目标版本');
      return;
    }

    if (baseId === targetId) {
      this.showAlert(resultEl, 'error', '基准版本和目标版本不能相同');
      return;
    }

    try {
      this.showAlert(resultEl, 'success', '正在生成差分补丁，请稍候...');
      
      const res = await fetch('/api/firmware/generate-delta', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ baseFirmwareId: parseInt(baseId), targetFirmwareId: parseInt(targetId) })
      });
      
      const data = await res.json();
      
      if (res.ok && data.success) {
        this.showAlert(resultEl, 'success', 
          `差分补丁生成成功！大小: ${this.formatSize(data.delta.size)}，节省: ${data.delta.reduction}%`);
        this.loadFirmware();
      } else {
        this.showAlert(resultEl, 'error', data.error || '生成失败');
      }
    } catch (e) {
      this.showAlert(resultEl, 'error', '生成失败: ' + e.message);
    }
  }

  updateFirmwareSelects() {
    const baseSelect = document.getElementById('baseFirmwareSelect');
    const targetSelect = document.getElementById('targetFirmwareSelect');
    
    if (!this.firmwareList || !this.firmwareList.length) return;
    
    const options = this.firmwareList.map(f => 
      `<option value="${f.id}">${f.version} - ${f.name} (${this.formatSize(f.size)})</option>`
    ).join('');
    
    baseSelect.innerHTML = '<option value="">选择基准固件</option>' + options;
    targetSelect.innerHTML = '<option value="">选择目标固件</option>' + options;
  }

  async loadStatistics() {
    try {
      const res = await fetch('/api/statistics/summary');
      this.stats = await res.json();
      this.renderStatsSummary();
    } catch (e) {
      console.error('Failed to load statistics:', e);
    }
  }

  renderStatsSummary() {
    const container = document.getElementById('statsSummary');
    if (!this.stats) return;

    const statCards = [
      { label: '总升级次数', value: this.stats.total, color: '#667eea' },
      { label: '成功次数', value: this.stats.completed, color: '#28a745' },
      { label: '失败次数', value: this.stats.failed, color: '#dc3545' },
      { label: '已回滚', value: this.stats.rolledBack, color: '#ffc107' },
      { label: '成功率', value: `${this.stats.successRate}%`, color: '#17a2b8' },
      { label: '平均耗时', value: `${this.stats.avgDuration}秒`, color: '#6f42c1' }
    ];

    container.innerHTML = statCards.map(s => `
      <div style="background: ${s.color}15; border-left: 4px solid ${s.color}; padding: 16px; border-radius: 8px;">
        <div style="font-size: 12px; color: #666; margin-bottom: 4px;">${s.label}</div>
        <div style="font-size: 24px; font-weight: 700; color: ${s.color};">${s.value}</div>
      </div>
    `).join('');
  }

  async exportStatistics(format) {
    try {
      const res = await fetch(`/api/statistics/export?format=${format}&limit=1000`);
      
      if (format === 'csv') {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'upgrade_records.csv';
        a.click();
        URL.revokeObjectURL(url);
      } else {
        const data = await res.json();
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'upgrade_statistics.json';
        a.click();
        URL.revokeObjectURL(url);
      }
      
      alert('导出成功！');
    } catch (e) {
      alert('导出失败: ' + e.message);
    }
  }

  async rollbackUpgrade(recordId) {
    if (!confirm('确定要回滚此次升级吗？')) return;

    try {
      await fetch(`/api/upgrade/rollback/${recordId}`, { method: 'POST' });
      this.loadUpgrades();
      this.loadStatistics();
    } catch (e) {
      alert('回滚失败: ' + e.message);
    }
  }

  async deleteFirmware(id) {
    if (!confirm('确定要删除此固件吗？')) return;

    try {
      await fetch(`/api/firmware/${id}`, { method: 'DELETE' });
      this.loadFirmware();
    } catch (e) {
      alert('删除失败: ' + e.message);
    }
  }

  renderFirmwareTable(firmware) {
    const tbody = document.getElementById('firmwareTable');
    
    if (!firmware.length) {
      tbody.innerHTML = `<tr><td colspan="9" class="empty-state"><div class="icon">📦</div>暂无固件</td></tr>`;
      return;
    }

    tbody.innerHTML = firmware.map(f => `
      <tr>
        <td>${f.id}</td>
        <td><strong>${f.version}</strong></td>
        <td>${f.name}</td>
        <td>${this.formatSize(f.size)}</td>
        <td>${f.is_delta === 1 ? `<span class="status status-completed">差分</span>` : '-'}</td>
        <td>${f.block_count}</td>
        <td><code style="font-size: 11px;">${f.checksum.substring(0, 16)}...</code></td>
        <td>${this.formatTime(f.created_at)}</td>
        <td>
          <button class="btn btn-danger" onclick="app.deleteFirmware(${f.id})">删除</button>
        </td>
      </tr>
    `).join('');
  }

  renderDevicesTable(devices) {
    const tbody = document.getElementById('devicesTable');
    
    if (!devices.length) {
      tbody.innerHTML = `<tr><td colspan="6" class="empty-state"><div class="icon">📱</div>暂无设备</td></tr>`;
      return;
    }

    tbody.innerHTML = devices.map(d => `
      <tr>
        <td><code>${d.device_id}</code></td>
        <td>${d.name || '-'}</td>
        <td>${d.current_version || '-'}</td>
        <td><span class="status status-${d.status}">${this.getStatusText(d.status)}</span></td>
        <td>${d.last_seen ? this.formatTime(d.last_seen) : '-'}</td>
        <td>-</td>
      </tr>
    `).join('');
  }

  renderUpgradesTable(upgrades) {
    const tbody = document.getElementById('upgradesTable');
    
    if (!upgrades.length) {
      tbody.innerHTML = `<tr><td colspan="9" class="empty-state"><div class="icon">🔄</div>暂无升级记录</td></tr>`;
      return;
    }

    tbody.innerHTML = upgrades.map(u => {
      const progress = u.total_blocks > 0 ? Math.round((u.current_block / u.total_blocks) * 100) : 0;
      const canRollback = u.status === 'failed' || u.status === 'completed';
      return `
        <tr>
          <td>${u.id}</td>
          <td><code>${u.device_id}</code></td>
          <td>${u.firmware_version || '-'}</td>
          <td>${u.previous_version || '-'}</td>
          <td style="width: 150px;">
            <div class="progress-bar">
              <div class="progress-fill" style="width: ${progress}%"></div>
            </div>
            <small style="color: #666;">${u.current_block}/${u.total_blocks} (${progress}%)</small>
          </td>
          <td><span class="status status-${u.status}">${this.getUpgradeStatusText(u.status)}</span></td>
          <td>
            ${canRollback ? `<button class="btn btn-primary" style="padding: 4px 8px; font-size: 12px;" onclick="app.rollbackUpgrade(${u.id})">回滚</button>` : '-'}
          </td>
          <td>${this.formatTime(u.started_at)}</td>
          <td>${u.completed_at ? this.formatTime(u.completed_at) : '-'}</td>
        </tr>
      `;
    }).join('');
  }

  showAlert(el, type, message) {
    el.innerHTML = `<div class="alert alert-${type}">${message}</div>`;
    setTimeout(() => el.innerHTML = '', 5000);
  }

  formatSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  }

  formatTime(timestamp) {
    if (!timestamp) return '-';
    const date = new Date(timestamp * 1000);
    return date.toLocaleString('zh-CN');
  }

  getStatusText(status) {
    const map = {
      online: '在线',
      offline: '离线',
      upgrading: '升级中',
      error: '错误'
    };
    return map[status] || status;
  }

  getUpgradeStatusText(status) {
    const map = {
      pending: '等待中',
      in_progress: '进行中',
      completed: '已完成',
      failed: '失败',
      rolled_back: '已回滚',
      rollback_failed: '回滚失败'
    };
    return map[status] || status;
  }
}

const app = new FirmwareManager();
