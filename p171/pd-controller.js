class PDController {
  constructor() {
    this.connected = false;
    this.monitoring = false;
    this.monitorInterval = null;
    this.curveRunning = false;
    this.curveAbortController = null;
    
    this.currentVoltage = 5.0;
    this.currentCurrent = 0.0;
    this.targetVoltage = 5.0;
    this.targetCurrent = 3.0;
    
    this.voltageStep = 0.02;
    this.currentStep = 0.05;
    
    this.ppsCapabilities = {
      minVoltage: 3.0,
      maxVoltage: 21.0,
      minCurrent: 0.5,
      maxCurrent: 5.0,
      voltageStep: 0.02,
      currentStep: 0.05
    };
  }

  async connect() {
    await this.delay(500);
    this.connected = true;
    this.currentVoltage = 5.0 + (Math.random() - 0.5) * 0.1;
    this.currentCurrent = 0.01 + Math.random() * 0.02;
    
    return {
      deviceInfo: {
        vendorId: '0x27C4',
        productId: '0x1234',
        manufacturer: 'PD Simulator',
        product: 'USB-PD PPS Controller',
        serialNumber: 'PD-SIM-001'
      },
      pdoCount: 4,
      capabilities: this.ppsCapabilities
    };
  }

  async disconnect() {
    this.stopMonitoring();
    this.stopCurve();
    await this.delay(200);
    this.connected = false;
    return true;
  }

  async setPPS(voltage, current) {
    if (!this.connected) {
      throw new Error('Device not connected');
    }

    const clampedVoltage = Math.max(
      this.ppsCapabilities.minVoltage,
      Math.min(this.ppsCapabilities.maxVoltage, voltage)
    );
    const clampedCurrent = Math.max(
      this.ppsCapabilities.minCurrent,
      Math.min(this.ppsCapabilities.maxCurrent, current)
    );

    this.targetVoltage = clampedVoltage;
    this.targetCurrent = clampedCurrent;

    const voltageDiff = clampedVoltage - this.currentVoltage;
    const voltageSteps = Math.ceil(Math.abs(voltageDiff) / this.voltageStep);
    
    const currentDiff = clampedCurrent - this.currentCurrent;
    const currentSteps = Math.ceil(Math.abs(currentDiff) / this.currentStep);
    
    const totalSteps = Math.max(voltageSteps, currentSteps, 1);
    const stepDelay = 10;

    for (let i = 0; i < totalSteps; i++) {
      const progress = (i + 1) / totalSteps;
      
      if (voltageSteps > 0) {
        const voltageDirection = voltageDiff > 0 ? 1 : -1;
        const voltageStepSize = Math.min(this.voltageStep, Math.abs(voltageDiff) * progress);
        this.currentVoltage = this.currentVoltage + (voltageDirection * voltageStepSize);
      }
      
      if (currentSteps > 0) {
        const currentDirection = currentDiff > 0 ? 1 : -1;
        const currentStepSize = Math.min(this.currentStep, Math.abs(currentDiff) * progress);
        this.currentCurrent = this.currentCurrent + (currentDirection * currentStepSize);
      }
      
      await this.delay(stepDelay);
    }

    this.currentVoltage = clampedVoltage + (Math.random() - 0.5) * 0.005;
    this.currentCurrent = clampedCurrent + (Math.random() - 0.5) * 0.01;

    return {
      voltage: this.currentVoltage,
      current: this.currentCurrent,
      power: this.currentVoltage * this.currentCurrent
    };
  }

  getStatus() {
    return {
      connected: this.connected,
      monitoring: this.monitoring,
      voltage: this.currentVoltage,
      current: this.currentCurrent,
      power: this.currentVoltage * this.currentCurrent,
      targetVoltage: this.targetVoltage,
      targetCurrent: this.targetCurrent
    };
  }

  startMonitoring(callback) {
    if (this.monitoring) return;
    this.monitoring = true;

    this.monitorInterval = setInterval(() => {
      if (!this.connected) return;

      const noiseVoltage = (Math.random() - 0.5) * 0.002;
      const noiseCurrent = (Math.random() - 0.5) * 0.005;
      
      const loadVariation = Math.sin(Date.now() / 500) * 0.05;

      const data = {
        timestamp: Date.now(),
        voltage: this.currentVoltage + noiseVoltage,
        current: Math.max(0, this.currentCurrent + noiseCurrent + loadVariation),
        power: 0
      };
      data.power = data.voltage * data.current;

      callback(data);
    }, 10);
  }

  stopMonitoring() {
    this.monitoring = false;
    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
      this.monitorInterval = null;
    }
  }

  async executeCurve(curvePoints, progressCallback) {
    if (!this.connected) {
      throw new Error('Device not connected');
    }

    if (this.curveRunning) {
      throw new Error('Curve already running');
    }

    this.curveRunning = true;
    this.curveAbortController = new AbortController();

    try {
      for (let i = 0; i < curvePoints.length; i++) {
        if (!this.curveRunning) break;

        const point = curvePoints[i];
        const progress = (i + 1) / curvePoints.length;

        await this.setPPS(point.voltage, point.current);

        const holdStart = Date.now();
        const holdTime = point.holdTime || 1000;
        
        while (Date.now() - holdStart < holdTime) {
          if (!this.curveRunning) break;
          await this.delay(50);
        }

        progressCallback(progress, {
          index: i,
          voltage: this.currentVoltage,
          current: this.currentCurrent,
          power: this.currentVoltage * this.currentCurrent
        });
      }
    } finally {
      this.curveRunning = false;
      this.curveAbortController = null;
    }
  }

  stopCurve() {
    this.curveRunning = false;
    if (this.curveAbortController) {
    }
  }

  getPPSCapabilities() {
    return this.ppsCapabilities;
  }

  async runLoadTransientTest(config, dataCallback, progressCallback) {
    if (!this.connected) {
      throw new Error('Device not connected');
    }

    const testData = [];
    const startTime = Date.now();
    const { currentLow, currentHigh, transitionTime, cycles, settleTime } = config;

    await this.setPPS(this.targetVoltage, currentLow);
    await this.delay(settleTime);

    for (let cycle = 0; cycle < cycles; cycle++) {
      const cycleStart = Date.now();

      await this.setPPS(this.targetVoltage, currentHigh);
      await this.delay(settleTime);

      await this.setPPS(this.targetVoltage, currentLow);
      await this.delay(settleTime);

      const progress = (cycle + 1) / cycles;
      if (progressCallback) {
        progressCallback(progress);
      }

      testData.push({
        cycle: cycle + 1,
        timestamp: Date.now(),
        currentLow,
        currentHigh,
        voltage: this.currentVoltage,
        current: this.currentCurrent
      });
    }

    return testData;
  }

  async runRippleTest(config, dataCallback) {
    if (!this.connected) {
      throw new Error('Device not connected');
    }

    const rippleData = [];
    const { duration, sampleRate, voltage, current } = config;

    await this.setPPS(voltage, current);
    await this.delay(500);

    const sampleInterval = 1000 / sampleRate;
    const samples = Math.floor(duration * sampleRate);

    for (let i = 0; i < samples; i++) {
      const noiseVoltage = (Math.random() - 0.5) * 0.015;
      const ripple = Math.sin(Date.now() / 5) * 0.008;
      
      const sample = {
        timestamp: Date.now(),
        voltage: this.currentVoltage + noiseVoltage + ripple,
        current: this.currentCurrent + (Math.random() - 0.5) * 0.02
      };
      sample.power = sample.voltage * sample.current;

      rippleData.push(sample);

      if (dataCallback) {
        dataCallback(sample);
      }

      await this.delay(sampleInterval);
    }

    const voltages = rippleData.map(d => d.voltage);
    const avgVoltage = voltages.reduce((a, b) => a + b, 0) / voltages.length;
    const minVoltage = Math.min(...voltages);
    const maxVoltage = Math.max(...voltages);
    const ripplePp = maxVoltage - minVoltage;
    const ripplePercent = (ripplePp / avgVoltage) * 100;

    return {
      samples: rippleData,
      statistics: {
        averageVoltage: avgVoltage,
        minVoltage,
        maxVoltage,
        ripplePp,
        ripplePercent,
        sampleCount: samples,
        duration,
        sampleRate
      }
    };
  }

  generateTestReport(type, testData, statistics) {
    const timestamp = new Date().toISOString();
    const report = {
      reportType: type,
      generatedAt: timestamp,
      deviceInfo: {
        vendorId: '0x27C4',
        productId: '0x1234',
        product: 'USB-PD PPS Controller'
      },
      testData,
      statistics
    };

    return report;
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = PDController;