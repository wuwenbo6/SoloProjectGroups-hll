class UIController {
  constructor(app) {
    this.app = app;
    this.selectedFormationId = null;
    this.currentWaypoints = [];
    this.currentLightConfig = {
      mode: 'static',
      color: '#ff0000',
      frequency: 1
    };

    this.init();
  }

  init() {
    this.bindEvents();
    this.loadFormationList();
    this.updateSliderValues();
  }

  bindEvents() {
    document.getElementById('save-formation').addEventListener('click', () => this.saveFormation());
    document.getElementById('load-formation').addEventListener('click', () => this.loadFormation());
    document.getElementById('delete-formation').addEventListener('click', () => this.deleteFormation());
    
    document.getElementById('csv-upload').addEventListener('change', (e) => this.handleCsvUpload(e));
    document.getElementById('load-waypoints').addEventListener('click', () => this.loadWaypoints());
    document.getElementById('clear-waypoints').addEventListener('click', () => this.clearWaypoints());

    document.getElementById('generate-pattern').addEventListener('click', () => this.generatePattern());
    document.getElementById('apply-formation').addEventListener('click', () => this.applyFormation());

    document.getElementById('drone-count').addEventListener('change', (e) => this.setDroneCount(e.target.value));
    document.getElementById('speed-control').addEventListener('input', (e) => this.updateSpeed(e.target.value));
    document.getElementById('collision-avoidance').addEventListener('change', (e) => this.toggleCollisionAvoidance(e.target.checked));
    document.getElementById('start-fly').addEventListener('click', () => this.app.startFlight());
    document.getElementById('pause-fly').addEventListener('click', () => this.app.pauseFlight());
    document.getElementById('stop-fly').addEventListener('click', () => this.app.stopFlight());
    document.getElementById('return-home').addEventListener('click', () => this.app.returnHome());

    document.getElementById('light-mode').addEventListener('change', (e) => this.currentLightConfig.mode = e.target.value);
    document.getElementById('light-color').addEventListener('change', (e) => this.currentLightConfig.color = e.target.value);
    document.getElementById('light-frequency').addEventListener('input', (e) => {
      this.currentLightConfig.frequency = parseFloat(e.target.value);
      document.getElementById('frequency-value').textContent = e.target.value;
    });
    document.getElementById('apply-lights').addEventListener('click', () => this.applyLights());

    document.getElementById('export-kml').addEventListener('click', () => this.exportKML());
    document.getElementById('download-kml').addEventListener('click', () => this.downloadKML());
  }

  updateSliderValues() {
    const speedControl = document.getElementById('speed-control');
    const speedValue = document.getElementById('speed-value');
    speedControl.addEventListener('input', (e) => {
      speedValue.textContent = parseFloat(e.target.value).toFixed(1);
    });

    const freqControl = document.getElementById('light-frequency');
    const freqValue = document.getElementById('frequency-value');
    freqControl.addEventListener('input', (e) => {
      freqValue.textContent = parseFloat(e.target.value).toFixed(1);
    });
  }

  async saveFormation() {
    const nameInput = document.getElementById('formation-name');
    const name = nameInput.value.trim();
    
    if (!name) {
      alert('请输入编队名称');
      return;
    }

    try {
      const result = await this.app.saveFormation(name);
      if (result.success) {
        alert('编队方案保存成功！');
        nameInput.value = '';
        this.loadFormationList();
      } else {
        alert('保存失败: ' + (result.error || '未知错误'));
      }
    } catch (error) {
      alert('保存失败: ' + error.message);
    }
  }

  async loadFormationList() {
    try {
      const result = await this.app.getFormations();
      const listContainer = document.getElementById('formation-list');
      listContainer.innerHTML = '';

      if (result.formations && result.formations.length > 0) {
        result.formations.forEach(formation => {
          const item = document.createElement('div');
          item.className = 'formation-item';
          if (formation.id === this.selectedFormationId) {
            item.classList.add('selected');
          }
          item.innerHTML = `
            <div><strong>${formation.name}</strong></div>
            <div style="font-size: 0.8em; color: #888;">
              无人机: ${formation.droneCount} | 
              创建: ${new Date(formation.createdAt).toLocaleString()}
            </div>
          `;
          item.addEventListener('click', () => {
            this.selectedFormationId = formation.id;
            this.loadFormationList();
          });
          listContainer.appendChild(item);
        });
      } else {
        listContainer.innerHTML = '<div style="color: #888; text-align: center; padding: 10px;">暂无保存的编队方案</div>';
      }
    } catch (error) {
      console.error('加载编队列表失败:', error);
    }
  }

  async loadFormation() {
    if (!this.selectedFormationId) {
      alert('请先选择一个编队方案');
      return;
    }

    try {
      await this.app.loadFormation(this.selectedFormationId);
      alert('编队方案加载成功！');
    } catch (error) {
      alert('加载失败: ' + error.message);
    }
  }

  async deleteFormation() {
    if (!this.selectedFormationId) {
      alert('请先选择一个编队方案');
      return;
    }

    if (!confirm('确定要删除这个编队方案吗？')) {
      return;
    }

    try {
      const result = await this.app.deleteFormation(this.selectedFormationId);
      if (result.success) {
        alert('删除成功！');
        this.selectedFormationId = null;
        this.loadFormationList();
      } else {
        alert('删除失败');
      }
    } catch (error) {
      alert('删除失败: ' + error.message);
    }
  }

  async handleCsvUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    try {
      const result = await this.app.uploadWaypoints(file);
      if (result.success) {
        this.currentWaypoints = result.waypoints;
        document.getElementById('waypoint-info').innerHTML = `
          文件: ${result.filename}<br>
          航点数量: ${result.count}
        `;
      } else {
        alert('上传失败: ' + (result.error || '未知错误'));
      }
    } catch (error) {
      alert('上传失败: ' + error.message);
    }
  }

  loadWaypoints() {
    if (this.currentWaypoints.length === 0) {
      alert('请先上传航点文件');
      return;
    }
    this.app.setWaypoints(this.currentWaypoints);
    alert('航点已加载到无人机！');
  }

  clearWaypoints() {
    this.currentWaypoints = [];
    document.getElementById('csv-upload').value = '';
    document.getElementById('waypoint-info').innerHTML = '';
  }

  generatePattern() {
    const patternType = document.getElementById('pattern-select').value;
    const text = document.getElementById('text-input').value.trim();
    
    let positions = [];
    
    if (patternType === 'text') {
      if (!text) {
        alert('请输入要显示的文字');
        return;
      }
      positions = this.app.generatePattern('text', text);
    } else if (patternType) {
      positions = this.app.generatePattern(patternType);
    } else {
      alert('请选择图案类型或输入文字');
      return;
    }

    this.app.applyFormation(positions);
    alert('图案轨迹已生成！');
  }

  applyFormation() {
    const patternType = document.getElementById('pattern-select').value;
    const text = document.getElementById('text-input').value.trim();
    
    let positions = [];
    
    if (patternType === 'text' && text) {
      positions = this.app.generatePattern('text', text);
    } else if (patternType) {
      positions = this.app.generatePattern(patternType);
    } else {
      positions = this.app.generatePattern('circle');
    }

    this.app.applyFormation(positions);
    alert('编队已应用！');
  }

  setDroneCount(count) {
    const num = parseInt(count);
    if (num >= 1 && num <= 100) {
      this.app.setDroneCount(num);
    }
  }

  updateSpeed(value) {
    const speed = parseFloat(value);
    document.getElementById('speed-value').textContent = speed.toFixed(1);
    this.app.setSpeed(speed);
  }

  toggleCollisionAvoidance(enabled) {
    this.app.toggleCollisionAvoidance(enabled);
  }

  applyLights() {
    this.app.setLights(this.currentLightConfig);
    alert('灯光设置已应用！');
  }

  applyLightConfig(config) {
    if (config.mode) {
      document.getElementById('light-mode').value = config.mode;
      this.currentLightConfig.mode = config.mode;
    }
    if (config.color) {
      document.getElementById('light-color').value = config.color;
      this.currentLightConfig.color = config.color;
    }
    if (config.frequency) {
      document.getElementById('light-frequency').value = config.frequency;
      document.getElementById('frequency-value').textContent = config.frequency.toFixed(1);
      this.currentLightConfig.frequency = config.frequency;
    }
  }

  async exportKML() {
    try {
      document.getElementById('export-info').innerHTML = '正在导出...';
      const response = await fetch('/api/export/kml/download', {
        method: 'POST'
      });
      const result = await response.json();
      
      if (result.success) {
        document.getElementById('export-info').innerHTML = `
          KML数据已生成！<br>
          文件名: ${result.filename}<br>
          点击"下载KML文件"保存
        `;
        this.lastKMLData = result.kml;
        this.lastKMLFilename = result.filename;
      } else {
        document.getElementById('export-info').innerHTML = '导出失败: ' + (result.error || '未知错误');
      }
    } catch (error) {
      document.getElementById('export-info').innerHTML = '导出失败: ' + error.message;
    }
  }

  async downloadKML() {
    try {
      if (!this.lastKMLData) {
        await this.exportKML();
      }
      
      if (this.lastKMLData) {
        const blob = new Blob([this.lastKMLData], { type: 'application/vnd.google-earth.kml+xml' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = this.lastKMLFilename || 'drone_swarm.kml';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        document.getElementById('export-info').innerHTML = 'KML文件已下载！';
      }
    } catch (error) {
      document.getElementById('export-info').innerHTML = '下载失败: ' + error.message;
    }
  }

  updateBatteryStats(dronesData) {
    const panel = document.getElementById('battery-stats');
    
    if (dronesData.length === 0) {
      panel.innerHTML = '<div style="color: #888;">暂无电池数据</div>';
      return;
    }

    const avgBattery = dronesData.reduce((sum, d) => sum + (d.battery || 0), 0) / dronesData.length;
    const avgVoltage = dronesData.reduce((sum, d) => sum + (d.batteryVoltage || 0), 0) / dronesData.length;
    const avgCurrent = dronesData.reduce((sum, d) => sum + (d.batteryCurrent || 0), 0) / dronesData.length;
    const avgFlightTime = dronesData.reduce((sum, d) => sum + (d.estimatedFlightTime || 0), 0) / dronesData.length;
    const lowBatteryCount = dronesData.filter(d => (d.battery || 0) < 20).length;
    const criticalBatteryCount = dronesData.filter(d => (d.battery || 0) < 10).length;

    panel.innerHTML = `
      <div class="stat-item">
        <span class="stat-label">平均电量</span>
        <span class="stat-value" style="color: ${avgBattery > 50 ? '#4caf50' : avgBattery > 20 ? '#ff9800' : '#f44336'};">${avgBattery.toFixed(1)}%</span>
      </div>
      <div class="stat-item">
        <span class="stat-label">平均电压</span>
        <span class="stat-value">${avgVoltage.toFixed(2)}V</span>
      </div>
      <div class="stat-item">
        <span class="stat-label">平均电流</span>
        <span class="stat-value">${avgCurrent.toFixed(2)}A</span>
      </div>
      <div class="stat-item">
        <span class="stat-label">预估飞行时间</span>
        <span class="stat-value">${avgFlightTime.toFixed(1)}分钟</span>
      </div>
      <div class="stat-item">
        <span class="stat-label">低电量警告</span>
        <span class="stat-value" style="color: #ff9800;">${lowBatteryCount}架</span>
      </div>
      <div class="stat-item">
        <span class="stat-label">严重低电量</span>
        <span class="stat-value" style="color: #f44336;">${criticalBatteryCount}架</span>
      </div>
    `;
  }

  updateStats(dronesData) {
    const statsPanel = document.getElementById('drone-stats');
    
    if (dronesData.length === 0) {
      statsPanel.innerHTML = '<div style="color: #888;">暂无无人机数据</div>';
      return;
    }

    const avgBattery = dronesData.reduce((sum, d) => sum + (d.battery || 0), 0) / dronesData.length;
    const flyingCount = dronesData.filter(d => d.status === 'flying').length;
    const pausedCount = dronesData.filter(d => d.status === 'paused').length;
    const idleCount = dronesData.filter(d => d.status === 'idle').length;
    const onlineCount = dronesData.filter(d => d.isOnline).length;
    const offlineCount = dronesData.length - onlineCount;

    statsPanel.innerHTML = `
      <div class="stat-item">
        <span class="stat-label">无人机总数</span>
        <span class="stat-value">${dronesData.length}</span>
      </div>
      <div class="stat-item">
        <span class="stat-label">在线</span>
        <span class="stat-value" style="color: #4caf50;">${onlineCount}</span>
      </div>
      <div class="stat-item">
        <span class="stat-label">离线</span>
        <span class="stat-value" style="color: #f44336;">${offlineCount}</span>
      </div>
      <div class="stat-item">
        <span class="stat-label">飞行中</span>
        <span class="stat-value" style="color: #4fc3f7;">${flyingCount}</span>
      </div>
      <div class="stat-item">
        <span class="stat-label">已暂停</span>
        <span class="stat-value" style="color: #ff9800;">${pausedCount}</span>
      </div>
      <div class="stat-item">
        <span class="stat-label">待机中</span>
        <span class="stat-value" style="color: #90caf9;">${idleCount}</span>
      </div>
      <div class="stat-item">
        <span class="stat-label">平均电量</span>
        <span class="stat-value" style="color: ${avgBattery > 50 ? '#4caf50' : avgBattery > 20 ? '#ff9800' : '#f44336'};">${avgBattery.toFixed(1)}%</span>
      </div>
    `;
  }
}

export default UIController;
