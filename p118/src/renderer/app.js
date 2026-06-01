class DashcamApp {
  constructor() {
    this.videoPath = null;
    this.currentVideoId = null;
    this.events = [];
    this.currentEvent = null;
    this.detections = new Map();
    this.settings = {};
    this.isMuted = false;
    this.isSimulation = false;
    this.alertTimeout = null;
    
    this.initElements();
    this.initEventListeners();
    this.initIPCListeners();
    this.loadSettings();
    this.loadEvents();
  }

  initElements() {
    this.video = document.getElementById('videoPlayer');
    this.canvas = document.getElementById('detectionCanvas');
    this.ctx = this.canvas.getContext('2d');
    
    this.alertOverlay = document.getElementById('alertOverlay');
    this.alertBadge = document.getElementById('alertBadge');
    this.alertText = document.getElementById('alertText');
    this.alertDistance = document.getElementById('alertDistance');
    
    this.processingOverlay = document.getElementById('processingOverlay');
    this.progressFill = document.getElementById('progressFill');
    this.progressText = document.getElementById('progressText');
    
    this.currentTimeEl = document.getElementById('currentTime');
    this.vehicleCountEl = document.getElementById('vehicleCount');
    this.minDistanceEl = document.getElementById('minDistance');
    this.riskLevelEl = document.getElementById('riskLevel');
    this.durationLabel = document.getElementById('durationLabel');
    this.simulationLabel = document.getElementById('simulationLabel');
    this.muteIcon = document.getElementById('muteIcon');
    this.nightModeLabel = document.getElementById('nightModeLabel');
    this.distanceSourceEl = document.getElementById('distanceSource');
    
    this.timeline = document.getElementById('timeline');
    this.timelineTrack = document.getElementById('timelineTrack');
    this.timelineMarker = document.getElementById('timelineMarker');
    
    this.eventsList = document.getElementById('eventsList');
    this.emergencyList = document.getElementById('emergencyList');
    this.gpsList = document.getElementById('gpsList');
    this.uploadList = document.getElementById('uploadList');
    
    this.emergencyStatusEl = document.getElementById('emergencyStatus');
    this.emergencyBufferEl = document.getElementById('emergencyBuffer');
    this.emergencyDurationEl = document.getElementById('emergencyDuration');
    this.gpsStatusEl = document.getElementById('gpsStatus');
    this.uploadStatusEl = document.getElementById('uploadStatus');
    this.uploadQueueSizeEl = document.getElementById('uploadQueueSize');
    
    this.settingsModal = document.getElementById('settingsModal');
    this.eventDetailModal = document.getElementById('eventDetailModal');
    
    this.distanceChart = document.getElementById('distanceChart');
    this.chartCtx = this.distanceChart.getContext('2d');
    
    this.filterRiskLevel = document.getElementById('filterRiskLevel');
    this.filterMaxDistance = document.getElementById('filterMaxDistance');
    
    this.currentLaneLines = [];
    this.currentVanishingPoint = null;
    this.currentFrameData = null;
    
    this.emergencyRecords = [];
    this.gpsTracks = [];
    this.uploadTasks = [];
  }

  initEventListeners() {
    document.getElementById('btnSelectVideo').addEventListener('click', () => this.selectVideo());
    document.getElementById('btnSettings').addEventListener('click', () => this.openSettings());
    document.getElementById('btnAlarmTest').addEventListener('click', () => this.testAlarm());
    document.getElementById('btnAlarmMute').addEventListener('click', () => this.toggleMute());
    document.getElementById('btnStopProcessing').addEventListener('click', () => this.stopProcessing());
    document.getElementById('btnEmergency').addEventListener('click', () => this.triggerEmergency());
    
    document.getElementById('btnRefreshEvents').addEventListener('click', () => this.loadEvents());
    document.getElementById('btnExportEvents').addEventListener('click', () => this.exportEvents());
    
    document.getElementById('closeSettings').addEventListener('click', () => this.closeSettings());
    document.getElementById('btnCancelSettings').addEventListener('click', () => this.closeSettings());
    document.getElementById('btnSaveSettings').addEventListener('click', () => this.saveSettings());
    
    document.getElementById('closeEventDetail').addEventListener('click', () => this.closeEventDetail());
    document.getElementById('btnJumpToEvent').addEventListener('click', () => this.jumpToCurrentEvent());
    document.getElementById('btnDeleteEvent').addEventListener('click', () => this.deleteCurrentEvent());
    
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', (e) => this.switchTab(e.target.dataset.tab));
    });
    
    this.video.addEventListener('loadedmetadata', () => this.onVideoLoaded());
    this.video.addEventListener('timeupdate', () => this.onTimeUpdate());
    this.video.addEventListener('play', () => this.onVideoPlay());
    this.video.addEventListener('pause', () => this.onVideoPause());
    
    this.timeline.addEventListener('click', (e) => this.onTimelineClick(e));
    
    this.filterRiskLevel.addEventListener('change', () => this.loadEvents());
    this.filterMaxDistance.addEventListener('input', () => this.loadEvents());
    
    this.settingsModal.addEventListener('click', (e) => {
      if (e.target === this.settingsModal) this.closeSettings();
    });
    
    this.eventDetailModal.addEventListener('click', (e) => {
      if (e.target === this.eventDetailModal) this.closeEventDetail();
    });
  }

  initIPCListeners() {
    if (window.electronAPI) {
      window.electronAPI.video.onFrameProcessed((data) => this.onFrameProcessed(data));
      window.electronAPI.video.onDetectionAlert((alert) => this.onDetectionAlert(alert));
      window.electronAPI.video.onProcessingComplete((result) => this.onProcessingComplete(result));
      
      window.electronAPI.emergency.onTriggered((data) => this.onEmergencyTriggered(data));
      window.electronAPI.emergency.onSaved((record) => this.onEmergencySaved(record));
      window.electronAPI.emergency.onError((error) => this.onEmergencyError(error));
      
      window.electronAPI.upload.onQueued((task) => this.onUploadQueued(task));
      window.electronAPI.upload.onStarted((task) => this.onUploadStarted(task));
      window.electronAPI.upload.onProgress((data) => this.onUploadProgress(data));
      window.electronAPI.upload.onCompleted((task) => this.onUploadCompleted(task));
      window.electronAPI.upload.onFailed((task) => this.onUploadFailed(task));
      
      window.electronAPI.gps.onRecordingStarted((track) => this.onGPSRecordingStarted(track));
      window.electronAPI.gps.onRecordingStopped((track) => this.onGPSRecordingStopped(track));
    }
  }

  async selectVideo() {
    if (!window.electronAPI) return;
    
    const videoPath = await window.electronAPI.video.select();
    if (videoPath) {
      this.videoPath = videoPath;
      this.video.src = `file://${videoPath}`;
      this.video.load();
      
      this.detections.clear();
      this.isSimulation = false;
      this.simulationLabel.classList.add('hidden');
      
      setTimeout(() => {
        this.processVideo();
      }, 500);
    }
  }

  async processVideo() {
    if (!window.electronAPI || !this.videoPath) return;
    
    this.showProcessing();
    this.isSimulation = false;
    
    try {
      const result = await window.electronAPI.video.process(this.videoPath, {});
      console.log('视频处理结果:', result);
    } catch (error) {
      console.error('视频处理失败:', error);
      this.hideProcessing();
      alert('视频处理失败: ' + error.message);
    }
  }

  async stopProcessing() {
    if (window.electronAPI) {
      await window.electronAPI.video.stop();
    }
    this.hideProcessing();
  }

  onFrameProcessed(data) {
    if (data.isSimulation) {
      this.isSimulation = true;
      this.simulationLabel.classList.remove('hidden');
    }
    
    if (data.isNight !== undefined) {
      if (data.isNight) {
        this.nightModeLabel.classList.remove('hidden');
      } else {
        this.nightModeLabel.classList.add('hidden');
      }
    }
    
    if (data.laneLines) {
      this.currentLaneLines = data.laneLines;
    }
    
    if (data.vanishingPoint) {
      this.currentVanishingPoint = data.vanishingPoint;
    }
    
    this.progressFill.style.width = data.progress + '%';
    this.progressText.textContent = data.progress + '%';
    
    this.detections.set(data.frameNumber, data.detections);
    
    if (data.frameData) {
      this.currentFrameData = data.frameData;
    }
    
    if (data.detections && data.detections.length > 0) {
      this.updateVideoControls(data.detections);
    }
  }

  onDetectionAlert(alert) {
    this.showAlert(alert.riskLevel, alert.distance, alert.timestamp);
    this.loadEvents();
  }

  onProcessingComplete(result) {
    this.hideProcessing();
    this.currentVideoId = result.videoId;
    this.isSimulation = result.isSimulation || false;
    
    if (this.isSimulation) {
      this.simulationLabel.classList.remove('hidden');
    }
    
    this.loadEvents();
    
    if (result.success) {
      console.log(`处理完成: ${result.eventCount}个事件, ${result.dangerCount}个危险, ${result.warningCount}个警告`);
    }
  }

  showAlert(level, distance, timestamp) {
    clearTimeout(this.alertTimeout);
    
    this.alertOverlay.classList.remove('hidden');
    this.alertBadge.className = 'alert-badge ' + level;
    
    if (level === 'danger') {
      this.alertText.textContent = '危险！距离过近';
    } else {
      this.alertText.textContent = '注意车距';
    }
    
    this.alertDistance.textContent = distance.toFixed(2) + 'm';
    
    this.alertTimeout = setTimeout(() => {
      this.alertOverlay.classList.add('hidden');
    }, 3000);
  }

  showProcessing() {
    this.processingOverlay.classList.remove('hidden');
    this.progressFill.style.width = '0%';
    this.progressText.textContent = '0%';
  }

  hideProcessing() {
    this.processingOverlay.classList.add('hidden');
  }

  onVideoLoaded() {
    const duration = this.video.duration;
    this.durationLabel.textContent = this.formatTime(duration);
    this.resizeCanvas();
  }

  onTimeUpdate() {
    const currentTime = this.video.currentTime;
    this.currentTimeEl.textContent = this.formatTime(currentTime);
    
    if (this.video.duration > 0) {
      const progress = (currentTime / this.video.duration) * 100;
      this.timelineMarker.style.left = progress + '%';
    }
    
    this.updateDetections();
  }

  onVideoPlay() {
    this.drawLoop();
  }

  onVideoPause() {
  }

  onTimelineClick(e) {
    const rect = this.timeline.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percentage = x / rect.width;
    if (this.video.duration > 0) {
      this.video.currentTime = percentage * this.video.duration;
    }
  }

  resizeCanvas() {
    const container = this.video.parentElement;
    this.canvas.width = container.clientWidth;
    this.canvas.height = container.clientHeight;
  }

  updateDetections() {
    const currentTime = this.video.currentTime;
    const fps = this.video.duration > 0 ? (this.detections.size / this.video.duration) : 30;
    const currentFrame = Math.floor(currentTime * fps);
    
    let detections = [];
    let minFrameDiff = Infinity;
    
    for (const [frame, dets] of this.detections.entries()) {
      const diff = Math.abs(frame - currentFrame);
      if (diff < minFrameDiff) {
        minFrameDiff = diff;
        detections = dets;
      }
    }
    
    this.updateVideoControls(detections);
    this.drawDetections(detections);
  }

  updateVideoControls(detections) {
    if (!detections || detections.length === 0) {
      this.vehicleCountEl.textContent = '0';
      this.minDistanceEl.textContent = '-';
      this.riskLevelEl.textContent = '安全';
      this.riskLevelEl.className = 'risk-badge safe';
      this.distanceSourceEl.textContent = '-';
      return;
    }
    
    this.vehicleCountEl.textContent = detections.length;
    
    let minDistance = Infinity;
    let maxRisk = 'safe';
    let mainSource = 'vehicle';
    
    for (const det of detections) {
      if (det.inLane === false) continue;
      
      if (det.distance < minDistance) {
        minDistance = det.distance;
        mainSource = det.distanceSource || 'vehicle';
      }
      if (det.riskLevel === 'danger') {
        maxRisk = 'danger';
      } else if (det.riskLevel === 'warning' && maxRisk !== 'danger') {
        maxRisk = 'warning';
      }
    }
    
    this.minDistanceEl.textContent = minDistance.toFixed(2) + 'm';
    this.riskLevelEl.textContent = maxRisk === 'safe' ? '安全' : (maxRisk === 'danger' ? '危险' : '警告');
    this.riskLevelEl.className = 'risk-badge ' + maxRisk;
    
    const sourceText = {
      'plate': '📋 车牌',
      'taillights': '🔴 尾灯',
      'vehicle': '🚗 车辆'
    }[mainSource] || '🚗 车辆';
    this.distanceSourceEl.textContent = sourceText;
  }

  drawDetections(detections) {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    
    const videoRect = this.video.getBoundingClientRect();
    const videoWidth = this.video.videoWidth || 1280;
    const videoHeight = this.video.videoHeight || 720;
    const displayWidth = this.video.clientWidth;
    const displayHeight = this.video.clientHeight;
    
    const scaleX = displayWidth / videoWidth;
    const scaleY = displayHeight / videoHeight;
    const scale = Math.min(scaleX, scaleY);
    
    const offsetX = (displayWidth - videoWidth * scale) / 2;
    const offsetY = (displayHeight - videoHeight * scale) / 2;
    
    this.drawLaneLines(offsetX, offsetY, scale);
    
    if (!detections || detections.length === 0) return;
    
    for (const vehicle of detections) {
      const x = offsetX + vehicle.x * scale;
      const y = offsetY + vehicle.y * scale;
      const w = vehicle.width * scale;
      const h = vehicle.height * scale;
      
      const inLane = vehicle.inLane !== false;
      
      let borderColor = '#4caf50';
      let bgColor = 'rgba(76, 175, 80, 0.2)';
      
      if (!inLane) {
        borderColor = '#9e9e9e';
        bgColor = 'rgba(158, 158, 158, 0.15)';
      } else if (vehicle.riskLevel === 'danger') {
        borderColor = '#ff6b6b';
        bgColor = 'rgba(255, 107, 107, 0.3)';
      } else if (vehicle.riskLevel === 'warning') {
        borderColor = '#ffc107';
        bgColor = 'rgba(255, 193, 7, 0.3)';
      }
      
      this.ctx.strokeStyle = borderColor;
      this.ctx.lineWidth = inLane ? 3 : 2;
      this.ctx.setLineDash(inLane ? [] : [5, 5]);
      this.ctx.fillStyle = bgColor;
      this.ctx.beginPath();
      this.ctx.roundRect(x, y, w, h, 8);
      this.ctx.fill();
      this.ctx.stroke();
      this.ctx.setLineDash([]);
      
      if (vehicle.taillights) {
        this.drawTaillights(vehicle.taillights, offsetX, offsetY, scale);
      }
      
      if (vehicle.plate) {
        const px = offsetX + vehicle.plate.x * scale;
        const py = offsetY + vehicle.plate.y * scale;
        const pw = vehicle.plate.width * scale;
        const ph = vehicle.plate.height * scale;
        
        this.ctx.strokeStyle = '#667eea';
        this.ctx.lineWidth = 2;
        this.ctx.strokeRect(px, py, pw, ph);
        
        this.ctx.fillStyle = 'rgba(102, 126, 234, 0.9)';
        this.ctx.fillRect(px, py - 20, pw + 20, 20);
        this.ctx.fillStyle = 'white';
        this.ctx.font = 'bold 11px sans-serif';
        this.ctx.fillText(`📋 ${vehicle.distance.toFixed(1)}m`, px + 4, py - 5);
      }
      
      const sourceIcon = vehicle.distanceSource === 'taillights' ? '🔴' : 
                         vehicle.distanceSource === 'plate' ? '📋' : '🚗';
      const label = `${sourceIcon} ${vehicle.distance.toFixed(1)}m`;
      const labelWidth = 75;
      const labelHeight = 24;
      
      this.ctx.fillStyle = borderColor;
      this.ctx.beginPath();
      this.ctx.roundRect(x, y - labelHeight - 4, labelWidth, labelHeight, 4);
      this.ctx.fill();
      
      this.ctx.fillStyle = 'white';
      this.ctx.font = 'bold 12px sans-serif';
      this.ctx.fillText(label, x + 4, y - labelHeight / 2 + 4);
      
      if (vehicle.ttc && inLane) {
        const ttcLabel = `TTC: ${vehicle.ttc.toFixed(1)}s`;
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        this.ctx.beginPath();
        this.ctx.roundRect(x, y + h + 4, this.ctx.measureText(ttcLabel).width + 16, 20, 4);
        this.ctx.fill();
        this.ctx.fillStyle = 'white';
        this.ctx.font = '11px sans-serif';
        this.ctx.fillText(ttcLabel, x + 8, y + h + 18);
      }
      
      if (!inLane) {
        this.ctx.fillStyle = 'rgba(158, 158, 158, 0.9)';
        this.ctx.fillRect(x + w - 50, y, 50, 20);
        this.ctx.fillStyle = 'white';
        this.ctx.font = '10px sans-serif';
        this.ctx.fillText('旁车道', x + w - 46, y + 14);
      }
    }
  }
  
  drawLaneLines(offsetX, offsetY, scale) {
    if (!this.currentLaneLines || this.currentLaneLines.length === 0) return;
    
    this.ctx.strokeStyle = 'rgba(100, 150, 255, 0.6)';
    this.ctx.lineWidth = 2;
    this.ctx.setLineDash([10, 5]);
    
    for (const line of this.currentLaneLines) {
      const x1 = offsetX + line.x1 * scale;
      const y1 = offsetY + line.y1 * scale;
      const x2 = offsetX + line.x2 * scale;
      const y2 = offsetY + line.y2 * scale;
      
      this.ctx.beginPath();
      this.ctx.moveTo(x1, y1);
      this.ctx.lineTo(x2, y2);
      this.ctx.stroke();
    }
    
    this.ctx.setLineDash([]);
    
    if (this.currentVanishingPoint) {
      const vx = offsetX + this.currentVanishingPoint.x * scale;
      const vy = offsetY + this.currentVanishingPoint.y * scale;
      
      this.ctx.fillStyle = 'rgba(100, 200, 255, 0.8)';
      this.ctx.beginPath();
      this.ctx.arc(vx, vy, 5, 0, Math.PI * 2);
      this.ctx.fill();
      
      this.ctx.fillStyle = 'rgba(100, 200, 255, 0.9)';
      this.ctx.font = '10px sans-serif';
      this.ctx.fillText('消失点', vx + 8, vy + 4);
    }
  }
  
  drawTaillights(taillights, offsetX, offsetY, scale) {
    this.ctx.fillStyle = 'rgba(255, 50, 50, 0.8)';
    this.ctx.strokeStyle = 'rgba(255, 100, 100, 0.9)';
    this.ctx.lineWidth = 2;
    
    if (taillights.left) {
      const lx = offsetX + taillights.left.x * scale;
      const ly = offsetY + taillights.left.y * scale;
      const lw = taillights.left.width * scale;
      const lh = taillights.left.height * scale;
      
      this.ctx.beginPath();
      this.ctx.roundRect(lx, ly, lw, lh, 3);
      this.ctx.fill();
      this.ctx.stroke();
    }
    
    if (taillights.right) {
      const rx = offsetX + taillights.right.x * scale;
      const ry = offsetY + taillights.right.y * scale;
      const rw = taillights.right.width * scale;
      const rh = taillights.right.height * scale;
      
      this.ctx.beginPath();
      this.ctx.roundRect(rx, ry, rw, rh, 3);
      this.ctx.fill();
      this.ctx.stroke();
    }
    
    if (taillights.left && taillights.right) {
      const cx1 = offsetX + (taillights.left.x + taillights.left.width / 2) * scale;
      const cy1 = offsetY + (taillights.left.y + taillights.left.height / 2) * scale;
      const cx2 = offsetX + (taillights.right.x + taillights.right.width / 2) * scale;
      const cy2 = offsetY + (taillights.right.y + taillights.right.height / 2) * scale;
      
      this.ctx.strokeStyle = 'rgba(255, 100, 100, 0.5)';
      this.ctx.lineWidth = 1;
      this.ctx.setLineDash([3, 3]);
      this.ctx.beginPath();
      this.ctx.moveTo(cx1, cy1);
      this.ctx.lineTo(cx2, cy2);
      this.ctx.stroke();
      this.ctx.setLineDash([]);
    }
  }

  drawLoop() {
    if (!this.video.paused && !this.video.ended) {
      this.updateDetections();
      requestAnimationFrame(() => this.drawLoop());
    }
  }

  async loadSettings() {
    if (!window.electronAPI) return;
    
    try {
      this.settings = await window.electronAPI.settings.get();
    } catch (e) {
      console.error('加载设置失败:', e);
    }
  }

  openSettings() {
    document.getElementById('settingDistanceThreshold').value = this.getSettingValue('distance_threshold', 3.0);
    document.getElementById('settingDangerThreshold').value = this.getSettingValue('danger_threshold', 1.5);
    document.getElementById('settingPlateWidth').value = this.getSettingValue('plate_real_width', 0.4);
    document.getElementById('settingFocalLength').value = this.getSettingValue('focal_length', 800);
    document.getElementById('settingConfidence').value = this.getSettingValue('confidence_threshold', 0.7);
    document.getElementById('settingFrameSkip').value = this.getSettingValue('frame_skip', 2);
    document.getElementById('settingMinWidth').value = this.getSettingValue('min_vehicle_width', 50);
    document.getElementById('settingAlarmEnabled').checked = this.getSettingValue('alarm_enabled', true);
    document.getElementById('settingNightModeEnabled').checked = this.getSettingValue('night_mode_enabled', true);
    document.getElementById('settingNightThreshold').value = this.getSettingValue('night_brightness_threshold', 60);
    document.getElementById('settingTaillightEnabled').checked = this.getSettingValue('taillight_distance_enabled', true);
    document.getElementById('settingLaneFilterEnabled').checked = this.getSettingValue('lane_filter_enabled', true);
    document.getElementById('settingLaneTolerance').value = this.getSettingValue('lane_center_tolerance', 0.25);
    document.getElementById('settingKalmanEnabled').checked = this.getSettingValue('kalman_filter_enabled', true);
    document.getElementById('settingSmoothingWindow').value = this.getSettingValue('distance_smoothing_window', 5);
    document.getElementById('settingPreSeconds').value = this.getSettingValue('emergency_pre_seconds', 15);
    document.getElementById('settingPostSeconds').value = this.getSettingValue('emergency_post_seconds', 10);
    document.getElementById('settingEmergencyCollision').checked = this.getSettingValue('emergency_trigger_on_collision', true);
    document.getElementById('settingAutoUpload').checked = this.getSettingValue('auto_upload_enabled', false);
    document.getElementById('settingUploadUrl').value = this.getSettingValue('upload_server_url', 'https://api.example.com/upload');
    document.getElementById('settingUploadRetries').value = this.getSettingValue('upload_max_retries', 3);
    document.getElementById('settingGPSEnabled').checked = this.getSettingValue('gps_enabled', true);
    
    this.settingsModal.classList.remove('hidden');
  }

  closeSettings() {
    this.settingsModal.classList.add('hidden');
  }

  async saveSettings() {
    if (!window.electronAPI) return;
    
    const newSettings = {
      distance_threshold: parseFloat(document.getElementById('settingDistanceThreshold').value),
      danger_threshold: parseFloat(document.getElementById('settingDangerThreshold').value),
      plate_real_width: parseFloat(document.getElementById('settingPlateWidth').value),
      focal_length: parseFloat(document.getElementById('settingFocalLength').value),
      confidence_threshold: parseFloat(document.getElementById('settingConfidence').value),
      frame_skip: parseInt(document.getElementById('settingFrameSkip').value),
      min_vehicle_width: parseInt(document.getElementById('settingMinWidth').value),
      alarm_enabled: document.getElementById('settingAlarmEnabled').checked,
      night_mode_enabled: document.getElementById('settingNightModeEnabled').checked,
      night_brightness_threshold: parseInt(document.getElementById('settingNightThreshold').value),
      taillight_distance_enabled: document.getElementById('settingTaillightEnabled').checked,
      lane_filter_enabled: document.getElementById('settingLaneFilterEnabled').checked,
      lane_center_tolerance: parseFloat(document.getElementById('settingLaneTolerance').value),
      kalman_filter_enabled: document.getElementById('settingKalmanEnabled').checked,
      distance_smoothing_window: parseInt(document.getElementById('settingSmoothingWindow').value),
      emergency_pre_seconds: parseInt(document.getElementById('settingPreSeconds').value),
      emergency_post_seconds: parseInt(document.getElementById('settingPostSeconds').value),
      emergency_trigger_on_collision: document.getElementById('settingEmergencyCollision').checked,
      auto_upload_enabled: document.getElementById('settingAutoUpload').checked,
      upload_server_url: document.getElementById('settingUploadUrl').value,
      upload_max_retries: parseInt(document.getElementById('settingUploadRetries').value),
      gps_enabled: document.getElementById('settingGPSEnabled').checked
    };
    
    try {
      this.settings = await window.electronAPI.settings.update(newSettings);
      this.closeSettings();
    } catch (e) {
      console.error('保存设置失败:', e);
      alert('保存设置失败: ' + e.message);
    }
  }

  getSettingValue(key, defaultValue) {
    if (this.settings[key]) {
      return this.settings[key].value;
    }
    return defaultValue;
  }

  async loadEvents() {
    if (!window.electronAPI) return;
    
    const filters = {};
    if (this.filterRiskLevel.value) {
      filters.riskLevel = this.filterRiskLevel.value;
    }
    if (this.filterMaxDistance.value) {
      filters.maxDistance = parseFloat(this.filterMaxDistance.value);
    }
    
    try {
      this.events = await window.electronAPI.events.getAll(filters);
      this.renderEvents();
      this.updateStats();
      this.renderTimelineEvents();
      this.renderDistanceChart();
    } catch (e) {
      console.error('加载事件失败:', e);
    }
  }

  renderEvents() {
    if (this.events.length === 0) {
      this.eventsList.innerHTML = `
        <div class="empty-state">
          <p>暂无事件数据</p>
          <p class="hint">选择并处理视频后，事件将显示在这里</p>
        </div>
      `;
      return;
    }
    
    const html = this.events.map(event => `
      <div class="event-item ${event.risk_level}" data-id="${event.id}">
        <div class="event-header">
          <span class="event-time">${this.formatTime(event.timestamp)}</span>
          <span class="event-risk ${event.risk_level}">
            ${event.risk_level === 'danger' ? '危险' : '警告'}
          </span>
        </div>
        <div class="event-details">
          <div class="event-detail-item">
            <span>距离:</span>
            <span>${event.distance.toFixed(2)}m</span>
          </div>
          <div class="event-detail-item">
            <span>帧号:</span>
            <span>${event.frame_number}</span>
          </div>
          ${event.ttc ? `
          <div class="event-detail-item">
            <span>TTC:</span>
            <span>${event.ttc.toFixed(1)}s</span>
          </div>
          ` : ''}
          <div class="event-detail-item">
            <span>视频:</span>
            <span>${event.video_name || '-'}</span>
          </div>
        </div>
      </div>
    `).join('');
    
    this.eventsList.innerHTML = html;
    
    this.eventsList.querySelectorAll('.event-item').forEach(item => {
      item.addEventListener('click', () => {
        const id = parseInt(item.dataset.id);
        this.showEventDetail(id);
      });
    });
  }

  renderTimelineEvents() {
    const oldEvents = this.timeline.querySelectorAll('.timeline-event');
    oldEvents.forEach(e => e.remove());
    
    if (!this.video.duration || this.events.length === 0) return;
    
    const currentVideoEvents = this.currentVideoId 
      ? this.events.filter(e => e.video_id === this.currentVideoId)
      : this.events;
    
    for (const event of currentVideoEvents) {
      if (event.timestamp !== undefined && this.video.duration > 0) {
        const percentage = (event.timestamp / this.video.duration) * 100;
        const el = document.createElement('div');
        el.className = `timeline-event ${event.risk_level}`;
        el.style.left = percentage + '%';
        el.title = `${this.formatTime(event.timestamp)} - ${event.distance.toFixed(2)}m`;
        el.addEventListener('click', (e) => {
          e.stopPropagation();
          this.video.currentTime = event.timestamp;
        });
        this.timeline.appendChild(el);
      }
    }
  }

  showEventDetail(id) {
    this.currentEvent = this.events.find(e => e.id === id);
    if (!this.currentEvent) return;
    
    const event = this.currentEvent;
    const body = document.getElementById('eventDetailBody');
    
    body.innerHTML = `
      <div class="event-detail-section">
        <h4>基本信息</h4>
        <div class="event-detail-grid">
          <div class="event-detail-row">
            <span class="label">事件ID:</span>
            <span class="value">#${event.id}</span>
          </div>
          <div class="event-detail-row">
            <span class="label">风险等级:</span>
            <span class="value ${event.risk_level}">${event.risk_level === 'danger' ? '危险' : '警告'}</span>
          </div>
          <div class="event-detail-row">
            <span class="label">时间点:</span>
            <span class="value">${this.formatTime(event.timestamp)}</span>
          </div>
          <div class="event-detail-row">
            <span class="label">帧号:</span>
            <span class="value">${event.frame_number}</span>
          </div>
          <div class="event-detail-row">
            <span class="label">距离:</span>
            <span class="value ${event.risk_level}">${event.distance.toFixed(2)}m</span>
          </div>
          ${event.ttc ? `
          <div class="event-detail-row">
            <span class="label">碰撞时间 (TTC):</span>
            <span class="value">${event.ttc.toFixed(1)}s</span>
          </div>
          ` : ''}
        </div>
      </div>
      
      <div class="event-detail-section">
        <h4>检测信息</h4>
        <div class="event-detail-grid">
          <div class="event-detail-row">
            <span class="label">车辆位置:</span>
            <span class="value">(${event.vehicle_x}, ${event.vehicle_y})</span>
          </div>
          <div class="event-detail-row">
            <span class="label">车辆尺寸:</span>
            <span class="value">${event.vehicle_width} × ${event.vehicle_height}px</span>
          </div>
          ${event.plate_width ? `
          <div class="event-detail-row">
            <span class="label">车牌位置:</span>
            <span class="value">(${event.plate_x}, ${event.plate_y})</span>
          </div>
          <div class="event-detail-row">
            <span class="label">车牌尺寸:</span>
            <span class="value">${event.plate_width} × ${event.plate_height}px</span>
          </div>
          ` : ''}
        </div>
      </div>
      
      ${event.notes ? `
      <div class="event-detail-section">
        <h4>备注</h4>
        <p style="color: #eaeaea; font-size: 13px;">${event.notes}</p>
      </div>
      ` : ''}
      
      <div class="event-detail-section">
        <h4>视频信息</h4>
        <div class="event-detail-grid">
          <div class="event-detail-row">
            <span class="label">视频ID:</span>
            <span class="value">#${event.video_id}</span>
          </div>
          <div class="event-detail-row">
            <span class="label">视频名称:</span>
            <span class="value">${event.video_name || '-'}</span>
          </div>
        </div>
      </div>
    `;
    
    this.eventDetailModal.classList.remove('hidden');
  }

  closeEventDetail() {
    this.eventDetailModal.classList.add('hidden');
    this.currentEvent = null;
  }

  jumpToCurrentEvent() {
    if (!this.currentEvent) return;
    
    if (this.currentEvent.video_path && this.videoPath !== this.currentEvent.video_path) {
      this.videoPath = this.currentEvent.video_path;
      this.video.src = `file://${this.currentEvent.video_path}`;
      this.video.load();
    }
    
    this.video.currentTime = this.currentEvent.timestamp;
    this.closeEventDetail();
  }

  async deleteCurrentEvent() {
    if (!this.currentEvent || !window.electronAPI) return;
    
    if (confirm('确定要删除这个事件吗？')) {
      try {
        await window.electronAPI.events.delete(this.currentEvent.id);
        this.closeEventDetail();
        this.loadEvents();
      } catch (e) {
        console.error('删除事件失败:', e);
        alert('删除失败: ' + e.message);
      }
    }
  }

  async exportEvents() {
    if (!window.electronAPI) return;
    
    const defaultPath = `events-export-${Date.now()}.json`;
    const outputPath = prompt('请输入导出文件路径:', defaultPath);
    
    if (outputPath) {
      try {
        await window.electronAPI.events.export(outputPath);
        alert('导出成功！');
      } catch (e) {
        console.error('导出失败:', e);
        alert('导出失败: ' + e.message);
      }
    }
  }

  updateStats() {
    const dangerCount = this.events.filter(e => e.risk_level === 'danger').length;
    const warningCount = this.events.filter(e => e.risk_level === 'warning').length;
    const videoIds = new Set(this.events.map(e => e.video_id).filter(Boolean));
    
    document.getElementById('statVideos').textContent = videoIds.size;
    document.getElementById('statTotalEvents').textContent = this.events.length;
    document.getElementById('statDanger').textContent = dangerCount;
    document.getElementById('statWarning').textContent = warningCount;
  }

  renderDistanceChart() {
    const ctx = this.chartCtx;
    const width = this.distanceChart.width;
    const height = this.distanceChart.height;
    
    ctx.clearRect(0, 0, width, height);
    
    if (this.events.length < 2) return;
    
    const sortedEvents = [...this.events].sort((a, b) => a.timestamp - b.timestamp);
    const distances = sortedEvents.map(e => e.distance);
    const maxDist = Math.max(...distances, 10);
    const padding = 30;
    const chartWidth = width - padding * 2;
    const chartHeight = height - padding * 2;
    
    ctx.strokeStyle = '#2a2a4a';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = padding + (chartHeight / 4) * i;
      ctx.beginPath();
      ctx.moveTo(padding, y);
      ctx.lineTo(width - padding, y);
      ctx.stroke();
      
      ctx.fillStyle = '#5a5a7a';
      ctx.font = '10px sans-serif';
      ctx.textAlign = 'right';
      const value = ((4 - i) / 4 * maxDist).toFixed(0);
      ctx.fillText(value + 'm', padding - 5, y + 3);
    }
    
    ctx.strokeStyle = '#667eea';
    ctx.lineWidth = 2;
    ctx.beginPath();
    
    sortedEvents.forEach((event, i) => {
      const x = padding + (i / (sortedEvents.length - 1)) * chartWidth;
      const y = padding + chartHeight - (event.distance / maxDist) * chartHeight;
      
      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });
    ctx.stroke();
    
    ctx.lineWidth = 1;
    for (let i = 0; i < sortedEvents.length; i++) {
      const event = sortedEvents[i];
      const x = padding + (i / (sortedEvents.length - 1)) * chartWidth;
      const y = padding + chartHeight - (event.distance / maxDist) * chartHeight;
      
      ctx.fillStyle = event.risk_level === 'danger' ? '#ff6b6b' : '#ffc107';
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.fill();
      
      ctx.strokeStyle = '#1a1a2e';
      ctx.stroke();
    }
  }

  switchTab(tab) {
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === tab);
    });
    
    document.querySelectorAll('.tab-content').forEach(content => {
      content.classList.toggle('active', content.id === `tab-${tab}`);
    });
    
    if (tab === 'stats') {
      this.renderDistanceChart();
    } else if (tab === 'emergency') {
      this.loadEmergencyRecords();
    } else if (tab === 'gps') {
      this.loadGPSTracks();
    } else if (tab === 'upload') {
      this.loadUploadTasks();
    }
  }

  async triggerEmergency() {
    if (!window.electronAPI) return;
    
    try {
      const result = await window.electronAPI.emergency.trigger('manual');
      if (result) {
        this.showNotification('紧急录像已触发', `原因: ${result.reason}`);
      }
    } catch (e) {
      console.error('触发紧急录像失败:', e);
    }
  }

  onEmergencyTriggered(data) {
    console.log('紧急录像触发:', data);
    this.emergencyStatusEl.textContent = '录制中';
    this.emergencyStatusEl.className = 'status-badge recording';
    this.showNotification('紧急录像', `触发原因: ${data.reason}`);
  }

  onEmergencySaved(record) {
    console.log('紧急录像已保存:', record);
    this.emergencyStatusEl.textContent = '已保存';
    this.emergencyStatusEl.className = 'status-badge saved';
    this.loadEmergencyRecords();
    this.showNotification('紧急录像已保存', `时长: ${record.totalDuration?.toFixed(1) || 0}秒`);
  }

  onEmergencyError(error) {
    console.error('紧急录像错误:', error);
    this.emergencyStatusEl.textContent = '错误';
    this.emergencyStatusEl.className = 'status-badge error';
  }

  async loadEmergencyRecords() {
    if (!window.electronAPI) return;
    
    try {
      this.emergencyRecords = await window.electronAPI.emergency.getRecords({ limit: 20 });
      this.renderEmergencyList();
    } catch (e) {
      console.error('加载紧急录像记录失败:', e);
    }
  }

  renderEmergencyList() {
    if (!this.emergencyRecords || this.emergencyRecords.length === 0) {
      this.emergencyList.innerHTML = `
        <div class="empty-state">
          <p>暂无紧急录像</p>
          <p class="hint">碰撞或手动触发时，自动保存紧急录像</p>
        </div>
      `;
      return;
    }
    
    const html = this.emergencyRecords.map(record => `
      <div class="emergency-item" data-id="${record.id}">
        <div class="emergency-header">
          <span class="emergency-reason ${record.reason}">${this.getEmergencyReasonText(record.reason)}</span>
          <span class="emergency-time">${new Date(record.created_at).toLocaleString()}</span>
        </div>
        <div class="emergency-details">
          <div class="emergency-detail-item">
            <span>时长:</span>
            <span>${record.total_duration?.toFixed(1) || 0}秒</span>
          </div>
          <div class="emergency-detail-item">
            <span>前置:</span>
            <span>${record.pre_duration?.toFixed(1) || 0}秒</span>
          </div>
          <div class="emergency-detail-item">
            <span>后置:</span>
            <span>${record.post_duration?.toFixed(1) || 0}秒</span>
          </div>
        </div>
        <div class="emergency-actions">
          <button class="btn btn-small" onclick="window.app.playEmergency(${record.id})">播放</button>
          <button class="btn btn-small btn-danger" onclick="window.app.deleteEmergency(${record.id})">删除</button>
        </div>
      </div>
    `).join('');
    
    this.emergencyList.innerHTML = html;
  }

  getEmergencyReasonText(reason) {
    const reasons = {
      'manual': '手动触发',
      'collision': '碰撞事件',
      'nearmiss': '接近事件'
    };
    return reasons[reason] || reason;
  }

  async playEmergency(id) {
    if (!window.electronAPI) return;
    
    try {
      const record = await window.electronAPI.emergency.getById(id);
      if (record && record.output_path) {
        this.videoPath = record.output_path;
        this.video.src = `file://${record.output_path}`;
        this.video.load();
        this.video.play();
      }
    } catch (e) {
      console.error('播放紧急录像失败:', e);
    }
  }

  async deleteEmergency(id) {
    if (!window.electronAPI || !confirm('确定要删除这个紧急录像吗？')) return;
    
    try {
      await window.electronAPI.emergency.delete(id);
      this.loadEmergencyRecords();
    } catch (e) {
      console.error('删除紧急录像失败:', e);
    }
  }

  onUploadQueued(task) {
    console.log('上传任务已入队:', task);
    this.loadUploadTasks();
  }

  onUploadStarted(task) {
    console.log('上传开始:', task);
    this.updateUploadTask(task);
  }

  onUploadProgress(data) {
    console.log('上传进度:', data);
    const taskEl = document.querySelector(`[data-upload-id="${data.id}"] .upload-progress`);
    if (taskEl) {
      taskEl.style.width = data.progress + '%';
    }
  }

  onUploadCompleted(task) {
    console.log('上传完成:', task);
    this.loadUploadTasks();
    this.showNotification('上传完成', '紧急录像已成功上传');
  }

  onUploadFailed(task) {
    console.error('上传失败:', task);
    this.loadUploadTasks();
    this.showNotification('上传失败', task.error || '未知错误');
  }

  async loadUploadTasks() {
    if (!window.electronAPI) return;
    
    try {
      this.uploadTasks = await window.electronAPI.upload.getHistory({ limit: 20 });
      this.renderUploadList();
      this.updateUploadStatus();
    } catch (e) {
      console.error('加载上传任务失败:', e);
    }
  }

  renderUploadList() {
    if (!this.uploadTasks || this.uploadTasks.length === 0) {
      this.uploadList.innerHTML = `
        <div class="empty-state">
          <p>暂无上传任务</p>
          <p class="hint">紧急录像保存后可上传到服务器</p>
        </div>
      `;
      return;
    }
    
    const html = this.uploadTasks.map(task => `
      <div class="upload-item" data-upload-id="${task.upload_id}">
        <div class="upload-header">
          <span class="upload-reason">${this.getEmergencyReasonText(task.reason)}</span>
          <span class="upload-status ${task.status}">${this.getUploadStatusText(task.status)}</span>
        </div>
        <div class="upload-progress-bar">
          <div class="upload-progress" style="width: ${task.progress || 0}%"></div>
        </div>
        <div class="upload-actions">
          <span class="upload-time">${new Date(task.created_at).toLocaleString()}</span>
          ${task.status === 'failed' ? `<button class="btn btn-small" onclick="window.app.retryUpload('${task.upload_id}')">重试</button>` : ''}
          ${task.status === 'pending' || task.status === 'uploading' ? `<button class="btn btn-small btn-danger" onclick="window.app.cancelUpload('${task.upload_id}')">取消</button>` : ''}
        </div>
      </div>
    `).join('');
    
    this.uploadList.innerHTML = html;
  }

  getUploadStatusText(status) {
    const statuses = {
      'pending': '等待中',
      'uploading': '上传中',
      'completed': '已完成',
      'failed': '失败',
      'cancelled': '已取消'
    };
    return statuses[status] || status;
  }

  updateUploadTask(task) {
    const taskEl = document.querySelector(`[data-upload-id="${task.id}"]`);
    if (taskEl) {
      const statusEl = taskEl.querySelector('.upload-status');
      statusEl.textContent = this.getUploadStatusText(task.status);
      statusEl.className = `upload-status ${task.status}`;
    }
  }

  async updateUploadStatus() {
    if (!window.electronAPI) return;
    
    try {
      const status = await window.electronAPI.upload.getStatus();
      this.uploadStatusEl.textContent = status.autoUploadEnabled ? '已开启' : '已关闭';
      this.uploadStatusEl.className = 'status-badge ' + (status.autoUploadEnabled ? 'active' : '');
      this.uploadQueueSizeEl.textContent = status.pendingCount || 0;
    } catch (e) {
      console.error('获取上传状态失败:', e);
    }
  }

  async retryUpload(uploadId) {
    if (!window.electronAPI) return;
    
    try {
      await window.electronAPI.upload.retry(uploadId);
      this.loadUploadTasks();
    } catch (e) {
      console.error('重试上传失败:', e);
    }
  }

  async cancelUpload(uploadId) {
    if (!window.electronAPI) return;
    
    try {
      await window.electronAPI.upload.cancel(uploadId);
      this.loadUploadTasks();
    } catch (e) {
      console.error('取消上传失败:', e);
    }
  }

  onGPSRecordingStarted(track) {
    console.log('GPS记录开始:', track);
    this.gpsStatusEl.textContent = '录制中';
    this.gpsStatusEl.className = 'status-badge recording';
  }

  onGPSRecordingStopped(track) {
    console.log('GPS记录停止:', track);
    this.gpsStatusEl.textContent = '已停止';
    this.gpsStatusEl.className = 'status-badge';
    this.loadGPSTracks();
  }

  async loadGPSTracks() {
    if (!window.electronAPI) return;
    
    try {
      this.gpsTracks = await window.electronAPI.gps.getTracks({ limit: 20 });
      this.renderGPSList();
    } catch (e) {
      console.error('加载GPS轨迹失败:', e);
    }
  }

  renderGPSList() {
    if (!this.gpsTracks || this.gpsTracks.length === 0) {
      this.gpsList.innerHTML = `
        <div class="empty-state">
          <p>暂无GPS轨迹</p>
          <p class="hint">视频处理时自动记录GPS轨迹</p>
        </div>
      `;
      return;
    }
    
    const html = this.gpsTracks.map(track => `
      <div class="gps-item" data-id="${track.id}">
        <div class="gps-header">
          <span class="gps-id">轨迹 #${track.id}</span>
          <span class="gps-time">${new Date(track.created_at).toLocaleString()}</span>
        </div>
        <div class="gps-details">
          <div class="gps-detail-item">
            <span>点数:</span>
            <span>${track.point_count || 0}</span>
          </div>
          <div class="gps-detail-item">
            <span>距离:</span>
            <span>${(track.total_distance || 0).toFixed(2)}km</span>
          </div>
          <div class="gps-detail-item">
            <span>平均速度:</span>
            <span>${(track.avg_speed || 0).toFixed(1)}km/h</span>
          </div>
        </div>
        <div class="gps-actions">
          <button class="btn btn-small" onclick="window.app.exportGPX('${track.track_id}')">导出GPX</button>
          <button class="btn btn-small" onclick="window.app.exportKML('${track.track_id}')">导出KML</button>
          <button class="btn btn-small" onclick="window.app.exportJSON('${track.track_id}')">导出JSON</button>
        </div>
      </div>
    `).join('');
    
    this.gpsList.innerHTML = html;
  }

  async exportGPX(trackId) {
    if (!window.electronAPI) return;
    
    try {
      const result = await window.electronAPI.gps.exportGPX(trackId);
      if (result) {
        this.showNotification('导出成功', `GPX文件已保存: ${result}`);
      }
    } catch (e) {
      console.error('导出GPX失败:', e);
    }
  }

  async exportKML(trackId) {
    if (!window.electronAPI) return;
    
    try {
      const result = await window.electronAPI.gps.exportKML(trackId);
      if (result) {
        this.showNotification('导出成功', `KML文件已保存: ${result}`);
      }
    } catch (e) {
      console.error('导出KML失败:', e);
    }
  }

  async exportJSON(trackId) {
    if (!window.electronAPI) return;
    
    try {
      const result = await window.electronAPI.gps.exportJSON(trackId);
      if (result) {
        this.showNotification('导出成功', `JSON文件已保存: ${result}`);
      }
    } catch (e) {
      console.error('导出JSON失败:', e);
    }
  }

  showNotification(title, message) {
    if (window.Notification && Notification.permission === 'granted') {
      new Notification(title, { body: message });
    } else if (window.Notification && Notification.permission !== 'denied') {
      Notification.requestPermission().then(permission => {
        if (permission === 'granted') {
          new Notification(title, { body: message });
        }
      });
    }
  }

  async testAlarm() {
    if (window.electronAPI) {
      await window.electronAPI.alarm.test();
    }
  }

  async toggleMute() {
    this.isMuted = !this.isMuted;
    this.muteIcon.textContent = this.isMuted ? '🔇' : '🔊';
    
    if (window.electronAPI) {
      await window.electronAPI.alarm.mute(this.isMuted);
    }
  }

  formatTime(seconds) {
    if (isNaN(seconds) || !isFinite(seconds)) return '--:--';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
}

window.addEventListener('resize', () => {
  if (window.app) {
    window.app.resizeCanvas();
  }
});

document.addEventListener('DOMContentLoaded', () => {
  window.app = new DashcamApp();
});
