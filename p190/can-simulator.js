const EventEmitter = require('events');

class CANSimulator extends EventEmitter {
  constructor() {
    super();
    this.connected = false;
    this.messageQueue = [];
    this.processingDelay = 10;
    this.simulatedDevices = [
      { id: 'CAN-USB-001', name: 'USB-CAN Adapter Pro', serial: 'A1B2C3D4', vendor: '0x1234', product: '0x5678' },
      { id: 'CAN-USB-002', name: 'CANalyst-II', serial: 'E5F6A7B8', vendor: '0x04D8', product: '0x0053' }
    ];
    this.detectedDevices = [];
  }

  detectDevices() {
    return new Promise((resolve) => {
      setTimeout(() => {
        const success = Math.random() > 0.1;
        if (success) {
          this.detectedDevices = [...this.simulatedDevices];
          resolve({
            success: true,
            devices: this.detectedDevices,
            message: `检测到 ${this.detectedDevices.length} 个USB-CAN适配器`
          });
        } else {
          this.detectedDevices = [];
          resolve({
            success: false,
            devices: [],
            message: '未检测到USB-CAN适配器，请检查设备连接'
          });
        }
      }, 800);
    });
  }

  connect(deviceId) {
    return new Promise(async (resolve) => {
      if (this.detectedDevices.length === 0) {
        const detectResult = await this.detectDevices();
        if (!detectResult.success) {
          resolve({ success: false, message: '连接失败：未检测到USB-CAN适配器' });
          return;
        }
      }

      let targetDevice = this.detectedDevices[0];
      if (deviceId) {
        targetDevice = this.detectedDevices.find(d => d.id === deviceId);
        if (!targetDevice) {
          resolve({ success: false, message: `连接失败：未找到设备 ${deviceId}` });
          return;
        }
      }

      setTimeout(() => {
        this.connected = true;
        this.currentDevice = targetDevice;
        this.emit('connected', targetDevice);
        resolve({ 
          success: true, 
          message: `USB-CAN适配器连接成功：${targetDevice.name}`,
          device: targetDevice
        });
      }, 500);
    });
  }

  disconnect() {
    return new Promise((resolve) => {
      setTimeout(() => {
        this.connected = false;
        const device = this.currentDevice;
        this.currentDevice = null;
        this.emit('disconnected', device);
        resolve({ 
          success: true, 
          message: 'USB-CAN适配器已断开' 
        });
      }, 200);
    });
  }

  getDetectedDevices() {
    return {
      devices: this.detectedDevices,
      connected: this.connected,
      currentDevice: this.currentDevice
    };
  }

  send(canId, data) {
    if (!this.connected) {
      return Promise.reject(new Error('适配器未连接'));
    }

    return new Promise((resolve) => {
      setTimeout(() => {
        const message = {
          id: canId,
          data: Buffer.from(data),
          timestamp: Date.now(),
          direction: 'tx'
        };
        
        this.emit('message', message);
        this.simulateResponse(canId, data);
        resolve({ success: true, message });
      }, this.processingDelay);
    });
  }

  simulateResponse(canId, data) {
    if (!this.connected) return;

    const isSDO = (canId & 0x780) === 0x580;
    if (isSDO) {
      const nodeId = canId & 0x7F;
      const responseId = 0x580 + nodeId;
      this.simulateSDOResponse(responseId, data);
    }
  }

  simulateSDOResponse(responseId, data) {
    const cmdByte = data[0];
    const index = data[1] | (data[2] << 8);
    const subIndex = data[3];

    let responseData;
    const isRead = (cmdByte & 0xE0) === 0x40;
    const isWrite = (cmdByte & 0xE0) === 0x20;

    if (isRead) {
      responseData = this.simulateSDORead(cmdByte, index, subIndex);
    } else if (isWrite) {
      responseData = this.simulateSDOWrite(cmdByte, index, subIndex, data);
    } else {
      responseData = Buffer.from([0x80, data[1], data[2], data[3], 0x00, 0x00, 0x00, 0x00]);
    }

    setTimeout(() => {
      const message = {
        id: responseId,
        data: responseData,
        timestamp: Date.now(),
        direction: 'rx'
      };
      this.emit('message', message);
    }, 20);
  }

  simulateSDORead(cmdByte, index, subIndex) {
    if (index === 0x1000 && subIndex === 0x00) {
      return Buffer.from([0x43, 0x00, 0x10, 0x00, 0x01, 0x00, 0x00, 0x00]);
    }
    
    if (index === 0x1008 && subIndex === 0x00) {
      const deviceName = 'CANopen-Device';
      if (deviceName.length <= 4) {
        const data = Buffer.alloc(8);
        data[0] = 0x42 | ((4 - deviceName.length) << 2);
        data[1] = 0x08;
        data[2] = 0x10;
        data[3] = 0x00;
        for (let i = 0; i < deviceName.length; i++) {
          data[4 + i] = deviceName.charCodeAt(i);
        }
        return data;
      } else {
        this.simulateSegmentedRead(index, subIndex, Buffer.from(deviceName));
        return Buffer.from([0x41, 0x08, 0x10, 0x00, deviceName.length & 0xFF, (deviceName.length >> 8) & 0xFF, 0x00, 0x00]);
      }
    }

    if (index === 0x2000) {
      const longData = Buffer.alloc(50);
      for (let i = 0; i < 50; i++) {
        longData[i] = i + subIndex;
      }
      this.simulateSegmentedRead(index, subIndex, longData);
      return Buffer.from([0x41, 0x00, 0x20, subIndex, longData.length & 0xFF, (longData.length >> 8) & 0xFF, 0x00, 0x00]);
    }

    return Buffer.from([0x4F, data[1], data[2], data[3], 0x11, 0x22, 0x33, 0x44]);
  }

  simulateSegmentedRead(index, subIndex, fullData) {
    const totalLength = fullData.length;
    let offset = 0;
    let toggle = 0;
    let segmentNum = 0;

    const sendSegment = () => {
      if (offset >= totalLength) return;

      const isLast = offset + 7 >= totalLength;
      const segmentSize = isLast ? totalLength - offset : 7;
      
      const segment = Buffer.alloc(8);
      segment[0] = (isLast ? 0x01 : 0x00) | (toggle << 4);
      
      for (let i = 0; i < segmentSize; i++) {
        segment[1 + i] = fullData[offset + i];
      }

      for (let i = segmentSize; i < 7; i++) {
        segment[1 + i] = 0x00;
      }

      segment[0] |= ((7 - segmentSize) << 1);

      setTimeout(() => {
        const message = {
          id: 0x581,
          data: segment,
          timestamp: Date.now(),
          direction: 'rx',
          isSegment: true,
          segmentNum: segmentNum++
        };
        this.emit('message', message);
        offset += segmentSize;
        toggle = 1 - toggle;

        if (!isLast) {
          sendSegment();
        }
      }, 10);
    };

    sendSegment();
  }

  simulateSDOWrite(cmdByte, index, subIndex, data) {
    const noDataBytes = (cmdByte >> 2) & 0x03;
    
    if (cmdByte & 0x01) {
      return Buffer.from([0x60, index & 0xFF, (index >> 8) & 0xFF, subIndex, 0x00, 0x00, 0x00, 0x00]);
    } else {
      return Buffer.from([0x60, index & 0xFF, (index >> 8) & 0xFF, subIndex, 0x00, 0x00, 0x00, 0x00]);
    }
  }
}

module.exports = CANSimulator;
