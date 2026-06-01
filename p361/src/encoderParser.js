class EncoderParser {
  constructor(pulsesPerRevolution = 2000) {
    this.pulsesPerRevolution = pulsesPerRevolution;
    this.rawPosition = 0;
    this.absolutePosition = 0;
    this.lastRawPosition = 0;
    this.rolloverCount = 0;
    this.resolution = pulsesPerRevolution;
    this.velocity = 0;
    this.lastUpdateTime = null;
    this.positionHistory = [];
    this.maxHistorySize = 100;
    this.onPositionUpdateCallback = null;
    this.onVelocityUpdateCallback = null;
    this.encoderType = 'incremental';
    this.bits = 16;
    this.signed = true;
  }

  setPulsesPerRevolution(ppr) {
    this.pulsesPerRevolution = ppr;
    this.resolution = ppr;
  }

  setEncoderType(type, bits = 16, signed = true) {
    this.encoderType = type;
    this.bits = bits;
    this.signed = signed;
  }

  setOnPositionUpdate(callback) {
    this.onPositionUpdateCallback = callback;
  }

  setOnVelocityUpdate(callback) {
    this.onVelocityUpdateCallback = callback;
  }

  parseHIDReport(event) {
    const data = new Uint8Array(event.data.buffer);
    const reportId = event.reportId;

    let result = null;

    switch (reportId) {
      case 0x01:
        result = this.parsePositionReport(data);
        break;
      case 0x02:
        result = this.parseVelocityReport(data);
        break;
      case 0x03:
        result = this.parseStatusReport(data);
        break;
      case 0x10:
        result = this.parseExtendedPositionReport(data);
        break;
      default:
        result = this.parseGenericReport(data, reportId);
    }

    return result;
  }

  parsePositionReport(data) {
    if (data.length < 8) {
      return null;
    }

    const view = new DataView(data.buffer);
    const position = view.getInt32(0, true);
    const timestamp = view.getUint32(4, true);

    this.updatePosition(position);

    return {
      type: 'position',
      rawPosition: position,
      position: this.absolutePosition,
      positionDegrees: this.pulsesToDegrees(this.absolutePosition),
      positionRadians: this.pulsesToRadians(this.absolutePosition),
      timestamp: timestamp
    };
  }

  parseExtendedPositionReport(data) {
    if (data.length < 12) {
      return null;
    }

    const view = new DataView(data.buffer);
    const position = view.getInt32(0, true);
    const velocity = view.getInt32(4, true);
    const status = view.getUint16(8, true);
    const checksum = view.getUint16(10, true);

    this.updatePosition(position);
    this.updateVelocity(velocity);

    return {
      type: 'extended_position',
      rawPosition: position,
      position: this.absolutePosition,
      positionDegrees: this.pulsesToDegrees(this.absolutePosition),
      velocity: velocity,
      velocityRPM: this.pulsesPerSecondToRPM(velocity),
      status: status,
      checksum: checksum,
      checksumValid: this.verifyChecksum(data.slice(0, 10), checksum)
    };
  }

  parseVelocityReport(data) {
    if (data.length < 8) {
      return null;
    }

    const view = new DataView(data.buffer);
    const velocity = view.getInt32(0, true);
    const timestamp = view.getUint32(4, true);

    this.updateVelocity(velocity);

    return {
      type: 'velocity',
      rawVelocity: velocity,
      velocity: velocity,
      velocityRPM: this.pulsesPerSecondToRPM(velocity),
      timestamp: timestamp
    };
  }

  parseStatusReport(data) {
    if (data.length < 4) {
      return null;
    }

    const view = new DataView(data.buffer);
    const statusByte = view.getUint8(0);
    const errorCode = view.getUint8(1);
    const temperature = view.getInt8(2);
    const voltage = view.getUint8(3);

    return {
      type: 'status',
      status: {
        powerOn: (statusByte & 0x01) !== 0,
        motorEnabled: (statusByte & 0x02) !== 0,
        encoderError: (statusByte & 0x04) !== 0,
        overTemp: (statusByte & 0x08) !== 0,
        overVoltage: (statusByte & 0x10) !== 0,
        underVoltage: (statusByte & 0x20) !== 0,
        positionReached: (statusByte & 0x40) !== 0,
        moving: (statusByte & 0x80) !== 0
      },
      errorCode: errorCode,
      temperature: temperature,
      voltage: voltage * 0.1
    };
  }

  parseGenericReport(data, reportId) {
    if (data.length >= 4) {
      const view = new DataView(data.buffer);
      const position = view.getInt32(0, true);
      this.updatePosition(position);

      return {
        type: 'generic',
        reportId: reportId,
        rawData: Array.from(data),
        position: this.absolutePosition,
        positionDegrees: this.pulsesToDegrees(this.absolutePosition)
      };
    }

    return {
      type: 'unknown',
      reportId: reportId,
      rawData: Array.from(data)
    };
  }

  updatePosition(rawPosition) {
    if (this.lastUpdateTime !== null) {
      const now = performance.now();
      const dt = (now - this.lastUpdateTime) / 1000;
      if (dt > 0) {
        this.velocity = (rawPosition - this.lastRawPosition) / dt;
      }
    }

    if (this.signed) {
      const maxValue = Math.pow(2, this.bits - 1) - 1;
      const minValue = -Math.pow(2, this.bits - 1);

      if (this.lastRawPosition - rawPosition > maxValue) {
        this.rolloverCount++;
      } else if (rawPosition - this.lastRawPosition > maxValue) {
        this.rolloverCount--;
      }
    }

    this.lastRawPosition = rawPosition;
    this.rawPosition = rawPosition;
    this.absolutePosition = rawPosition + this.rolloverCount * Math.pow(2, this.bits);
    this.lastUpdateTime = performance.now();

    this.positionHistory.push({
      timestamp: this.lastUpdateTime,
      position: this.absolutePosition
    });

    if (this.positionHistory.length > this.maxHistorySize) {
      this.positionHistory.shift();
    }

    if (this.onPositionUpdateCallback) {
      this.onPositionUpdateCallback(this.absolutePosition, {
        raw: rawPosition,
        degrees: this.pulsesToDegrees(this.absolutePosition),
        radians: this.pulsesToRadians(this.absolutePosition)
      });
    }
  }

  updateVelocity(velocity) {
    this.velocity = velocity;

    if (this.onVelocityUpdateCallback) {
      this.onVelocityUpdateCallback(velocity, {
        rpm: this.pulsesPerSecondToRPM(velocity)
      });
    }
  }

  pulsesToDegrees(pulses) {
    return (pulses / this.pulsesPerRevolution) * 360;
  }

  degreesToPulses(degrees) {
    return Math.round((degrees / 360) * this.pulsesPerRevolution);
  }

  pulsesToRadians(pulses) {
    return (pulses / this.pulsesPerRevolution) * 2 * Math.PI;
  }

  radiansToPulses(radians) {
    return Math.round((radians / (2 * Math.PI)) * this.pulsesPerRevolution);
  }

  pulsesPerSecondToRPM(pulsesPerSecond) {
    return (pulsesPerSecond * 60) / this.pulsesPerRevolution;
  }

  rpmToPulsesPerSecond(rpm) {
    return (rpm * this.pulsesPerRevolution) / 60;
  }

  getPosition() {
    return this.absolutePosition;
  }

  getPositionDegrees() {
    return this.pulsesToDegrees(this.absolutePosition);
  }

  getVelocity() {
    return this.velocity;
  }

  getVelocityRPM() {
    return this.pulsesPerSecondToRPM(this.velocity);
  }

  resetPosition() {
    this.rawPosition = 0;
    this.absolutePosition = 0;
    this.lastRawPosition = 0;
    this.rolloverCount = 0;
    this.positionHistory = [];
  }

  verifyChecksum(data, expectedChecksum) {
    let checksum = 0;
    for (let i = 0; i < data.length; i++) {
      checksum += data[i];
    }
    return (checksum & 0xFFFF) === expectedChecksum;
  }

  calculateMovingAverage(windowSize = 5) {
    if (this.positionHistory.length < windowSize) {
      return this.absolutePosition;
    }

    const recent = this.positionHistory.slice(-windowSize);
    const sum = recent.reduce((acc, val) => acc + val.position, 0);
    return sum / recent.length;
  }

  calculateVelocityFromHistory(windowSize = 5) {
    if (this.positionHistory.length < windowSize + 1) {
      return this.velocity;
    }

    const recent = this.positionHistory.slice(-(windowSize + 1));
    const dt = (recent[recent.length - 1].timestamp - recent[0].timestamp) / 1000;
    const dp = recent[recent.length - 1].position - recent[0].position;

    return dt > 0 ? dp / dt : 0;
  }
}

window.EncoderParser = EncoderParser;
