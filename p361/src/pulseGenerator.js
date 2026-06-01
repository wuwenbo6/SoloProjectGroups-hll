class PulseGenerator {
  constructor(stepsPerRevolution = 200) {
    this.stepsPerRevolution = stepsPerRevolution;
    this.currentPosition = 0;
    this.targetPosition = 0;
    this.isRunning = false;
    this.direction = 1;
    this.pulseInterval = null;
    this.onPulseCallback = null;
    this.onPositionChangeCallback = null;
    this.pulseDelay = 1000;
    this.acceleration = 100;
    this.maxSpeed = 1000;
    this.currentSpeed = 0;
  }

  setOnPulse(callback) {
    this.onPulseCallback = callback;
  }

  setOnPositionChange(callback) {
    this.onPositionChangeCallback = callback;
  }

  setStepsPerRevolution(steps) {
    this.stepsPerRevolution = steps;
  }

  setMaxSpeed(stepsPerSecond) {
    this.maxSpeed = Math.max(1, stepsPerSecond);
  }

  setAcceleration(stepsPerSecond2) {
    this.acceleration = Math.max(1, stepsPerSecond2);
  }

  setTargetPosition(position) {
    this.targetPosition = position;
  }

  setCurrentPosition(position) {
    this.currentPosition = position;
    if (this.onPositionChangeCallback) {
      this.onPositionChangeCallback(this.currentPosition);
    }
  }

  getCurrentPosition() {
    return this.currentPosition;
  }

  getTargetPosition() {
    return this.targetPosition;
  }

  stepsToDegrees(steps) {
    return (steps / this.stepsPerRevolution) * 360;
  }

  degreesToSteps(degrees) {
    return Math.round((degrees / 360) * this.stepsPerRevolution);
  }

  calculatePulseDelay(speed) {
    if (speed <= 0) return 1000000;
    return (1 / speed) * 1000000;
  }

  async moveTo(targetPosition, useTrapezoidal = true) {
    if (this.isRunning) {
      this.stop();
    }

    this.targetPosition = targetPosition;
    this.isRunning = true;
    this.direction = this.targetPosition > this.currentPosition ? 1 : -1;

    if (useTrapezoidal) {
      await this.runTrapezoidal();
    } else {
      await this.runConstantSpeed();
    }
  }

  async runConstantSpeed() {
    const stepsRemaining = Math.abs(this.targetPosition - this.currentPosition);
    const delay = this.calculatePulseDelay(this.maxSpeed) / 1000;

    for (let i = 0; i < stepsRemaining; i++) {
      if (!this.isRunning) break;

      this.step();
      await this.sleep(delay);
    }

    this.isRunning = false;
    this.currentSpeed = 0;
  }

  async runTrapezoidal() {
    const totalSteps = Math.abs(this.targetPosition - this.currentPosition);
    const accelSteps = Math.min(
      Math.floor((this.maxSpeed * this.maxSpeed) / (2 * this.acceleration)),
      Math.floor(totalSteps / 2)
    );
    const decelSteps = accelSteps;
    const cruiseSteps = totalSteps - 2 * accelSteps;

    let stepCount = 0;
    this.currentSpeed = 0;

    while (stepCount < accelSteps && this.isRunning) {
      this.currentSpeed = Math.min(
        this.currentSpeed + this.acceleration * 0.001,
        this.maxSpeed
      );
      const delay = this.calculatePulseDelay(this.currentSpeed) / 1000;
      this.step();
      stepCount++;
      await this.sleep(delay);
    }

    const cruiseDelay = this.calculatePulseDelay(this.maxSpeed) / 1000;
    stepCount = 0;
    while (stepCount < cruiseSteps && this.isRunning) {
      this.step();
      stepCount++;
      await this.sleep(cruiseDelay);
    }

    stepCount = 0;
    while (stepCount < decelSteps && this.isRunning) {
      this.currentSpeed = Math.max(
        this.currentSpeed - this.acceleration * 0.001,
        0
      );
      const delay = this.calculatePulseDelay(Math.max(this.currentSpeed, 1)) / 1000;
      this.step();
      stepCount++;
      await this.sleep(delay);
    }

    this.isRunning = false;
    this.currentSpeed = 0;
  }

  step() {
    this.currentPosition += this.direction;

    if (this.onPulseCallback) {
      this.onPulseCallback(this.direction, this.currentPosition);
    }

    if (this.onPositionChangeCallback) {
      this.onPositionChangeCallback(this.currentPosition);
    }
  }

  stop() {
    this.isRunning = false;
    if (this.pulseInterval) {
      clearInterval(this.pulseInterval);
      this.pulseInterval = null;
    }
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  generatePulseSequence(fromPosition, toPosition) {
    const steps = Math.abs(toPosition - fromPosition);
    const direction = toPosition > fromPosition ? 1 : -1;
    const sequence = [];

    for (let i = 0; i < steps; i++) {
      sequence.push({
        step: i + 1,
        direction: direction,
        position: fromPosition + direction * (i + 1),
        timestamp: Date.now() + i * this.pulseDelay
      });
    }

    return sequence;
  }

  encodePulseForHID(direction, pulseCount = 1) {
    const buffer = new ArrayBuffer(8);
    const view = new DataView(buffer);

    view.setUint8(0, 0x01);
    view.setInt8(1, direction > 0 ? 1 : -1);
    view.setUint32(2, pulseCount, true);
    view.setUint16(6, 0xAAAA, true);

    return new Uint8Array(buffer);
  }

  encodePositionCommand(targetPosition) {
    const buffer = new ArrayBuffer(8);
    const view = new DataView(buffer);

    view.setUint8(0, 0x02);
    view.setInt32(1, targetPosition, true);
    view.setUint16(5, 0xBBBB, true);

    return new Uint8Array(buffer);
  }

  encodeVelocityCommand(velocity, direction) {
    const buffer = new ArrayBuffer(8);
    const view = new DataView(buffer);

    view.setUint8(0, 0x03);
    view.setInt8(1, direction > 0 ? 1 : -1);
    view.setUint32(2, velocity, true);
    view.setUint16(6, 0xCCCC, true);

    return new Uint8Array(buffer);
  }

  encodeStopCommand() {
    const buffer = new ArrayBuffer(8);
    const view = new DataView(buffer);

    view.setUint8(0, 0x04);
    view.setUint8(1, 0x01);
    view.setUint16(2, 0xDDDD, true);

    return new Uint8Array(buffer);
  }

  encodeSetHomeCommand() {
    const buffer = new ArrayBuffer(8);
    const view = new DataView(buffer);

    view.setUint8(0, 0x05);
    view.setUint8(1, 0x01);
    view.setUint16(2, 0xEEEE, true);

    return new Uint8Array(buffer);
  }
}

window.PulseGenerator = PulseGenerator;
