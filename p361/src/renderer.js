class MotorControllerApp {
  constructor() {
    this.hidComm = new HIDComm();
    this.pulseGenerator = new PulseGenerator(200);
    this.pidController = PIDController.createPositionController();
    this.encoderParser = new EncoderParser(2000);
    this.interpolator = new MotionInterpolator(200, 360);

    this.positionChart = null;
    this.outputChart = null;
    this.trajectoryCanvas = null;
    this.trajectoryCtx = null;

    this.positionData = {
      time: [],
      target: [],
      actual: [],
      error: []
    };
    this.outputData = {
      time: [],
      pid: [],
      velocity: []
    };
    this.maxDataPoints = 200;

    this.controlLoopInterval = null;
    this.controlLoopRunning = false;
    this.isSimulating = false;
    this.simulatedPosition = 0;

    this.elements = {};

    this.STORAGE_KEY_PID = 'stepperMotor_pidParams';
    this.STORAGE_KEY_MOTION = 'stepperMotor_motionParams';

    this.init();
  }

  init() {
    this.cacheElements();
    this.loadSavedParams();
    this.initCharts();
    this.bindEvents();
    this.setupCallbacks();
    this.updateUI();
    this.addLog('系统初始化完成', 'info');

    if (!navigator.hid) {
      this.addLog('WebHID API 不可用，将使用模拟模式', 'warning');
      this.enableSimulationMode();
    }
  }

  cacheElements() {
    const ids = [
      'connectBtn', 'disconnectBtn',
      'targetPosition', 'currentPosition', 'positionError',
      'moveBtn', 'stopBtn', 'homeBtn',
      'maxSpeed', 'acceleration', 'stepsPerRev', 'encoderPPR',
      'kp', 'ki', 'kd', 'deadband', 'kv', 'ka',
      'applyPIDBtn', 'autoTuneBtn',
      'pidOutputBar', 'pidOutputValue',
      'encoderVelocity', 'pulseCount', 'motorStatus', 'controlMode',
      'connectionIndicator', 'connectionText',
      'deviceName', 'deviceId',
      'showTarget', 'showActual', 'showError',
      'clearChartBtn', 'clearLogBtn',
      'logContainer',
      'interpType', 'targetX', 'targetY',
      'centerX', 'centerY', 'arcDirection', 'feedrate',
      'dimWidth', 'dimHeight',
      'addMoveBtn', 'clearTrajBtn',
      'runTrajBtn', 'pauseTrajBtn', 'stopTrajBtn',
      'trajPointCount', 'trajDistance',
      'exportGCodeBtn', 'exportCsvBtn', 'exportStepsBtn',
      'trajectoryCanvas'
    ];

    ids.forEach(id => {
      this.elements[id] = document.getElementById(id);
    });
  }

  initCharts() {
    const positionCtx = document.getElementById('positionChart').getContext('2d');
    const outputCtx = document.getElementById('outputChart').getContext('2d');

    const commonOptions = {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      interaction: {
        intersect: false,
        mode: 'index'
      },
      scales: {
        x: {
          type: 'linear',
          title: {
            display: true,
            text: '时间 (秒)'
          }
        },
        y: {
          title: {
            display: true,
            text: '位置 (度)'
          }
        }
      },
      plugins: {
        legend: {
          display: true,
          position: 'top'
        }
      }
    };

    this.positionChart = new Chart(positionCtx, {
      type: 'line',
      data: {
        datasets: [
          {
            label: '目标位置',
            data: [],
            borderColor: '#2196F3',
            backgroundColor: 'rgba(33, 150, 243, 0.1)',
            borderWidth: 2,
            pointRadius: 0,
            tension: 0.1,
            fill: false
          },
          {
            label: '实际位置',
            data: [],
            borderColor: '#4CAF50',
            backgroundColor: 'rgba(76, 175, 80, 0.1)',
            borderWidth: 2,
            pointRadius: 0,
            tension: 0.1,
            fill: false
          },
          {
            label: '位置误差',
            data: [],
            borderColor: '#f44336',
            backgroundColor: 'rgba(244, 67, 54, 0.1)',
            borderWidth: 1,
            pointRadius: 0,
            tension: 0.1,
            fill: false,
            hidden: true,
            yAxisID: 'y1'
          }
        ]
      },
      options: {
        ...commonOptions,
        scales: {
          ...commonOptions.scales,
          y1: {
            type: 'linear',
            position: 'right',
            title: {
              display: true,
              text: '误差 (度)'
            },
            grid: {
              drawOnChartArea: false
            }
          }
        }
      }
    });

    this.outputChart = new Chart(outputCtx, {
      type: 'line',
      data: {
        datasets: [
          {
            label: 'PID 输出',
            data: [],
            borderColor: '#FF9800',
            backgroundColor: 'rgba(255, 152, 0, 0.1)',
            borderWidth: 2,
            pointRadius: 0,
            tension: 0.1,
            fill: false
          },
          {
            label: '速度 (RPM)',
            data: [],
            borderColor: '#9C27B0',
            backgroundColor: 'rgba(156, 39, 176, 0.1)',
            borderWidth: 2,
            pointRadius: 0,
            tension: 0.1,
            fill: false,
            yAxisID: 'y1'
          }
        ]
      },
      options: {
        ...commonOptions,
        scales: {
          ...commonOptions.scales,
          y: {
            title: {
              display: true,
              text: 'PID 输出'
            }
          },
          y1: {
            type: 'linear',
            position: 'right',
            title: {
              display: true,
              text: '速度 (RPM)'
            },
            grid: {
              drawOnChartArea: false
            }
          }
        }
      }
    });
  }

  bindEvents() {
    this.elements.connectBtn.addEventListener('click', () => this.connectDevice());
    this.elements.disconnectBtn.addEventListener('click', () => this.disconnectDevice());
    this.elements.moveBtn.addEventListener('click', () => this.moveToTarget());
    this.elements.stopBtn.addEventListener('click', () => this.stopMotor());
    this.elements.homeBtn.addEventListener('click', () => this.goHome());
    this.elements.applyPIDBtn.addEventListener('click', () => this.applyPIDParams());
    this.elements.autoTuneBtn.addEventListener('click', () => this.startAutoTune());
    this.elements.clearChartBtn.addEventListener('click', () => this.clearCharts());
    this.elements.clearLogBtn.addEventListener('click', () => this.clearLog());

    ['showTarget', 'showActual', 'showError'].forEach(id => {
      this.elements[id].addEventListener('change', () => this.updateChartVisibility());
    });

    ['maxSpeed', 'acceleration', 'stepsPerRev', 'encoderPPR'].forEach(id => {
      this.elements[id].addEventListener('change', () => this.updateMotionParams());
    });

    this.elements.addMoveBtn.addEventListener('click', () => this.addTrajectoryMove());
    this.elements.clearTrajBtn.addEventListener('click', () => this.clearTrajectory());
    this.elements.runTrajBtn.addEventListener('click', () => this.runTrajectory());
    this.elements.pauseTrajBtn.addEventListener('click', () => this.togglePauseTrajectory());
    this.elements.stopTrajBtn.addEventListener('click', () => this.stopTrajectory());

    this.elements.exportGCodeBtn.addEventListener('click', () => this.exportGCode());
    this.elements.exportCsvBtn.addEventListener('click', () => this.exportCSV());
    this.elements.exportStepsBtn.addEventListener('click', () => this.exportStepSequence());

    this.elements.interpType.addEventListener('change', () => this.updateInterpInputs());
  }

  setupCallbacks() {
    this.hidComm.setOnConnect((device) => this.onDeviceConnect(device));
    this.hidComm.setOnDisconnect((device) => this.onDeviceDisconnect(device));
    this.hidComm.setOnReceive((event) => this.onHIDReceive(event));

    this.pulseGenerator.setOnPulse((direction, position) => this.onPulse(direction, position));
    this.pulseGenerator.setOnPositionChange((position) => this.onPulseGeneratorPositionChange(position));

    this.encoderParser.setOnPositionUpdate((position, data) => this.onEncoderPositionUpdate(position, data));
    this.encoderParser.setOnVelocityUpdate((velocity, data) => this.onEncoderVelocityUpdate(velocity, data));

    this.interpolator.setOnStep((steps, position) => this.onInterpolatorStep(steps, position));
    this.interpolator.setOnPositionUpdate((position) => this.onInterpolatorPositionUpdate(position));
    this.interpolator.setOnTrajectoryComplete(() => this.onTrajectoryComplete());
  }

  enableSimulationMode() {
    this.isSimulating = true;
    this.addLog('已启用模拟模式', 'info');
  }

  async connectDevice() {
    try {
      if (this.isSimulating) {
        this.simulateConnection();
        return;
      }

      this.addLog('正在连接HID设备...', 'info');
      const device = await this.hidComm.connect();
      this.addLog(`已连接到设备: ${device.productName || '未知设备'}`, 'success');
    } catch (error) {
      this.addLog(`连接失败: ${error.message}`, 'error');
    }
  }

  simulateConnection() {
    this.elements.connectionIndicator.className = 'indicator connected';
    this.elements.connectionText.textContent = '已连接 (模拟)';
    this.elements.connectBtn.disabled = true;
    this.elements.disconnectBtn.disabled = false;
    this.elements.deviceName.textContent = '模拟设备';
    this.elements.deviceId.textContent = 'VID: 1234 PID: 5678';
    this.addLog('模拟设备已连接', 'success');
  }

  async disconnectDevice() {
    try {
      this.stopControlLoop();
      this.pulseGenerator.stop();

      if (this.isSimulating) {
        this.simulateDisconnection();
        return;
      }

      await this.hidComm.disconnect();
    } catch (error) {
      this.addLog(`断开失败: ${error.message}`, 'error');
    }
  }

  simulateDisconnection() {
    this.elements.connectionIndicator.className = 'indicator disconnected';
    this.elements.connectionText.textContent = '未连接';
    this.elements.connectBtn.disabled = false;
    this.elements.disconnectBtn.disabled = true;
    this.elements.deviceName.textContent = '--';
    this.elements.deviceId.textContent = 'VID: -- PID: --';
    this.addLog('模拟设备已断开', 'info');
  }

  onDeviceConnect(device) {
    this.elements.connectionIndicator.className = 'indicator connected';
    this.elements.connectionText.textContent = '已连接';
    this.elements.connectBtn.disabled = true;
    this.elements.disconnectBtn.disabled = false;
    this.elements.deviceName.textContent = device.productName || '未知设备';
    this.elements.deviceId.textContent = `VID: ${device.vendorId.toString(16).toUpperCase()} PID: ${device.productId.toString(16).toUpperCase()}`;
  }

  onDeviceDisconnect(device) {
    this.elements.connectionIndicator.className = 'indicator disconnected';
    this.elements.connectionText.textContent = '未连接';
    this.elements.connectBtn.disabled = false;
    this.elements.disconnectBtn.disabled = true;
    this.elements.deviceName.textContent = '--';
    this.elements.deviceId.textContent = 'VID: -- PID: --';
    this.stopControlLoop();
    this.addLog('设备已断开', 'warning');
  }

  onHIDReceive(event) {
    const result = this.encoderParser.parseHIDReport(event);
    if (result) {
      this.processEncoderData(result);
    }
  }

  processEncoderData(data) {
    if (data.type === 'position' || data.type === 'extended_position' || data.type === 'generic') {
      this.elements.currentPosition.value = data.positionDegrees.toFixed(2);
      this.elements.pulseCount.textContent = Math.round(data.position);

      const targetDegrees = parseFloat(this.elements.targetPosition.value);
      const error = targetDegrees - data.positionDegrees;
      this.elements.positionError.value = error.toFixed(2);

      this.updateCharts(targetDegrees, data.positionDegrees, error);
    }

    if (data.type === 'velocity' || data.type === 'extended_position') {
      this.elements.encoderVelocity.textContent = `${data.velocityRPM.toFixed(1)} RPM`;
    }

    if (data.type === 'status') {
      const statusText = data.status.moving ? '运动中' :
                         data.status.positionReached ? '到位' :
                         data.status.motorEnabled ? '使能' : '待机';
      this.elements.motorStatus.textContent = statusText;

      if (data.status.encoderError) {
        this.addLog('编码器错误', 'error');
      }
      if (data.status.overTemp) {
        this.addLog('过热警告', 'warning');
      }
    }
  }

  onEncoderPositionUpdate(position, data) {
    if (this.isSimulating) {
      this.elements.currentPosition.value = data.degrees.toFixed(2);
      this.elements.pulseCount.textContent = Math.round(position);
    }
  }

  onEncoderVelocityUpdate(velocity, data) {
    if (this.isSimulating) {
      this.elements.encoderVelocity.textContent = `${data.rpm.toFixed(1)} RPM`;
    }
  }

  onPulse(direction, position) {
    if (this.hidComm.isConnected() && !this.isSimulating) {
      const command = this.pulseGenerator.encodePulseForHID(direction, 1);
      this.hidComm.sendReport(0x01, command);
    }
  }

  onPulseGeneratorPositionChange(position) {
    const degrees = this.pulseGenerator.stepsToDegrees(position);
    this.elements.currentPosition.value = degrees.toFixed(2);
    this.elements.pulseCount.textContent = position;

    if (this.isSimulating) {
      this.simulatedPosition = position;
    }
  }

  async moveToTarget() {
    try {
      const targetDegrees = parseFloat(this.elements.targetPosition.value);
      const targetSteps = this.pulseGenerator.degreesToSteps(targetDegrees);

      this.pidController.setSetpoint(targetDegrees);
      this.elements.motorStatus.textContent = '运动中';

      this.startControlLoop();

      if (!this.isSimulating && this.hidComm.isConnected()) {
        const command = this.pulseGenerator.encodePositionCommand(targetSteps);
        await this.hidComm.sendReport(0x01, command);
      } else {
        await this.pulseGenerator.moveTo(targetSteps, true);
        this.elements.motorStatus.textContent = '到位';
      }

      this.addLog(`移动到目标位置: ${targetDegrees}°`, 'info');
    } catch (error) {
      this.addLog(`移动失败: ${error.message}`, 'error');
      this.elements.motorStatus.textContent = '错误';
    }
  }

  async stopMotor() {
    try {
      this.stopControlLoop();
      this.pulseGenerator.stop();

      if (this.hidComm.isConnected() && !this.isSimulating) {
        const command = this.pulseGenerator.encodeStopCommand();
        await this.hidComm.sendReport(0x01, command);
      }

      this.elements.motorStatus.textContent = '已停止';
      this.addLog('电机已停止', 'warning');
    } catch (error) {
      this.addLog(`停止失败: ${error.message}`, 'error');
    }
  }

  async goHome() {
    try {
      this.elements.targetPosition.value = '0';
      this.pidController.setSetpoint(0);
      this.encoderParser.resetPosition();
      this.pulseGenerator.setCurrentPosition(0);
      this.simulatedPosition = 0;

      if (this.hidComm.isConnected() && !this.isSimulating) {
        const command = this.pulseGenerator.encodeSetHomeCommand();
        await this.hidComm.sendReport(0x01, command);
      }

      this.addLog('已设置当前位置为零点', 'info');
      this.updateCharts(0, 0, 0);
    } catch (error) {
      this.addLog(`回零失败: ${error.message}`, 'error');
    }
  }

  updateMotionParams() {
    const maxSpeed = parseInt(this.elements.maxSpeed.value) || 500;
    const acceleration = parseInt(this.elements.acceleration.value) || 200;
    const stepsPerRev = parseInt(this.elements.stepsPerRev.value) || 200;
    const encoderPPR = parseInt(this.elements.encoderPPR.value) || 2000;

    this.pulseGenerator.setMaxSpeed(maxSpeed);
    this.pulseGenerator.setAcceleration(acceleration);
    this.pulseGenerator.setStepsPerRevolution(stepsPerRev);
    this.encoderParser.setPulsesPerRevolution(encoderPPR);

    this.saveMotionParams();

    this.addLog(`运动参数已更新: 速度=${maxSpeed}, 加速度=${acceleration}`, 'info');
  }

  applyPIDParams() {
    const kp = parseFloat(this.elements.kp.value) || 2.0;
    const ki = parseFloat(this.elements.ki.value) || 0.5;
    const kd = parseFloat(this.elements.kd.value) || 0.1;
    const deadband = parseFloat(this.elements.deadband.value) || 0.5;
    const kv = parseFloat(this.elements.kv.value) || 0;
    const ka = parseFloat(this.elements.ka.value) || 0;

    this.pidController.setGains(kp, ki, kd);
    this.pidController.setFeedForwardGains(kv, ka);
    this.pidController.setDeadband(deadband);

    this.savePIDParams();

    this.addLog(`PID参数已应用: Kp=${kp}, Ki=${ki}, Kd=${kd}, Kv=${kv}, Ka=${ka}, 死区=${deadband}`, 'info');
  }

  async startAutoTune() {
    try {
      this.addLog('开始自动调参...', 'info');
      this.elements.autoTuneBtn.disabled = true;

      const currentDegrees = this.encoderParser.getPositionDegrees();
      const targetAmplitude = 45;

      this.pidController.setSetpoint(currentDegrees);

      const result = await this.pidController.startAutoTune(targetAmplitude, 50);

      const gains = result.zieglerNichols.lessOvershoot;
      this.elements.kp.value = gains.kp.toFixed(3);
      this.elements.ki.value = gains.ki.toFixed(3);
      this.elements.kd.value = gains.kd.toFixed(3);

      this.applyPIDParams();

      this.addLog(`自动调参完成: Ku=${result.ku.toFixed(3)}, Tu=${result.tu.toFixed(3)}s`, 'success');
    } catch (error) {
      this.addLog(`自动调参失败: ${error.message}`, 'error');
    } finally {
      this.elements.autoTuneBtn.disabled = false;
    }
  }

  startControlLoop() {
    if (this.controlLoopRunning) return;

    this.controlLoopRunning = true;
    const loopInterval = 10;

    this.controlLoopInterval = setInterval(() => {
      this.controlLoop();
    }, loopInterval);

    this.addLog('PID控制循环已启动', 'info');
  }

  stopControlLoop() {
    if (this.controlLoopInterval) {
      clearInterval(this.controlLoopInterval);
      this.controlLoopInterval = null;
    }
    this.controlLoopRunning = false;
    this.pidController.reset();
    this.addLog('PID控制循环已停止', 'info');
  }

  controlLoop() {
    let currentPosition;

    if (this.isSimulating) {
      currentPosition = this.pulseGenerator.stepsToDegrees(this.simulatedPosition);
    } else {
      currentPosition = this.encoderParser.getPositionDegrees();
    }

    const targetDegrees = this.pidController.getSetpoint();

    if (this.isSimulating) {
      const maxVelocity = this.pulseGenerator.maxSpeed;
      const accel = this.pulseGenerator.acceleration;
      const stepsToTarget = Math.abs(this.pulseGenerator.degreesToSteps(targetDegrees) - this.simulatedPosition);
      const distance = this.pulseGenerator.stepsToDegrees(stepsToTarget);

      if (distance > 0.5) {
        const currentSpeed = Math.min(
          maxVelocity,
          Math.sqrt(2 * accel * distance)
        );
        this.pidController.setTargetVelocity(currentSpeed * (targetDegrees > currentPosition ? 1 : -1));
        this.pidController.setTargetAcceleration(accel * (targetDegrees > currentPosition ? 1 : -1));
      } else {
        this.pidController.setTargetVelocity(0);
        this.pidController.setTargetAcceleration(0);
      }
    } else {
      const encoderVelocity = this.encoderParser.getVelocity();
      this.pidController.setTargetVelocity(encoderVelocity);
    }

    const pidOutput = this.pidController.compute(currentPosition);
    const error = this.pidController.getError();
    this.elements.positionError.value = error.toFixed(2);
    this.elements.pidOutputValue.textContent = pidOutput.toFixed(2);

    const normalizedOutput = Math.abs(pidOutput) / Math.max(
      Math.abs(this.pidController.outputMax),
      Math.abs(this.pidController.outputMin)
    ) * 100;
    this.elements.pidOutputBar.style.width = `${Math.min(100, normalizedOutput)}%`;
    this.elements.pidOutputBar.style.background = pidOutput >= 0 ? '#4CAF50' : '#f44336';

    if (this.isSimulating) {
      const maxVelocity = this.pulseGenerator.maxSpeed;
      const velocity = this.pidController.outputToVelocity(pidOutput, maxVelocity);

      if (Math.abs(pidOutput) > 0.1) {
        const direction = pidOutput > 0 ? 1 : -1;
        const stepDelay = 1000 / Math.abs(velocity);

        if (!this.pulseGenerator.isRunning) {
          const targetSteps = this.pulseGenerator.degreesToSteps(targetDegrees);
          this.pulseGenerator.moveTo(targetSteps, false);
        }
      }
    } else if (this.hidComm.isConnected()) {
      const velocity = this.pidController.outputToVelocity(pidOutput, 1000);
      const direction = velocity >= 0 ? 1 : -1;

      if (Math.abs(velocity) > 1) {
        const command = this.pulseGenerator.encodeVelocityCommand(Math.abs(velocity), direction);
        this.hidComm.sendReport(0x01, command);
      }
    }

    const velocity = this.encoderParser.getVelocityRPM();
    const currentTime = Date.now() / 1000;
    this.updateCharts(targetDegrees, currentPosition, error);
    this.updateOutputChart(currentTime, pidOutput, velocity);
  }

  updateCharts(target, actual, error) {
    const currentTime = Date.now() / 1000;

    this.positionData.time.push(currentTime);
    this.positionData.target.push(target);
    this.positionData.actual.push(actual);
    this.positionData.error.push(error);

    if (this.positionData.time.length > this.maxDataPoints) {
      this.positionData.time.shift();
      this.positionData.target.shift();
      this.positionData.actual.shift();
      this.positionData.error.shift();
    }

    this.positionChart.data.datasets[0].data = this.positionData.time.map((t, i) => ({
      x: t - this.positionData.time[0],
      y: this.positionData.target[i]
    }));

    this.positionChart.data.datasets[1].data = this.positionData.time.map((t, i) => ({
      x: t - this.positionData.time[0],
      y: this.positionData.actual[i]
    }));

    this.positionChart.data.datasets[2].data = this.positionData.time.map((t, i) => ({
      x: t - this.positionData.time[0],
      y: this.positionData.error[i]
    }));

    this.positionChart.update('none');
  }

  updateOutputChart(time, pidOutput, velocity) {
    const startTime = this.outputData.time[0] || time;
    const relativeTime = time - startTime;

    this.outputData.time.push(time);
    this.outputData.pid.push(pidOutput);
    this.outputData.velocity.push(velocity);

    if (this.outputData.time.length > this.maxDataPoints) {
      this.outputData.time.shift();
      this.outputData.pid.shift();
      this.outputData.velocity.shift();
    }

    this.outputChart.data.datasets[0].data = this.outputData.time.map((t, i) => ({
      x: t - startTime,
      y: this.outputData.pid[i]
    }));

    this.outputChart.data.datasets[1].data = this.outputData.time.map((t, i) => ({
      x: t - startTime,
      y: this.outputData.velocity[i]
    }));

    this.outputChart.update('none');
  }

  updateChartVisibility() {
    this.positionChart.data.datasets[0].hidden = !this.elements.showTarget.checked;
    this.positionChart.data.datasets[1].hidden = !this.elements.showActual.checked;
    this.positionChart.data.datasets[2].hidden = !this.elements.showError.checked;
    this.positionChart.update();
  }

  clearCharts() {
    this.positionData = { time: [], target: [], actual: [], error: [] };
    this.outputData = { time: [], pid: [], velocity: [] };

    this.positionChart.data.datasets.forEach(ds => ds.data = []);
    this.outputChart.data.datasets.forEach(ds => ds.data = []);

    this.positionChart.update();
    this.outputChart.update();

    this.addLog('图表已清除', 'info');
  }

  addLog(message, type = 'info') {
    const timestamp = new Date().toLocaleTimeString();
    const logEntry = document.createElement('div');
    logEntry.className = `log-entry log-${type}`;
    logEntry.innerHTML = `<span class="log-time">[${timestamp}]</span> ${message}`;

    this.elements.logContainer.appendChild(logEntry);
    this.elements.logContainer.scrollTop = this.elements.logContainer.scrollHeight;

    while (this.elements.logContainer.children.length > 100) {
      this.elements.logContainer.removeChild(this.elements.logContainer.firstChild);
    }
  }

  clearLog() {
    this.elements.logContainer.innerHTML = '';
  }

  savePIDParams() {
    const params = {
      kp: parseFloat(this.elements.kp.value) || 2.0,
      ki: parseFloat(this.elements.ki.value) || 0.5,
      kd: parseFloat(this.elements.kd.value) || 0.1,
      deadband: parseFloat(this.elements.deadband.value) || 0.5,
      kv: parseFloat(this.elements.kv.value) || 0,
      ka: parseFloat(this.elements.ka.value) || 0
    };

    try {
      localStorage.setItem(this.STORAGE_KEY_PID, JSON.stringify(params));
    } catch (e) {
      this.addLog('PID参数保存失败', 'error');
    }
  }

  loadSavedParams() {
    try {
      const pidJson = localStorage.getItem(this.STORAGE_KEY_PID);
      if (pidJson) {
        const params = JSON.parse(pidJson);
        this.elements.kp.value = params.kp ?? 2.0;
        this.elements.ki.value = params.ki ?? 0.5;
        this.elements.kd.value = params.kd ?? 0.1;
        this.elements.deadband.value = params.deadband ?? 0.5;
        this.elements.kv.value = params.kv ?? 0;
        this.elements.ka.value = params.ka ?? 0;
        this.addLog('已从本地存储加载PID参数', 'info');
      }

      const motionJson = localStorage.getItem(this.STORAGE_KEY_MOTION);
      if (motionJson) {
        const params = JSON.parse(motionJson);
        this.elements.maxSpeed.value = params.maxSpeed ?? 500;
        this.elements.acceleration.value = params.acceleration ?? 200;
        this.elements.stepsPerRev.value = params.stepsPerRev ?? 200;
        this.elements.encoderPPR.value = params.encoderPPR ?? 2000;
        this.addLog('已从本地存储加载运动参数', 'info');
      }
    } catch (e) {
      this.addLog('参数加载失败', 'error');
    }
  }

  saveMotionParams() {
    const params = {
      maxSpeed: parseInt(this.elements.maxSpeed.value) || 500,
      acceleration: parseInt(this.elements.acceleration.value) || 200,
      stepsPerRev: parseInt(this.elements.stepsPerRev.value) || 200,
      encoderPPR: parseInt(this.elements.encoderPPR.value) || 2000
    };

    try {
      localStorage.setItem(this.STORAGE_KEY_MOTION, JSON.stringify(params));
    } catch (e) {
      this.addLog('运动参数保存失败', 'error');
    }
  }

  updateUI() {
    this.updateMotionParams();
    this.initTrajectoryCanvas();
    this.updateInterpInputs();
    this.updateTrajectoryInfo();
  }

  initTrajectoryCanvas() {
    const canvas = this.elements.trajectoryCanvas;
    if (!canvas) return;

    const container = canvas.parentElement;
    canvas.width = container.clientWidth;
    canvas.height = container.clientHeight;

    this.trajectoryCanvas = canvas;
    this.trajectoryCtx = canvas.getContext('2d');

    this.drawTrajectory();
  }

  drawTrajectory() {
    if (!this.trajectoryCtx) return;

    const ctx = this.trajectoryCtx;
    const width = this.trajectoryCanvas.width;
    const height = this.trajectoryCanvas.height;

    ctx.fillStyle = '#0a0a1a';
    ctx.fillRect(0, 0, width, height);

    const trajectory = this.interpolator.getTrajectory();
    if (trajectory.length === 0) {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
      ctx.lineWidth = 1;
      const gridSize = 40;
      for (let x = 0; x < width; x += gridSize) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      }
      for (let y = 0; y < height; y += gridSize) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }

      ctx.strokeStyle = '#f44336';
      ctx.beginPath();
      ctx.moveTo(width / 2, 0);
      ctx.lineTo(width / 2, height);
      ctx.stroke();

      ctx.strokeStyle = '#4CAF50';
      ctx.beginPath();
      ctx.moveTo(0, height / 2);
      ctx.lineTo(width, height / 2);
      ctx.stroke();

      ctx.fillStyle = '#64B5F6';
      ctx.font = '12px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('添加运动段以预览轨迹', width / 2, height / 2 + 30);

      return;
    }

    const bbox = this.interpolator.getBoundingBox();
    const padding = 40;
    const availableWidth = width - 2 * padding;
    const availableHeight = height - 2 * padding;

    const rangeX = bbox.maxX - bbox.minX || 1;
    const rangeY = bbox.maxY - bbox.minY || 1;
    const scale = Math.min(availableWidth / rangeX, availableHeight / rangeY);

    const centerX = (bbox.minX + bbox.maxX) / 2;
    const centerY = (bbox.minY + bbox.maxY) / 2;

    const toCanvasX = (x) => (x - centerX) * scale + width / 2;
    const toCanvasY = (y) => -(y - centerY) * scale + height / 2;

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.lineWidth = 1;
    const gridStep = Math.ceil(Math.max(rangeX, rangeY) / 10);
    for (let x = Math.floor(bbox.minX / gridStep) * gridStep; x <= bbox.maxX; x += gridStep) {
      ctx.beginPath();
      ctx.moveTo(toCanvasX(x), padding);
      ctx.lineTo(toCanvasX(x), height - padding);
      ctx.stroke();
    }
    for (let y = Math.floor(bbox.minY / gridStep) * gridStep; y <= bbox.maxY; y += gridStep) {
      ctx.beginPath();
      ctx.moveTo(padding, toCanvasY(y));
      ctx.lineTo(width - padding, toCanvasY(y));
      ctx.stroke();
    }

    ctx.beginPath();
    ctx.strokeStyle = '#2196F3';
    ctx.lineWidth = 2;

    let started = false;
    for (const point of trajectory) {
      if (point.type === 'dwell') continue;

      const cx = toCanvasX(point.x);
      const cy = toCanvasY(point.y);

      if (!started) {
        ctx.moveTo(cx, cy);
        started = true;
      } else {
        ctx.lineTo(cx, cy);
      }
    }
    ctx.stroke();

    const firstPoint = trajectory.find(p => p.type !== 'dwell');
    if (firstPoint) {
      ctx.beginPath();
      ctx.fillStyle = '#4CAF50';
      ctx.arc(toCanvasX(firstPoint.x), toCanvasY(firstPoint.y), 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = '10px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText('起点', toCanvasX(firstPoint.x) + 10, toCanvasY(firstPoint.y) - 10);
    }

    const lastPoint = [...trajectory].reverse().find(p => p.type !== 'dwell');
    if (lastPoint) {
      ctx.beginPath();
      ctx.fillStyle = '#f44336';
      ctx.arc(toCanvasX(lastPoint.x), toCanvasY(lastPoint.y), 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = '10px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText('终点', toCanvasX(lastPoint.x) + 10, toCanvasY(lastPoint.y) - 10);
    }

    const currentPos = this.interpolator.getCurrentPosition();
    ctx.beginPath();
    ctx.fillStyle = '#FF9800';
    ctx.arc(toCanvasX(currentPos.x), toCanvasY(currentPos.y), 5, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#64B5F6';
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`范围: X[${bbox.minX.toFixed(1)}, ${bbox.maxX.toFixed(1)}] Y[${bbox.minY.toFixed(1)}, ${bbox.maxY.toFixed(1)}]`, 10, 20);
  }

  updateInterpInputs() {
    const type = this.elements.interpType.value;

    if (type === 'rectangle' || type === 'circle') {
      this.elements.dimWidth.parentElement.style.display = 'flex';
      this.elements.centerX.parentElement.parentElement.style.display = 'none';
      this.elements.arcDirection.parentElement.style.display = 'none';
      this.elements.targetX.parentElement.parentElement.style.display = type === 'circle' ? 'none' : 'block';
    } else if (type === 'circular') {
      this.elements.dimWidth.parentElement.style.display = 'none';
      this.elements.centerX.parentElement.parentElement.style.display = 'block';
      this.elements.arcDirection.parentElement.style.display = 'block';
      this.elements.targetX.parentElement.parentElement.style.display = 'block';
    } else {
      this.elements.dimWidth.parentElement.style.display = 'none';
      this.elements.centerX.parentElement.parentElement.style.display = 'none';
      this.elements.arcDirection.parentElement.style.display = 'none';
      this.elements.targetX.parentElement.parentElement.style.display = 'block';
    }
  }

  addTrajectoryMove() {
    const type = this.elements.interpType.value;
    const feedrate = parseFloat(this.elements.feedrate.value) || 100;

    try {
      let pointCount = 0;

      switch (type) {
        case 'linear': {
          const x = parseFloat(this.elements.targetX.value);
          const y = parseFloat(this.elements.targetY.value);
          pointCount = this.interpolator.addLinearMove(x, y, feedrate);
          this.addLog(`添加直线插补: (${x}, ${y})`, 'info');
          break;
        }
        case 'circular': {
          const x = parseFloat(this.elements.targetX.value);
          const y = parseFloat(this.elements.targetY.value);
          const cx = parseFloat(this.elements.centerX.value);
          const cy = parseFloat(this.elements.centerY.value);
          const dir = this.elements.arcDirection.value;
          pointCount = this.interpolator.addCircularMove(x, y, cx, cy, dir, feedrate);
          this.addLog(`添加圆弧插补: 终点(${x}, ${y}), 圆心(${cx}, ${cy}), ${dir}`, 'info');
          break;
        }
        case 'rectangle': {
          const w = parseFloat(this.elements.dimWidth.value);
          const h = parseFloat(this.elements.dimHeight.value);
          const rect = this.interpolator.generateRectangle(w, h, 0, 0, feedrate);
          pointCount = rect.length;
          this.addLog(`生成矩形: ${w} × ${h}`, 'info');
          break;
        }
        case 'circle': {
          const r = parseFloat(this.elements.dimWidth.value);
          const circle = this.interpolator.generateCircle(r, 0, 0, feedrate);
          pointCount = circle.length;
          this.addLog(`生成圆形: 半径 ${r}`, 'info');
          break;
        }
      }

      this.updateTrajectoryInfo();
      this.drawTrajectory();
      this.addLog(`轨迹点数: ${pointCount}`, 'success');
    } catch (e) {
      this.addLog(`添加轨迹失败: ${e.message}`, 'error');
    }
  }

  clearTrajectory() {
    this.interpolator.clearTrajectory();
    this.interpolator.setCurrentPosition(0, 0);
    this.updateTrajectoryInfo();
    this.drawTrajectory();
    this.addLog('轨迹已清空', 'info');
  }

  updateTrajectoryInfo() {
    const count = this.interpolator.getTrajectoryLength();
    const distance = this.interpolator.getTotalDistance();

    this.elements.trajPointCount.textContent = count;
    this.elements.trajDistance.textContent = `${distance.toFixed(2)} mm`;
  }

  async runTrajectory() {
    if (this.interpolator.getTrajectoryLength() === 0) {
      this.addLog('轨迹为空，请先添加运动段', 'warning');
      return;
    }

    this.elements.runTrajBtn.disabled = true;
    this.elements.pauseTrajBtn.disabled = false;
    this.elements.motorStatus.textContent = '轨迹运行中';

    this.addLog('开始执行轨迹...', 'info');

    await this.interpolator.executeTrajectory(10);
  }

  togglePauseTrajectory() {
    if (this.interpolator.isPaused) {
      this.interpolator.resume();
      this.elements.pauseTrajBtn.textContent = '暂停';
      this.elements.motorStatus.textContent = '轨迹运行中';
      this.addLog('轨迹继续执行', 'info');
    } else {
      this.interpolator.pause();
      this.elements.pauseTrajBtn.textContent = '继续';
      this.elements.motorStatus.textContent = '轨迹暂停';
      this.addLog('轨迹已暂停', 'info');
    }
  }

  stopTrajectory() {
    this.interpolator.stop();
    this.elements.runTrajBtn.disabled = false;
    this.elements.pauseTrajBtn.disabled = true;
    this.elements.pauseTrajBtn.textContent = '暂停';
    this.elements.motorStatus.textContent = '轨迹已停止';
    this.addLog('轨迹已停止', 'warning');
  }

  onInterpolatorStep(steps, position) {
    this.drawTrajectory();
  }

  onInterpolatorPositionUpdate(position) {
    if (this.hidComm.isConnected() && !this.isSimulating) {
      const commandX = this.pulseGenerator.encodePositionCommand(
        this.interpolator.unitsToSteps(position.x)
      );
      this.hidComm.sendReport(0x01, commandX);

      const commandY = this.pulseGenerator.encodePositionCommand(
        this.interpolator.unitsToSteps(position.y)
      );
      this.hidComm.sendReport(0x02, commandY);
    }
  }

  onTrajectoryComplete() {
    this.elements.runTrajBtn.disabled = false;
    this.elements.pauseTrajBtn.disabled = true;
    this.elements.pauseTrajBtn.textContent = '暂停';
    this.elements.motorStatus.textContent = '轨迹完成';
    this.addLog('轨迹执行完成', 'success');
  }

  exportGCode() {
    const gcode = this.interpolator.generateGCode();
    this.downloadFile(gcode, 'trajectory.gcode', 'text/plain');
    this.addLog('已导出 G-Code 文件', 'success');
  }

  exportCSV() {
    const csv = this.interpolator.generateCSV();
    this.downloadFile(csv, 'trajectory.csv', 'text/csv');
    this.addLog('已导出 CSV 文件', 'success');
  }

  exportStepSequence() {
    const steps = this.interpolator.generateStepSequence();
    const json = JSON.stringify(steps, null, 2);
    this.downloadFile(json, 'steps.json', 'application/json');
    this.addLog('已导出步序 JSON 文件', 'success');
  }

  downloadFile(content, filename, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  window.app = new MotorControllerApp();
});
