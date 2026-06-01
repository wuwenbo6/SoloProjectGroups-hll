class PIDController {
  constructor(kp = 1.0, ki = 0.0, kd = 0.0) {
    this.kp = kp;
    this.ki = ki;
    this.kd = kd;

    this.kv = 0.0;
    this.ka = 0.0;

    this.setpoint = 0;
    this.targetVelocity = 0;
    this.targetAcceleration = 0;
    this.currentValue = 0;

    this.integral = 0;
    this.previousError = 0;
    this.previousTime = null;
    this.previousSetpoint = 0;

    this.outputMin = -1000;
    this.outputMax = 1000;
    this.integralMin = -1000;
    this.integralMax = 1000;

    this.deadband = 0;
    this.filterAlpha = 1.0;
    this.filteredDerivative = 0;

    this.autoTuning = false;
    this.tuningPhase = 0;
    this.tuningData = [];
  }

  setGains(kp, ki, kd) {
    this.kp = kp;
    this.ki = ki;
    this.kd = kd;
  }

  setFeedForwardGains(kv, ka = 0) {
    this.kv = kv;
    this.ka = ka;
  }

  setTargetVelocity(velocity) {
    this.targetVelocity = velocity;
  }

  setTargetAcceleration(acceleration) {
    this.targetAcceleration = acceleration;
  }

  setOutputLimits(min, max) {
    this.outputMin = min;
    this.outputMax = max;
  }

  setIntegralLimits(min, max) {
    this.integralMin = min;
    this.integralMax = max;
  }

  setDeadband(deadband) {
    this.deadband = Math.abs(deadband);
  }

  setDerivativeFilter(alpha) {
    this.filterAlpha = Math.max(0.01, Math.min(1.0, alpha));
  }

  setSetpoint(setpoint) {
    this.setpoint = setpoint;
  }

  getSetpoint() {
    return this.setpoint;
  }

  reset() {
    this.integral = 0;
    this.previousError = 0;
    this.previousTime = null;
    this.previousSetpoint = 0;
    this.targetVelocity = 0;
    this.targetAcceleration = 0;
    this.filteredDerivative = 0;
  }

  compute(currentValue, currentTime = null) {
    this.currentValue = currentValue;

    const error = this.setpoint - currentValue;

    if (Math.abs(error) <= this.deadband) {
      return 0;
    }

    if (currentTime === null) {
      currentTime = performance.now();
    }

    let dt = 0;
    if (this.previousTime !== null) {
      dt = (currentTime - this.previousTime) / 1000;
    }
    this.previousTime = currentTime;

    if (dt <= 0) {
      dt = 0.001;
    }

    if (dt > 0 && this.previousSetpoint !== this.setpoint) {
      this.targetVelocity = (this.setpoint - this.previousSetpoint) / dt;
      this.previousSetpoint = this.setpoint;
    }

    const pTerm = this.kp * error;

    this.integral += error * dt;
    this.integral = Math.max(this.integralMin, Math.min(this.integralMax, this.integral));
    const iTerm = this.ki * this.integral;

    let derivative = 0;
    if (dt > 0) {
      derivative = (error - this.previousError) / dt;
    }

    this.filteredDerivative =
      this.filterAlpha * derivative + (1 - this.filterAlpha) * this.filteredDerivative;
    const dTerm = this.kd * this.filteredDerivative;

    const vTerm = this.kv * this.targetVelocity;
    const aTerm = this.ka * this.targetAcceleration;

    this.previousError = error;

    let output = pTerm + iTerm + dTerm + vTerm + aTerm;
    output = Math.max(this.outputMin, Math.min(this.outputMax, output));

    return output;
  }

  computeWithFeedForward(currentValue, feedForward = 0, currentTime = null) {
    const pidOutput = this.compute(currentValue, currentTime);
    return pidOutput + feedForward;
  }

  getError() {
    return this.setpoint - this.currentValue;
  }

  getIntegral() {
    return this.integral;
  }

  getGains() {
    return {
      kp: this.kp,
      ki: this.ki,
      kd: this.kd,
      kv: this.kv,
      ka: this.ka
    };
  }

  getFeedForwardGains() {
    return {
      kv: this.kv,
      ka: this.ka
    };
  }

  startAutoTune(targetAmplitude = 100, sampleTime = 100) {
    this.autoTuning = true;
    this.tuningPhase = 0;
    this.tuningData = [];
    this.reset();

    return new Promise((resolve) => {
      let relayOutput = targetAmplitude;
      let lastSwitchTime = performance.now();
      let switchCount = 0;
      const maxSwitches = 10;
      const periods = [];
      const amplitudes = [];

      const tuneInterval = setInterval(() => {
        if (switchCount >= maxSwitches) {
          clearInterval(tuneInterval);
          this.autoTuning = false;

          const avgPeriod = periods.reduce((a, b) => a + b, 0) / periods.length;
          const avgAmplitude = amplitudes.reduce((a, b) => a + b, 0) / amplitudes.length;

          const ku = (4 * targetAmplitude) / (Math.PI * avgAmplitude);
          const tu = avgPeriod / 1000;

          const zieglerNichols = {
            classic: {
              kp: 0.6 * ku,
              ki: 1.2 * ku / tu,
              kd: 0.075 * ku * tu
            },
            lessOvershoot: {
              kp: 0.33 * ku,
              ki: 0.66 * ku / tu,
              kd: 0.11 * ku * tu
            },
            noOvershoot: {
              kp: 0.2 * ku,
              ki: 0.4 * ku / tu,
              kd: 0.066 * ku * tu
            }
          };

          resolve({
            ku,
            tu,
            zieglerNichols,
            rawData: this.tuningData
          });
          return;
        }

        const error = this.setpoint - this.currentValue;

        if ((error > 0 && relayOutput < 0) || (error < 0 && relayOutput > 0)) {
          const now = performance.now();
          const period = now - lastSwitchTime;

          if (switchCount > 0) {
            periods.push(period);
            amplitudes.push(Math.abs(this.currentValue - this.setpoint));
          }

          lastSwitchTime = now;
          switchCount++;
          relayOutput = -relayOutput;
        }

        this.tuningData.push({
          time: performance.now(),
          setpoint: this.setpoint,
          currentValue: this.currentValue,
          output: relayOutput
        });
      }, sampleTime);
    });
  }

  outputToVelocity(output, maxVelocity) {
    const normalizedOutput = output / Math.max(Math.abs(this.outputMax), Math.abs(this.outputMin));
    return normalizedOutput * maxVelocity;
  }

  outputToSteps(output, stepsPerUnit = 1) {
    return Math.round(output * stepsPerUnit);
  }

  static createPositionController() {
    const pid = new PIDController(2.0, 0.5, 0.1);
    pid.setOutputLimits(-500, 500);
    pid.setIntegralLimits(-200, 200);
    pid.setDeadband(0.5);
    pid.setDerivativeFilter(0.1);
    return pid;
  }

  static createVelocityController() {
    const pid = new PIDController(0.5, 0.05, 0.01);
    pid.setOutputLimits(-100, 100);
    pid.setIntegralLimits(-50, 50);
    pid.setDeadband(1);
    return pid;
  }
}

window.PIDController = PIDController;
