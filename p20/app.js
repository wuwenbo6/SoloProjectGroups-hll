class FFBController {
  constructor() {
    this.device = null;
    this.connected = false;
    this.logs = [];
    this.currentAngle = 0;
    this.rawAngle = 0;
    this.centerOffset = 0;
    this.deadzone = 2;
    this.ffbConfig = {
      friction: { enabled: true, intensity: 50 },
      damper: { enabled: true, intensity: 30 },
      spring: { enabled: true, intensity: 70 },
      gain: 100,
      customEffectIntensity: 50
    };
    this.curveType = 'linear';
    this.curvePoints = [];
    this.activeEffects = new Map();
    this.effectIdCounter = 1;
    
    this.pendingFFBReport = null;
    this.ffbSendQueue = [];
    this.isSendingFFB = false;
    this.lastInputTime = 0;
    this.lastFFBSendTime = 0;
    this.frameCount = 0;
    this.lastFpsUpdate = 0;
    this.currentFps = 0;
    
    this.autoCalibrateSamples = [];
    this.isAutoCalibrating = false;
    
    this.customEffectInterval = null;
    this.configs = {};
    
    this.telemetryData = [];
    this.isRecordingTelemetry = false;
    this.telemetryStartTime = 0;
    
    this.init();
  }

  init() {
    this.bindElements();
    this.bindEvents();
    this.initCurveCanvas();
    this.loadConfigsFromStorage();
    this.updateConfigSelect();
    this.updateTelemetryDisplay();
    this.log('系统初始化完成', 'info');
    this.checkWebHIDSupport();
  }

  bindElements() {
    this.connectBtn = document.getElementById('connectBtn');
    this.deviceStatus = document.getElementById('deviceStatus');
    this.deviceInfo = document.getElementById('deviceInfo');
    this.wheelVisual = document.getElementById('wheelVisual');
    this.angleValue = document.getElementById('angleValue');
    this.rawAngleValue = document.getElementById('rawAngleValue');
    this.centerOffset = document.getElementById('centerOffset');
    
    this.calibrateCenterBtn = document.getElementById('calibrateCenter');
    this.autoCalibrateBtn = document.getElementById('autoCalibrate');
    this.resetCalibrationBtn = document.getElementById('resetCalibration');
    this.deadzoneSlider = document.getElementById('deadzoneSlider');
    this.deadzoneValue = document.getElementById('deadzoneValue');
    
    this.inputLatencyDisplay = document.getElementById('inputLatency');
    this.ffbLatencyDisplay = document.getElementById('ffbLatency');
    this.frameRateDisplay = document.getElementById('frameRate');
    
    this.frictionSlider = document.getElementById('frictionSlider');
    this.frictionValue = document.getElementById('frictionValue');
    this.frictionEnabled = document.getElementById('frictionEnabled');
    
    this.damperSlider = document.getElementById('damperSlider');
    this.damperValue = document.getElementById('damperValue');
    this.damperEnabled = document.getElementById('damperEnabled');
    
    this.springSlider = document.getElementById('springSlider');
    this.springValue = document.getElementById('springValue');
    this.springEnabled = document.getElementById('springEnabled');
    
    this.gainSlider = document.getElementById('gainSlider');
    this.gainValue = document.getElementById('gainValue');
    
    this.curveCanvas = document.getElementById('curveCanvas');
    this.curveCtx = this.curveCanvas.getContext('2d');
    
    this.customEffectSlider = document.getElementById('customEffectSlider');
    this.customEffectValue = document.getElementById('customEffectValue');
    
    this.configSelect = document.getElementById('configSelect');
    this.configNameInput = document.getElementById('configName');
    
    this.telemetryStatus = document.getElementById('telemetryStatus');
    this.telemetryCount = document.getElementById('telemetryCount');
    this.telemetrySize = document.getElementById('telemetrySize');
    
    this.logContainer = document.getElementById('logContainer');
  }

  bindEvents() {
    this.connectBtn.addEventListener('click', () => this.connectDevice());
    
    this.calibrateCenterBtn.addEventListener('click', () => this.calibrateCenter());
    this.autoCalibrateBtn.addEventListener('click', () => this.startAutoCalibrate());
    this.resetCalibrationBtn.addEventListener('click', () => this.resetCalibration());
    this.deadzoneSlider.addEventListener('input', (e) => {
      this.deadzone = parseInt(e.target.value);
      this.deadzoneValue.textContent = e.target.value + '%';
    });
    
    this.frictionSlider.addEventListener('input', (e) => {
      this.ffbConfig.friction.intensity = parseInt(e.target.value);
      this.frictionValue.textContent = e.target.value + '%';
      this.scheduleFFBUpdate();
    });
    this.frictionEnabled.addEventListener('change', (e) => {
      this.ffbConfig.friction.enabled = e.target.checked;
      this.log(`摩擦力效果: ${e.target.checked ? '启用' : '禁用'}`, 'info');
      this.scheduleFFBUpdate();
    });
    
    this.damperSlider.addEventListener('input', (e) => {
      this.ffbConfig.damper.intensity = parseInt(e.target.value);
      this.damperValue.textContent = e.target.value + '%';
      this.scheduleFFBUpdate();
    });
    this.damperEnabled.addEventListener('change', (e) => {
      this.ffbConfig.damper.enabled = e.target.checked;
      this.log(`阻尼力效果: ${e.target.checked ? '启用' : '禁用'}`, 'info');
      this.scheduleFFBUpdate();
    });
    
    this.springSlider.addEventListener('input', (e) => {
      this.ffbConfig.spring.intensity = parseInt(e.target.value);
      this.springValue.textContent = e.target.value + '%';
      this.scheduleFFBUpdate();
    });
    this.springEnabled.addEventListener('change', (e) => {
      this.ffbConfig.spring.enabled = e.target.checked;
      this.log(`弹簧力效果: ${e.target.checked ? '启用' : '禁用'}`, 'info');
      this.scheduleFFBUpdate();
    });
    
    this.gainSlider.addEventListener('input', (e) => {
      this.ffbConfig.gain = parseInt(e.target.value);
      this.gainValue.textContent = e.target.value + '%';
      this.scheduleFFBUpdate();
    });

    document.getElementById('curveLinear').addEventListener('change', () => this.setCurveType('linear'));
    document.getElementById('curveExponential').addEventListener('change', () => this.setCurveType('exponential'));
    document.getElementById('curveLogarithmic').addEventListener('change', () => this.setCurveType('logarithmic'));
    document.getElementById('curveS').addEventListener('change', () => this.setCurveType('s'));
    document.getElementById('resetCurve').addEventListener('click', () => this.resetCurve());

    document.getElementById('testLeft').addEventListener('click', () => this.testForce('left'));
    document.getElementById('testRight').addEventListener('click', () => this.testForce('right'));
    document.getElementById('testCenter').addEventListener('click', () => this.testForce('center'));
    document.getElementById('testVibrate').addEventListener('click', () => this.testForce('vibrate'));
    document.getElementById('testStop').addEventListener('click', () => this.stopAllEffects());
    document.getElementById('testAutoCenter').addEventListener('click', () => this.toggleAutoCenter());

    const manualForceSlider = document.getElementById('manualForceSlider');
    const manualForceValue = document.getElementById('manualForceValue');
    manualForceSlider.addEventListener('input', (e) => {
      manualForceValue.textContent = e.target.value;
    });
    document.getElementById('applyManualForce').addEventListener('click', () => {
      this.applyManualForce(parseInt(manualForceSlider.value));
    });
    document.getElementById('releaseManualForce').addEventListener('click', () => {
      this.releaseManualForce();
    });

    document.getElementById('clearLog').addEventListener('click', () => this.clearLog());
    document.getElementById('saveLog').addEventListener('click', () => this.saveLog());

    this.curveCanvas.addEventListener('click', (e) => this.handleCurveClick(e));

    this.customEffectSlider.addEventListener('input', (e) => {
      this.ffbConfig.customEffectIntensity = parseInt(e.target.value);
      this.customEffectValue.textContent = e.target.value + '%';
    });

    document.getElementById('effectRoadNoise').addEventListener('click', () => this.playEffect('roadNoise'));
    document.getElementById('effectCollision').addEventListener('click', () => this.playEffect('collision'));
    document.getElementById('effectGravel').addEventListener('click', () => this.playEffect('gravel'));
    document.getElementById('effectKerb').addEventListener('click', () => this.playEffect('kerb'));

    document.getElementById('newConfig').addEventListener('click', () => this.newConfig());
    document.getElementById('saveConfig').addEventListener('click', () => this.saveConfig());
    document.getElementById('deleteConfig').addEventListener('click', () => this.deleteConfig());
    this.configSelect.addEventListener('change', (e) => this.loadConfig(e.target.value));

    document.getElementById('startTelemetry').addEventListener('click', () => this.startTelemetry());
    document.getElementById('stopTelemetry').addEventListener('click', () => this.stopTelemetry());
    document.getElementById('exportTelemetry').addEventListener('click', () => this.exportTelemetry());
  }

  checkWebHIDSupport() {
    if (!navigator.hid) {
      this.log('WebHID 不受支持，请使用支持 WebHID 的浏览器', 'error');
      this.connectBtn.disabled = true;
    } else {
      this.log('WebHID 支持检测通过', 'success');
      navigator.hid.addEventListener('disconnect', (e) => this.handleDisconnect(e));
    }
  }

  async connectDevice() {
    try {
      this.log('正在搜索设备...', 'info');
      
      const devices = await navigator.hid.requestDevice({
        filters: [
          { vendorId: 0x046D, productId: 0xC24F },
          { vendorId: 0x046D, productId: 0xC24E },
          { vendorId: 0x046D, productId: 0xC262 },
          { usagePage: 0x01, usage: 0x04 }
        ]
      });

      if (devices.length === 0) {
        this.log('未选择任何设备', 'warning');
        return;
      }

      this.device = devices[0];
      
      if (!this.device.opened) {
        await this.device.open();
      }

      this.device.addEventListener('inputreport', (e) => this.handleInputReport(e));

      this.connected = true;
      this.updateDeviceStatus();
      this.log(`已连接: ${this.device.productName}`, 'success');
      this.log(`厂商ID: 0x${this.device.vendorId.toString(16).toUpperCase()}, 产品ID: 0x${this.device.productId.toString(16).toUpperCase()}`, 'info');
      
      this.initFFB();
      
    } catch (error) {
      this.log(`连接失败: ${error.message}`, 'error');
      console.error(error);
    }
  }

  handleDisconnect(e) {
    if (e.device === this.device) {
      this.connected = false;
      this.updateDeviceStatus();
      this.log('设备已断开连接', 'warning');
      this.device = null;
    }
  }

  updateDeviceStatus() {
    if (this.connected) {
      this.deviceStatus.className = 'status connected';
      this.deviceStatus.innerHTML = '<span class="status-dot"></span> 已连接';
      this.connectBtn.textContent = '断开连接';
      this.connectBtn.onclick = () => this.disconnectDevice();
      this.deviceInfo.textContent = this.device.productName;
    } else {
      this.deviceStatus.className = 'status disconnected';
      this.deviceStatus.innerHTML = '<span class="status-dot"></span> 未连接';
      this.connectBtn.textContent = '连接设备';
      this.connectBtn.onclick = () => this.connectDevice();
      this.deviceInfo.textContent = '点击"连接设备"按钮选择方向盘';
    }
  }

  async disconnectDevice() {
    if (this.device && this.device.opened) {
      await this.device.close();
    }
    this.connected = false;
    this.device = null;
    this.updateDeviceStatus();
    this.log('设备已断开', 'info');
  }

  handleInputReport(e) {
    const now = performance.now();
    if (this.lastInputTime > 0) {
      const latency = now - this.lastInputTime;
      this.inputLatencyDisplay.textContent = latency.toFixed(1);
    }
    this.lastInputTime = now;
    
    const data = new DataView(e.data.buffer);
    
    if (data.byteLength >= 4) {
      const wheelValue = data.getUint16(0, true);
      this.rawAngle = ((wheelValue / 65535) * 900) - 450;
      
      let calibratedAngle = this.rawAngle - this.centerOffset;
      
      const deadzoneRange = (this.deadzone / 100) * 450;
      if (Math.abs(calibratedAngle) < deadzoneRange) {
        calibratedAngle = 0;
      } else {
        const sign = Math.sign(calibratedAngle);
        calibratedAngle = sign * ((Math.abs(calibratedAngle) - deadzoneRange) / (450 - deadzoneRange) * 450);
      }
      
      this.currentAngle = calibratedAngle;
      
      if (this.isAutoCalibrating) {
        this.autoCalibrateSamples.push(this.rawAngle);
      }
      
      if (this.isRecordingTelemetry) {
        this.recordTelemetryPoint();
      }
      
      this.updateWheelVisual();
      this.updateRawAngleDisplay();
    }
  }

  updateWheelVisual() {
    const normalizedAngle = Math.max(-450, Math.min(450, this.currentAngle));
    this.wheelVisual.style.transform = `rotate(${normalizedAngle}deg)`;
    this.angleValue.textContent = Math.round(normalizedAngle);
  }

  updateRawAngleDisplay() {
    this.rawAngleValue.textContent = this.rawAngle.toFixed(1);
    this.centerOffset.textContent = this.centerOffset.toFixed(1);
  }

  calibrateCenter() {
    if (!this.connected) {
      this.log('请先连接设备', 'warning');
      return;
    }
    this.centerOffset = this.rawAngle;
    this.log(`中心校准完成，中心偏移: ${this.centerOffset.toFixed(2)}°`, 'success');
  }

  startAutoCalibrate() {
    if (!this.connected) {
      this.log('请先连接设备', 'warning');
      return;
    }
    if (this.isAutoCalibrating) {
      this.log('自动校准进行中...', 'warning');
      return;
    }
    
    this.isAutoCalibrating = true;
    this.autoCalibrateSamples = [];
    this.log('自动校准开始，请保持方向盘在中心位置3秒...', 'info');
    this.autoCalibrateBtn.disabled = true;
    this.autoCalibrateBtn.textContent = '校准中...';
    
    setTimeout(() => {
      this.finishAutoCalibrate();
    }, 3000);
  }

  finishAutoCalibrate() {
    this.isAutoCalibrating = false;
    this.autoCalibrateBtn.disabled = false;
    this.autoCalibrateBtn.textContent = '自动校准';
    
    if (this.autoCalibrateSamples.length > 0) {
      const sum = this.autoCalibrateSamples.reduce((a, b) => a + b, 0);
      this.centerOffset = sum / this.autoCalibrateSamples.length;
      this.log(`自动校准完成，采样数: ${this.autoCalibrateSamples.length}, 中心偏移: ${this.centerOffset.toFixed(2)}°`, 'success');
    } else {
      this.log('自动校准失败，未采集到足够样本', 'error');
    }
    
    this.autoCalibrateSamples = [];
  }

  resetCalibration() {
    this.centerOffset = 0;
    this.log('校准已重置', 'info');
  }

  initFFB() {
    this.log('初始化力反馈系统...', 'info');
    this.startPerformanceMonitor();
    this.updateFFBEffectsFast();
    this.log('力反馈系统就绪', 'success');
  }

  scheduleFFBUpdate() {
    if (!this.pendingFFBReport) {
      this.pendingFFBReport = requestAnimationFrame(() => {
        this.updateFFBEffectsFast();
        this.pendingFFBReport = null;
      });
    }
  }

  updateFFBEffectsFast() {
    if (!this.connected || !this.device) return;

    const sendStartTime = performance.now();
    
    if (this.ffbConfig.spring.enabled) {
      this.sendSpringEffectFast();
    }
    if (this.ffbConfig.damper.enabled) {
      this.sendDamperEffectFast();
    }
    if (this.ffbConfig.friction.enabled) {
      this.sendFrictionEffectFast();
    }
    
    const latency = performance.now() - sendStartTime;
    this.lastFFBSendTime = sendStartTime;
    this.ffbLatencyDisplay.textContent = latency.toFixed(1);
  }

  startPerformanceMonitor() {
    const monitorLoop = () => {
      this.frameCount++;
      const now = performance.now();
      
      if (now - this.lastFpsUpdate >= 1000) {
        this.currentFps = this.frameCount * 1000 / (now - this.lastFpsUpdate);
        this.frameRateDisplay.textContent = this.currentFps.toFixed(0);
        this.frameCount = 0;
        this.lastFpsUpdate = now;
      }
      
      requestAnimationFrame(monitorLoop);
    };
    
    this.lastFpsUpdate = performance.now();
    monitorLoop();
  }

  sendSpringEffectFast() {
    if (!this.connected || !this.device) return;
    
    const intensity = Math.round((this.ffbConfig.spring.intensity / 100) * (this.ffbConfig.gain / 100) * 0x7FFF);
    
    const effectData = new Uint8Array([
      0x01,
      this.effectIdCounter++ & 0xFF,
      0x02,
      0x00,
      intensity & 0xFF,
      (intensity >> 8) & 0xFF,
      0x00, 0x00,
      0xFF, 0xFF,
      0x00, 0x00
    ]);

    this.device.sendReport(0x00, effectData).catch(() => {});
  }

  sendDamperEffectFast() {
    if (!this.connected || !this.device) return;
    
    const intensity = Math.round((this.ffbConfig.damper.intensity / 100) * (this.ffbConfig.gain / 100) * 0x7FFF);
    
    const effectData = new Uint8Array([
      0x02,
      this.effectIdCounter++ & 0xFF,
      0x00,
      intensity & 0xFF,
      (intensity >> 8) & 0xFF,
      0x00, 0x00, 0x00, 0x00
    ]);

    this.device.sendReport(0x00, effectData).catch(() => {});
  }

  sendFrictionEffectFast() {
    if (!this.connected || !this.device) return;
    
    const intensity = Math.round((this.ffbConfig.friction.intensity / 100) * (this.ffbConfig.gain / 100) * 0x7FFF);
    
    const effectData = new Uint8Array([
      0x03,
      this.effectIdCounter++ & 0xFF,
      0x00,
      intensity & 0xFF,
      (intensity >> 8) & 0xFF,
      0x00, 0x00, 0x00, 0x00
    ]);

    this.device.sendReport(0x00, effectData).catch(() => {});
  }

  async sendSpringEffect() {
    this.sendSpringEffectFast();
  }

  async sendDamperEffect() {
    this.sendDamperEffectFast();
  }

  async sendFrictionEffect() {
    this.sendFrictionEffectFast();
  }

  async testForce(type) {
    if (!this.connected) {
      this.log('请先连接设备', 'warning');
      return;
    }

    this.log(`执行测试: ${type}`, 'info');

    switch (type) {
      case 'left':
        await this.sendConstantForce(-50);
        break;
      case 'right':
        await this.sendConstantForce(50);
        break;
      case 'center':
        await this.sendConstantForce(0);
        break;
      case 'vibrate':
        await this.sendVibration();
        break;
    }
  }

  sendConstantForceFast(percentage) {
    if (!this.connected || !this.device) return;

    const scaledForce = this.applyCurve(percentage);
    const force = Math.round((scaledForce / 100) * (this.ffbConfig.gain / 100) * 0x7FFF);
    
    const effectData = new Uint8Array([
      0x11,
      this.effectIdCounter++ & 0xFF,
      0x00,
      force & 0xFF,
      (force >> 8) & 0xFF,
      0x00, 0x00,
      0xFF, 0xFF,
      0x00, 0x00
    ]);

    this.device.sendReport(0x00, effectData).catch(() => {});
    return scaledForce;
  }

  async sendConstantForce(percentage) {
    const scaledForce = this.sendConstantForceFast(percentage);
    if (scaledForce !== undefined) {
      this.log(`恒力输出: ${percentage}% (曲线调整后: ${scaledForce.toFixed(1)}%)`, 'success');
    }
  }

  sendVibrationFast() {
    if (!this.connected || !this.device) return;

    const effectData = new Uint8Array([
      0x04,
      this.effectIdCounter++ & 0xFF,
      0x00,
      0xFF, 0x7F,
      0xFF, 0x7F,
      0xFF, 0xFF,
      0x00, 0x00
    ]);

    this.device.sendReport(0x00, effectData).catch(() => {});
  }

  async sendVibration() {
    this.sendVibrationFast();
    this.log('震动效果已发送', 'success');
    
    setTimeout(() => {
      this.stopAllEffectsFast();
    }, 1000);
  }

  stopAllEffectsFast() {
    if (!this.connected || !this.device) return;

    const stopData = new Uint8Array([0x00, 0x00, 0x00, 0x00]);
    this.device.sendReport(0x00, stopData).catch(() => {});
    this.activeEffects.clear();
  }

  async stopAllEffects() {
    this.stopAllEffectsFast();
    this.log('所有效果已停止', 'info');
  }

  async toggleAutoCenter() {
    if (!this.connected) {
      this.log('请先连接设备', 'warning');
      return;
    }
    
    this.ffbConfig.spring.enabled = !this.ffbConfig.spring.enabled;
    this.springEnabled.checked = this.ffbConfig.spring.enabled;
    this.log(`自动回中: ${this.ffbConfig.spring.enabled ? '启用' : '禁用'}`, 'info');
    this.scheduleFFBUpdate();
  }

  async applyManualForce(value) {
    if (!this.connected) {
      this.log('请先连接设备', 'warning');
      return;
    }
    
    this.log(`应用手动力: ${value}%`, 'info');
    this.sendConstantForceFast(value);
  }

  async releaseManualForce() {
    if (!this.connected) {
      this.log('请先连接设备', 'warning');
      return;
    }
    
    this.sendConstantForceFast(0);
    this.log('手动力已释放', 'info');
  }

  initCurveCanvas() {
    this.resizeCurveCanvas();
    window.addEventListener('resize', () => this.resizeCurveCanvas());
    this.generateCurvePoints();
    this.drawCurve();
  }

  resizeCurveCanvas() {
    const rect = this.curveCanvas.getBoundingClientRect();
    this.curveCanvas.width = rect.width * window.devicePixelRatio;
    this.curveCanvas.height = rect.height * window.devicePixelRatio;
    this.curveCtx.scale(window.devicePixelRatio, window.devicePixelRatio);
    this.drawCurve();
  }

  setCurveType(type) {
    this.curveType = type;
    
    document.getElementById('curveLinear').checked = type === 'linear';
    document.getElementById('curveExponential').checked = type === 'exponential';
    document.getElementById('curveLogarithmic').checked = type === 'logarithmic';
    document.getElementById('curveS').checked = type === 's';
    
    this.log(`响应曲线类型: ${type}`, 'info');
    this.generateCurvePoints();
    this.drawCurve();
  }

  generateCurvePoints() {
    const points = [];
    const step = 0.05;
    
    for (let x = 0; x <= 1; x += step) {
      let y = x;
      
      switch (this.curveType) {
        case 'exponential':
          y = Math.pow(x, 2);
          break;
        case 'logarithmic':
          y = Math.log(x * (Math.E - 1) + 1);
          break;
        case 's':
          y = 1 / (1 + Math.exp(-10 * (x - 0.5)));
          break;
        case 'linear':
        default:
          y = x;
          break;
      }
      
      points.push({ x, y });
    }
    
    this.curvePoints = points;
  }

  applyCurve(input) {
    const normalizedInput = Math.abs(input) / 100;
    let output;
    
    switch (this.curveType) {
      case 'exponential':
        output = Math.pow(normalizedInput, 2);
        break;
      case 'logarithmic':
        output = Math.log(normalizedInput * (Math.E - 1) + 1);
        break;
      case 's':
        output = 1 / (1 + Math.exp(-10 * (normalizedInput - 0.5)));
        break;
      case 'linear':
      default:
        output = normalizedInput;
        break;
    }
    
    return Math.sign(input) * output * 100;
  }

  resetCurve() {
    this.setCurveType('linear');
    this.log('曲线已重置为线性', 'info');
  }

  drawCurve() {
    const ctx = this.curveCtx;
    const width = this.curveCanvas.width / window.devicePixelRatio;
    const height = this.curveCanvas.height / window.devicePixelRatio;
    const padding = 20;
    
    ctx.clearRect(0, 0, width, height);
    
    ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
    ctx.fillRect(0, 0, width, height);
    
    ctx.strokeStyle = 'rgba(0, 212, 255, 0.1)';
    ctx.lineWidth = 1;
    
    for (let i = 0; i <= 10; i++) {
      const x = padding + (i / 10) * (width - 2 * padding);
      ctx.beginPath();
      ctx.moveTo(x, padding);
      ctx.lineTo(x, height - padding);
      ctx.stroke();
      
      const y = height - padding - (i / 10) * (height - 2 * padding);
      ctx.beginPath();
      ctx.moveTo(padding, y);
      ctx.lineTo(width - padding, y);
      ctx.stroke();
    }
    
    ctx.strokeStyle = 'rgba(0, 212, 255, 0.5)';
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(padding, height - padding);
    ctx.lineTo(width - padding, padding);
    ctx.stroke();
    ctx.setLineDash([]);
    
    if (this.curvePoints.length > 0) {
      ctx.strokeStyle = '#00d4ff';
      ctx.lineWidth = 3;
      ctx.beginPath();
      
      this.curvePoints.forEach((point, i) => {
        const x = padding + point.x * (width - 2 * padding);
        const y = height - padding - point.y * (height - 2 * padding);
        
        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      });
      
      ctx.stroke();
      
      ctx.fillStyle = '#00d4ff';
      this.curvePoints.forEach((point) => {
        const x = padding + point.x * (width - 2 * padding);
        const y = height - padding - point.y * (height - 2 * padding);
        ctx.beginPath();
        ctx.arc(x, y, 4, 0, Math.PI * 2);
        ctx.fill();
      });
    }
    
    ctx.fillStyle = '#888';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('输入', width / 2, height - 5);
    
    ctx.save();
    ctx.translate(10, height / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText('输出', 0, 0);
    ctx.restore();
  }

  handleCurveClick(e) {
    const rect = this.curveCanvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    this.log(`曲线点击位置: (${x.toFixed(0)}, ${y.toFixed(0)})`, 'info');
  }

  log(message, type = 'info') {
    const timestamp = new Date().toLocaleTimeString('zh-CN', { 
      hour12: false, 
      hour: '2-digit', 
      minute: '2-digit', 
      second: '2-digit' 
    });
    
    this.logs.push({ timestamp, message, type });
    
    const logEntry = document.createElement('div');
    logEntry.className = 'log-entry';
    logEntry.innerHTML = `
      <span class="log-time">[${timestamp}]</span>
      <span class="log-${type}">${message}</span>
    `;
    
    this.logContainer.appendChild(logEntry);
    this.logContainer.scrollTop = this.logContainer.scrollHeight;
  }

  clearLog() {
    this.logs = [];
    this.logContainer.innerHTML = '';
    this.log('日志已清空', 'info');
  }

  saveLog() {
    if (this.logs.length === 0) {
      this.log('没有日志可保存', 'warning');
      return;
    }
    
    const logContent = this.logs.map(log => 
      `[${log.timestamp}] ${log.type.toUpperCase()}: ${log.message}`
    ).join('\n');
    
    const blob = new Blob([logContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ffb-log-${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    
    this.log('日志已保存', 'success');
  }

  playEffect(effectType) {
    if (!this.connected) {
      this.log('请先连接设备', 'warning');
      return;
    }

    this.stopCustomEffect();
    
    const intensity = this.ffbConfig.customEffectIntensity;
    
    switch (effectType) {
      case 'roadNoise':
        this.playRoadNoise(intensity);
        break;
      case 'collision':
        this.playCollision(intensity);
        break;
      case 'gravel':
        this.playGravel(intensity);
        break;
      case 'kerb':
        this.playKerb(intensity);
        break;
    }
  }

  playRoadNoise(intensity) {
    this.log('开始路噪效果', 'info');
    const force = Math.round((intensity / 100) * 0x1FFF);
    
    this.customEffectInterval = setInterval(() => {
      const randomForce = force * (0.5 + Math.random());
      const direction = Math.random() > 0.5 ? 1 : -1;
      this.sendConstantForceFast(direction * (randomForce / 32767 * 100));
    }, 50);
    
    setTimeout(() => this.stopCustomEffect(), 3000);
  }

  playCollision(intensity) {
    this.log('开始撞墙效果', 'info');
    const force = Math.round((intensity / 100) * 0x7FFF);
    
    this.sendConstantForceFast((force / 32767 * 100));
    
    setTimeout(() => {
      this.sendConstantForceFast(-(force / 32767 * 50));
    }, 100);
    
    setTimeout(() => {
      this.sendConstantForceFast((force / 32767 * 25));
    }, 200);
    
    setTimeout(() => this.stopCustomEffect(), 500);
  }

  playGravel(intensity) {
    this.log('开始砂石路效果', 'info');
    const force = Math.round((intensity / 100) * 0x3FFF);
    
    this.customEffectInterval = setInterval(() => {
      const randomForce = force * (0.3 + Math.random() * 0.7);
      const direction = Math.random() > 0.5 ? 1 : -1;
      this.sendConstantForceFast(direction * (randomForce / 32767 * 100));
    }, 20);
    
    setTimeout(() => this.stopCustomEffect(), 3000);
  }

  playKerb(intensity) {
    this.log('开始路肩振动效果', 'info');
    const force = Math.round((intensity / 100) * 0x3FFF);
    let count = 0;
    
    this.customEffectInterval = setInterval(() => {
      const direction = count % 2 === 0 ? 1 : -1;
      this.sendConstantForceFast(direction * (force / 32767 * 100));
      count++;
    }, 30);
    
    setTimeout(() => this.stopCustomEffect(), 1500);
  }

  stopCustomEffect() {
    if (this.customEffectInterval) {
      clearInterval(this.customEffectInterval);
      this.customEffectInterval = null;
    }
    this.sendConstantForceFast(0);
  }

  loadConfigsFromStorage() {
    try {
      const saved = localStorage.getItem('ffb-configs');
      if (saved) {
        this.configs = JSON.parse(saved);
      }
    } catch (e) {
      this.log('加载配置失败', 'error');
    }
  }

  saveConfigsToStorage() {
    try {
      localStorage.setItem('ffb-configs', JSON.stringify(this.configs));
    } catch (e) {
      this.log('保存配置失败', 'error');
    }
  }

  updateConfigSelect() {
    this.configSelect.innerHTML = '<option value="">选择配置...</option>';
    
    Object.keys(this.configs).sort().forEach(name => {
      const option = document.createElement('option');
      option.value = name;
      option.textContent = name;
      this.configSelect.appendChild(option);
    });
  }

  newConfig() {
    const name = this.configNameInput.value.trim();
    if (!name) {
      this.log('请输入配置名称', 'warning');
      return;
    }
    
    this.saveCurrentConfig(name);
    this.log(`已创建配置: ${name}`, 'success');
  }

  saveConfig() {
    const name = this.configNameInput.value.trim();
    if (!name) {
      this.log('请输入配置名称', 'warning');
      return;
    }
    
    this.saveCurrentConfig(name);
    this.log(`已保存配置: ${name}`, 'success');
  }

  saveCurrentConfig(name) {
    this.configs[name] = {
      ffbConfig: JSON.parse(JSON.stringify(this.ffbConfig)),
      curveType: this.curveType,
      deadzone: this.deadzone,
      centerOffset: this.centerOffset,
      savedAt: new Date().toISOString()
    };
    this.saveConfigsToStorage();
    this.updateConfigSelect();
  }

  loadConfig(name) {
    if (!name || !this.configs[name]) return;
    
    const config = this.configs[name];
    this.ffbConfig = JSON.parse(JSON.stringify(config.ffbConfig));
    this.curveType = config.curveType;
    this.deadzone = config.deadzone || 2;
    this.centerOffset = config.centerOffset || 0;
    
    this.frictionSlider.value = this.ffbConfig.friction.intensity;
    this.frictionValue.textContent = this.ffbConfig.friction.intensity + '%';
    this.frictionEnabled.checked = this.ffbConfig.friction.enabled;
    
    this.damperSlider.value = this.ffbConfig.damper.intensity;
    this.damperValue.textContent = this.ffbConfig.damper.intensity + '%';
    this.damperEnabled.checked = this.ffbConfig.damper.enabled;
    
    this.springSlider.value = this.ffbConfig.spring.intensity;
    this.springValue.textContent = this.ffbConfig.spring.intensity + '%';
    this.springEnabled.checked = this.ffbConfig.spring.enabled;
    
    this.gainSlider.value = this.ffbConfig.gain;
    this.gainValue.textContent = this.ffbConfig.gain + '%';
    
    this.deadzoneSlider.value = this.deadzone;
    this.deadzoneValue.textContent = this.deadzone + '%';
    
    this.customEffectSlider.value = this.ffbConfig.customEffectIntensity || 50;
    this.customEffectValue.textContent = (this.ffbConfig.customEffectIntensity || 50) + '%';
    
    document.getElementById('curveLinear').checked = this.curveType === 'linear';
    document.getElementById('curveExponential').checked = this.curveType === 'exponential';
    document.getElementById('curveLogarithmic').checked = this.curveType === 'logarithmic';
    document.getElementById('curveS').checked = this.curveType === 's';
    
    this.generateCurvePoints();
    this.drawCurve();
    this.scheduleFFBUpdate();
    
    this.log(`已加载配置: ${name}`, 'success');
  }

  deleteConfig() {
    const name = this.configSelect.value;
    if (!name) {
      this.log('请选择要删除的配置', 'warning');
      return;
    }
    
    if (confirm(`确定要删除配置 "${name}" 吗？`)) {
      delete this.configs[name];
      this.saveConfigsToStorage();
      this.updateConfigSelect();
      this.log(`已删除配置: ${name}`, 'info');
    }
  }

  startTelemetry() {
    if (this.isRecordingTelemetry) {
      this.log('遥测正在记录中', 'warning');
      return;
    }
    
    this.telemetryData = [];
    this.isRecordingTelemetry = true;
    this.telemetryStartTime = Date.now();
    
    this.telemetryStatus.textContent = '记录中';
    this.telemetryStatus.style.color = '#4ecdc4';
    
    this.log('开始遥测记录', 'success');
  }

  stopTelemetry() {
    if (!this.isRecordingTelemetry) return;
    
    this.isRecordingTelemetry = false;
    
    this.telemetryStatus.textContent = '已停止';
    this.telemetryStatus.style.color = '#ffd93d';
    
    this.updateTelemetryDisplay();
    this.log(`停止遥测记录，共 ${this.telemetryData.length} 条数据`, 'success');
  }

  recordTelemetryPoint() {
    const now = Date.now();
    const point = {
      timestamp: now - this.telemetryStartTime,
      rawAngle: this.rawAngle,
      calibratedAngle: this.currentAngle,
      centerOffset: this.centerOffset,
      friction: this.ffbConfig.friction.enabled ? this.ffbConfig.friction.intensity : 0,
      damper: this.ffbConfig.damper.enabled ? this.ffbConfig.damper.intensity : 0,
      spring: this.ffbConfig.spring.enabled ? this.ffbConfig.spring.intensity : 0,
      gain: this.ffbConfig.gain
    };
    
    this.telemetryData.push(point);
    
    if (this.telemetryData.length % 100 === 0) {
      this.updateTelemetryDisplay();
    }
  }

  updateTelemetryDisplay() {
    this.telemetryCount.textContent = this.telemetryData.length;
    const sizeKB = (JSON.stringify(this.telemetryData).length / 1024).toFixed(1);
    this.telemetrySize.textContent = sizeKB + ' KB';
  }

  exportTelemetry() {
    if (this.telemetryData.length === 0) {
      this.log('没有遥测数据可导出', 'warning');
      return;
    }
    
    const headers = ['timestamp_ms', 'raw_angle', 'calibrated_angle', 'center_offset', 
                     'friction', 'damper', 'spring', 'gain'];
    
    const csvContent = [
      headers.join(','),
      ...this.telemetryData.map(row => [
        row.timestamp,
        row.rawAngle.toFixed(2),
        row.calibratedAngle.toFixed(2),
        row.centerOffset.toFixed(2),
        row.friction,
        row.damper,
        row.spring,
        row.gain
      ].join(','))
    ].join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `telemetry-${new Date().toISOString().replace(/[:.]/g, '-')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    
    this.log(`遥测数据已导出 (${this.telemetryData.length} 条)`, 'success');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  window.ffbController = new FFBController();
});
