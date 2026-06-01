const { usb } = require('electron');

const PICkit2Commands = {
  SYNC: 0x00,
  ENTER_BOOTLOADER: 0x42,
  READ_VERSION: 0x76,
  SET_VDD: 0x56,
  SET_VPP: 0x57,
  READ_STATUS: 0x73,
  EXECUTE_SCRIPT: 0x45,
  DOWNLOAD_SCRIPT: 0x44,
  UPLOAD_DATA: 0x47,
  DOWNLOAD_DATA: 0x48,
  CLR_DOWNLOAD_BUFFER: 0x43,
  END_OF_BUFFER: 0x0A,
  RESET: 0xFF,
  READ_OSCCAL: 0x97,
  WRITE_OSCCAL: 0x98,
  CHECK_DEVICE: 0x9A,
  BLANK_CHECK: 0x9D,
  READ_DEVICE: 0x92,
  WRITE_DEVICE: 0x93,
  ERASE_DEVICE: 0x91,
  PROGRAM_OSCCAL_BANDGAP: 0x99,
  READ_CHIP_ID: 0x82,
  VERIFY_CHIP_ID: 0x83,
  OFFLINE_PROGRAM: 0xA0,
  OFFLINE_VERIFY: 0xA1,
  OFFLINE_ERASE: 0xA2,
  OFFLINE_READ: 0xA3,
  OFFLINE_WRITE: 0xA4,
  OFFLINE_CHECK: 0xA5,
  OFFLINE_SET_TARGET: 0xA6,
  OFFLINE_GET_STATUS: 0xA7,
  OFFLINE_START: 0xA8
};

const ScriptCommands = {
  VPP_ON: 0x01,
  VPP_OFF: 0x02,
  VDD_ON: 0x03,
  VDD_OFF: 0x04,
  MCLR_GND: 0x05,
  ICSP_PGD: 0x06,
  ICSP_PGC: 0x07,
  DELAY_SHORT: 0x08,
  DELAY_LONG: 0x09,
  SET_ICSP_PIN_STATES: 0x0A,
  SEND_8BIT_COMMAND: 0x10,
  SEND_16BIT_COMMAND: 0x11,
  GET_8BIT_COMMAND: 0x12,
  GET_16BIT_COMMAND: 0x13,
  LOOP_START: 0x20,
  LOOP_END: 0x21,
  LOOP_COUNT: 0x22,
  OUTPUT_BYTE_INDEXED: 0x30,
  INPUT_BYTE_INDEXED: 0x31,
  OUTPUT_BITS: 0x32,
  INPUT_BITS: 0x33,
  MOVE_IND_W_PTR: 0x34,
  MOVE_W_IND: 0x35,
  IGNOR: 0x38,
  IF_EQUAL_GOTO: 0x39,
  IF_NOT_EQUAL_GOTO: 0x3A,
  GOTO: 0x3B,
  EXIT_SCRIPT: 0x3C,
  SET_ICSP_SPEED: 0x40,
  SET_ICSP_SPEED_FAST: 0x41,
  SET_ICSP_SPEED_SLOW: 0x42,
  UART_SETUP: 0x50,
  UART_TX: 0x51,
  UART_RX: 0x52,
  UART_RX_FAST: 0x53,
  UART_TX_FAST: 0x54,
  PE_SIGNAL_HOLD_TIME: 0x60,
  PE_DELAY_DATA: 0x61,
  PE_DELAY_CLK: 0x62,
  PE_ENTER_PROG_MODE: 0x70,
  PE_EXIT_PROG_MODE: 0x71,
  PE_BULK_ERASE: 0x72,
  PE_ROW_ERASE: 0x73,
  PE_READ_PROG_MEM: 0x74,
  PE_WRITE_PROG_MEM: 0x75,
  PE_READ_DATA_EE: 0x76,
  PE_WRITE_DATA_EE: 0x77,
  PE_READ_CONFIG: 0x78,
  PE_WRITE_CONFIG: 0x79,
  PE_INC_ADDR: 0x7A,
  PE_SET_ADDR: 0x7B,
  PE_RESET_ADDR: 0x7C
};

class CRC16 {
  static calculate(buffer, polynomial = 0x1021, initial = 0x0000) {
    let crc = initial;
    for (let i = 0; i < buffer.length; i++) {
      crc ^= buffer[i] << 8;
      for (let j = 0; j < 8; j++) {
        if (crc & 0x8000) {
          crc = (crc << 1) ^ polynomial;
        } else {
          crc <<= 1;
        }
        crc &= 0xFFFF;
      }
    }
    return crc;
  }

  static check(buffer) {
    if (buffer.length < 2) return false;
    const data = buffer.slice(0, -2);
    const expectedCRC = buffer[buffer.length - 2] | (buffer[buffer.length - 1] << 8);
    const calculatedCRC = this.calculate(data);
    return expectedCRC === calculatedCRC;
  }
}

class PICkit2Protocol {
  constructor() {
    this.device = null;
    this.interface = null;
    this.endpointIn = null;
    this.endpointOut = null;
    this.targetDevice = null;
    this.packetSize = 64;
  }

  async connect() {
    try {
      const devices = usb.getDeviceList();
      const pickit2Device = devices.find(dev => 
        dev.deviceDescriptor.idVendor === 0x04D8 && 
        dev.deviceDescriptor.idProduct === 0x0033
      );

      if (!pickit2Device) {
        console.log('未找到PICkit2设备，将使用模拟模式');
        return false;
      }

      this.device = pickit2Device;
      this.device.open();

      const configDescriptor = this.device.configDescriptor;
      if (!configDescriptor) {
        return false;
      }

      this.interface = this.device.interface(0);
      this.interface.claim();

      const endpoints = this.interface.endpoints;
      for (const endpoint of endpoints) {
        if (endpoint.direction === 'in') {
          this.endpointIn = endpoint;
        } else {
          this.endpointOut = endpoint;
        }
      }

      await this.reset();
      await this.readVersion();
      
      return true;
    } catch (error) {
      console.error('连接PICkit2失败:', error);
      return false;
    }
  }

  async disconnect() {
    if (this.device) {
      try {
        if (this.interface) {
          this.interface.release(true);
        }
        this.device.close();
      } catch (error) {
        console.error('断开连接失败:', error);
      }
      this.device = null;
      this.interface = null;
      this.endpointIn = null;
      this.endpointOut = null;
    }
  }

  async sendCommand(command, data = [], enableCRC = true) {
    const maxDataLength = enableCRC ? this.packetSize - 3 : this.packetSize - 1;
    const packet = Buffer.alloc(this.packetSize);
    
    packet[0] = command;
    
    const validDataLength = Math.min(data.length, maxDataLength);
    for (let i = 0; i < validDataLength; i++) {
      packet[i + 1] = data[i];
    }

    if (enableCRC) {
      const crcData = packet.slice(0, validDataLength + 1);
      const crc = CRC16.calculate(crcData);
      packet[validDataLength + 1] = crc & 0xFF;
      packet[validDataLength + 2] = (crc >> 8) & 0xFF;
    }

    return new Promise((resolve, reject) => {
      this.endpointOut.transfer(packet, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  async readResponse(length = this.packetSize, enableCRC = true) {
    return new Promise((resolve, reject) => {
      this.endpointIn.transfer(length, (err, data) => {
        if (err) {
          reject(err);
          return;
        }

        if (enableCRC && data.length >= 2) {
          if (!CRC16.check(data)) {
            console.warn('CRC校验失败，数据可能损坏');
          }
        }

        resolve(data);
      });
    });
  }

  async reset() {
    await this.sendCommand(PICkit2Commands.RESET);
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  async readVersion() {
    await this.sendCommand(PICkit2Commands.READ_VERSION);
    const response = await this.readResponse();
    return {
      firmwareVersion: `${response[0]}.${response[1]}`,
      hardwareVersion: `${response[2]}.${response[3]}`
    };
  }

  async getDeviceInfo() {
    const version = await this.readVersion();
    return {
      firmwareVersion: version.firmwareVersion,
      hardwareVersion: version.hardwareVersion,
      deviceName: 'PICkit2'
    };
  }

  async setTargetDevice(device) {
    this.targetDevice = device;
  }

  async enterProgramMode() {
    const script = [
      ScriptCommands.VDD_ON,
      ScriptCommands.DELAY_LONG,
      ScriptCommands.VPP_ON,
      ScriptCommands.DELAY_SHORT
    ];
    await this.downloadScript(script);
    await this.executeScript();
    await new Promise(resolve => setTimeout(resolve, 50));
  }

  async exitProgramMode() {
    const script = [
      ScriptCommands.VPP_OFF,
      ScriptCommands.DELAY_SHORT,
      ScriptCommands.VDD_OFF
    ];
    await this.downloadScript(script);
    await this.executeScript();
  }

  async downloadScript(script) {
    const maxScriptSize = 62;
    for (let i = 0; i < script.length; i += maxScriptSize) {
      const chunk = script.slice(i, i + maxScriptSize);
      const data = [0x00, i / maxScriptSize, ...chunk];
      await this.sendCommand(PICkit2Commands.DOWNLOAD_SCRIPT, data);
    }
  }

  async executeScript() {
    await this.sendCommand(PICkit2Commands.EXECUTE_SCRIPT);
    await new Promise(resolve => setTimeout(resolve, 50));
  }

  async downloadData(data) {
    await this.sendCommand(PICkit2Commands.CLR_DOWNLOAD_BUFFER);
    
    for (let i = 0; i < data.length; i += 62) {
      const chunk = data.slice(i, i + 62);
      await this.sendCommand(PICkit2Commands.DOWNLOAD_DATA, chunk);
    }
    
    await this.sendCommand(PICkit2Commands.DOWNLOAD_DATA, [PICkit2Commands.END_OF_BUFFER]);
  }

  async uploadData(length) {
    const result = [];
    while (result.length < length) {
      const response = await this.readResponse();
      for (let i = 0; i < response.length && result.length < length; i++) {
        result.push(response[i]);
      }
    }
    return Buffer.from(result);
  }

  async sendSync() {
    await this.sendCommand(PICkit2Commands.SYNC, [], false);
    await new Promise(resolve => setTimeout(resolve, 10));
  }

  async erase(progressCallback) {
    if (!this.targetDevice) {
      throw new Error('未选择目标设备');
    }

    progressCallback(0, '发送同步字节...');
    await this.sendSync();

    progressCallback(5, '进入编程模式...');
    await this.enterProgramMode();

    progressCallback(20, '开始擦除...');
    
    const eraseScript = this.getEraseScript();
    await this.downloadScript(eraseScript);
    await this.executeScript();

    progressCallback(80, '擦除完成...');

    progressCallback(90, '验证擦除...');
    const isBlank = await this.blankCheck();
    if (!isBlank) {
      throw new Error('擦除失败，设备非空');
    }

    progressCallback(100, '退出编程模式...');
    await this.exitProgramMode();

    return true;
  }

  async program(hexData, progressCallback) {
    if (!this.targetDevice) {
      throw new Error('未选择目标设备');
    }

    progressCallback(0, '进入编程模式...');
    await this.enterProgramMode();

    const programData = hexData.program || [];
    const eepromData = hexData.eeprom || [];
    const configData = hexData.config || [];

    progressCallback(10, '写入程序存储器...');
    await this.writeProgramMemory(programData, (p) => {
      progressCallback(10 + p * 0.5, `写入程序存储器... ${Math.round(p)}%`);
    });

    progressCallback(60, '写入EEPROM...');
    await this.writeEEPROM(eepromData, (p) => {
      progressCallback(60 + p * 0.2, `写入EEPROM... ${Math.round(p)}%`);
    });

    progressCallback(80, '写入配置位...');
    await this.writeConfig(configData, (p) => {
      progressCallback(80 + p * 0.15, `写入配置位... ${Math.round(p)}%`);
    });

    progressCallback(95, '退出编程模式...');
    await this.exitProgramMode();

    progressCallback(100, '编程完成');
    return true;
  }

  async verify(hexData, progressCallback) {
    if (!this.targetDevice) {
      throw new Error('未选择目标设备');
    }

    progressCallback(0, '进入编程模式...');
    await this.enterProgramMode();

    const programData = hexData.program || [];
    const eepromData = hexData.eeprom || [];
    const configData = hexData.config || [];

    progressCallback(10, '读取并校验程序存储器...');
    const programMatch = await this.verifyProgramMemory(programData, (p) => {
      progressCallback(10 + p * 0.6, `校验程序存储器... ${Math.round(p)}%`);
    });

    progressCallback(70, '读取并校验EEPROM...');
    const eepromMatch = await this.verifyEEPROM(eepromData, (p) => {
      progressCallback(70 + p * 0.2, `校验EEPROM... ${Math.round(p)}%`);
    });

    progressCallback(90, '读取并校验配置位...');
    const configMatch = await this.verifyConfig(configData, (p) => {
      progressCallback(90 + p * 0.08, `校验配置位... ${Math.round(p)}%`);
    });

    progressCallback(98, '退出编程模式...');
    await this.exitProgramMode();

    progressCallback(100, '校验完成');
    return programMatch && eepromMatch && configMatch;
  }

  async read(progressCallback) {
    if (!this.targetDevice) {
      throw new Error('未选择目标设备');
    }

    progressCallback(0, '进入编程模式...');
    await this.enterProgramMode();

    progressCallback(10, '读取程序存储器...');
    const program = await this.readProgramMemory((p) => {
      progressCallback(10 + p * 0.7, `读取程序存储器... ${Math.round(p)}%`);
    });

    progressCallback(80, '读取EEPROM...');
    const eeprom = await this.readEEPROM((p) => {
      progressCallback(80 + p * 0.15, `读取EEPROM... ${Math.round(p)}%`);
    });

    progressCallback(95, '读取配置位...');
    const config = await this.readConfig();

    progressCallback(100, '退出编程模式...');
    await this.exitProgramMode();

    return { program, eeprom, config };
  }

  getEraseScript() {
    const family = this.targetDevice?.family || 'PIC16';
    
    if (family === 'PIC18') {
      return [
        ScriptCommands.PE_ENTER_PROG_MODE,
        ScriptCommands.PE_BULK_ERASE,
        ScriptCommands.PE_EXIT_PROG_MODE
      ];
    } else {
      return [
        ScriptCommands.PE_ENTER_PROG_MODE,
        ScriptCommands.PE_BULK_ERASE,
        ScriptCommands.PE_EXIT_PROG_MODE
      ];
    }
  }

  async blankCheck() {
    await this.sendCommand(PICkit2Commands.BLANK_CHECK);
    const response = await this.readResponse();
    return response[0] === 0x00;
  }

  async writeProgramMemory(data, progressCallback) {
    const rowSize = this.targetDevice?.family === 'PIC18' ? 32 : 8;
    const totalRows = Math.ceil(data.length / rowSize);

    for (let i = 0; i < data.length; i += rowSize) {
      const row = data.slice(i, i + rowSize);
      const script = [
        ScriptCommands.PE_SET_ADDR,
        Math.floor(i / 2) & 0xFF,
        (Math.floor(i / 2) >> 8) & 0xFF,
        ScriptCommands.PE_WRITE_PROG_MEM,
        ...row,
        ScriptCommands.PE_INC_ADDR
      ];
      await this.downloadScript(script);
      await this.executeScript();

      if (progressCallback) {
        progressCallback(((i + row.length) / data.length) * 100);
      }
    }
  }

  async writeEEPROM(data, progressCallback) {
    for (let i = 0; i < data.length; i++) {
      const script = [
        ScriptCommands.PE_SET_ADDR,
        i & 0xFF,
        (i >> 8) & 0xFF,
        ScriptCommands.PE_WRITE_DATA_EE,
        data[i]
      ];
      await this.downloadScript(script);
      await this.executeScript();

      if (progressCallback) {
        progressCallback(((i + 1) / data.length) * 100);
      }
    }
  }

  async writeConfig(data, progressCallback) {
    for (let i = 0; i < data.length; i++) {
      const script = [
        ScriptCommands.PE_SET_ADDR,
        (0x8000 + i) & 0xFF,
        ((0x8000 + i) >> 8) & 0xFF,
        ScriptCommands.PE_WRITE_CONFIG,
        data[i] & 0xFF,
        (data[i] >> 8) & 0xFF
      ];
      await this.downloadScript(script);
      await this.executeScript();

      if (progressCallback) {
        progressCallback(((i + 1) / data.length) * 100);
      }
    }
  }

  async verifyProgramMemory(expectedData, progressCallback) {
    const readData = await this.readProgramMemory(progressCallback);
    
    for (let i = 0; i < expectedData.length; i++) {
      if (readData[i] !== expectedData[i] && expectedData[i] !== 0x3FFF) {
        return false;
      }
    }
    return true;
  }

  async verifyEEPROM(expectedData, progressCallback) {
    const readData = await this.readEEPROM(progressCallback);
    
    for (let i = 0; i < expectedData.length; i++) {
      if (readData[i] !== expectedData[i] && expectedData[i] !== 0xFF) {
        return false;
      }
    }
    return true;
  }

  async verifyConfig(expectedData, progressCallback) {
    const readData = await this.readConfig();
    
    for (let i = 0; i < expectedData.length; i++) {
      if (readData[i] !== expectedData[i] && expectedData[i] !== 0xFFFF) {
        return false;
      }
    }
    if (progressCallback) progressCallback(100);
    return true;
  }

  async readProgramMemory(progressCallback) {
    const programSize = this.targetDevice?.programSize || 0x2000;
    const result = [];

    for (let i = 0; i < programSize; i += 32) {
      const script = [
        ScriptCommands.PE_SET_ADDR,
        Math.floor(i / 2) & 0xFF,
        (Math.floor(i / 2) >> 8) & 0xFF,
        ScriptCommands.PE_READ_PROG_MEM
      ];
      await this.downloadScript(script);
      await this.executeScript();

      const data = await this.uploadData(64);
      for (let j = 0; j < 32 && result.length < programSize; j++) {
        result.push(data[j * 2] | (data[j * 2 + 1] << 8));
      }

      if (progressCallback) {
        progressCallback((result.length / programSize) * 100);
      }
    }

    return result;
  }

  async readEEPROM(progressCallback) {
    const eepromSize = this.targetDevice?.eepromSize || 256;
    const result = [];

    for (let i = 0; i < eepromSize; i++) {
      const script = [
        ScriptCommands.PE_SET_ADDR,
        i & 0xFF,
        (i >> 8) & 0xFF,
        ScriptCommands.PE_READ_DATA_EE
      ];
      await this.downloadScript(script);
      await this.executeScript();

      const data = await this.uploadData(1);
      result.push(data[0]);

      if (progressCallback) {
        progressCallback((result.length / eepromSize) * 100);
      }
    }

    return result;
  }

  async readConfig() {
    const configSize = 8;
    const result = [];

    for (let i = 0; i < configSize; i++) {
      const script = [
        ScriptCommands.PE_SET_ADDR,
        (0x8000 + i) & 0xFF,
        ((0x8000 + i) >> 8) & 0xFF,
        ScriptCommands.PE_READ_CONFIG
      ];
      await this.downloadScript(script);
      await this.executeScript();

      const data = await this.uploadData(2);
      result.push(data[0] | (data[1] << 8));
    }

    return result;
  }

  async readChipID() {
    if (!this.targetDevice) {
      throw new Error('未选择目标设备');
    }

    await this.enterProgramMode();

    const script = [
      ScriptCommands.PE_RESET_ADDR,
      ScriptCommands.PE_READ_CONFIG
    ];
    await this.downloadScript(script);
    await this.executeScript();

    const data = await this.uploadData(4);
    
    await this.exitProgramMode();

    const deviceID = (data[0] | (data[1] << 8)) & 0x3FFF;
    const revision = (data[2] | (data[3] << 8)) & 0x3FFF;

    return {
      deviceID,
      revision,
      raw: [deviceID, revision],
      hexID: '0x' + deviceID.toString(16).toUpperCase().padStart(4, '0')
    };
  }

  async verifyChipID(expectedID) {
    try {
      const chipID = await this.readChipID();
      
      if (expectedID) {
        const match = chipID.deviceID === expectedID;
        return {
          success: true,
          match,
          chipID,
          expectedID
        };
      }

      return {
        success: true,
        match: true,
        chipID,
        expectedID: null
      };
    } catch (error) {
      return {
        success: false,
        match: false,
        error: error.message
      };
    }
  }

  async getOfflineStatus() {
    await this.sendCommand(PICkit2Commands.OFFLINE_GET_STATUS);
    const response = await this.readResponse();
    
    return {
      hasData: response[0] === 0x01,
      targetDevice: response[1],
      programSize: response[2] | (response[3] << 8),
      eepromSize: response[4],
      checksum: response[5] | (response[6] << 8),
      status: response[7]
    };
  }

  async offlineErase() {
    await this.sendCommand(PICkit2Commands.OFFLINE_ERASE);
    await new Promise(resolve => setTimeout(resolve, 200));
    
    const response = await this.readResponse();
    return response[0] === 0x00;
  }

  async offlineWrite(hexData, progressCallback) {
    if (!this.targetDevice) {
      throw new Error('未选择目标设备');
    }

    const programData = hexData.program || [];
    const eepromData = hexData.eeprom || [];
    const configData = hexData.config || [];

    await this.offlineErase();

    const targetData = [
      this.targetDevice.family === 'PIC18' ? 0x01 : 0x00,
      programData.length & 0xFF,
      (programData.length >> 8) & 0xFF,
      eepromData.length & 0xFF,
      (eepromData.length >> 8) & 0xFF
    ];
    await this.sendCommand(PICkit2Commands.OFFLINE_SET_TARGET, targetData);
    await new Promise(resolve => setTimeout(resolve, 50));

    const totalBytes = programData.length * 2 + eepromData.length + configData.length * 2;
    let bytesWritten = 0;

    progressCallback(10, '写入程序存储器到编程器...');
    const programBytes = [];
    for (const word of programData) {
      programBytes.push(word & 0xFF);
      programBytes.push((word >> 8) & 0xFF);
    }

    for (let i = 0; i < programBytes.length; i += 60) {
      const chunk = programBytes.slice(i, i + 60);
      const header = [0x00, (i >> 8) & 0xFF, i & 0xFF];
      await this.sendCommand(PICkit2Commands.OFFLINE_WRITE, [...header, ...chunk]);
      
      bytesWritten += chunk.length;
      progressCallback(10 + (bytesWritten / totalBytes) * 60, 
        `写入程序存储器到编程器... ${Math.round((bytesWritten / totalBytes) * 100)}%`);
      
      await new Promise(resolve => setTimeout(resolve, 10));
    }

    progressCallback(70, '写入EEPROM到编程器...');
    for (let i = 0; i < eepromData.length; i += 60) {
      const chunk = eepromData.slice(i, i + 60);
      const header = [0x01, (i >> 8) & 0xFF, i & 0xFF];
      await this.sendCommand(PICkit2Commands.OFFLINE_WRITE, [...header, ...chunk]);
      
      bytesWritten += chunk.length;
      progressCallback(70 + ((i + chunk.length) / eepromData.length) * 20,
        `写入EEPROM到编程器... ${Math.round(((i + chunk.length) / eepromData.length) * 100)}%`);
      
      await new Promise(resolve => setTimeout(resolve, 10));
    }

    progressCallback(90, '写入配置位到编程器...');
    const configBytes = [];
    for (const word of configData) {
      configBytes.push(word & 0xFF);
      configBytes.push((word >> 8) & 0xFF);
    }
    await this.sendCommand(PICkit2Commands.OFFLINE_WRITE, [0x02, 0x00, 0x00, ...configBytes]);

    progressCallback(95, '验证数据完整性...');
    const status = await this.getOfflineStatus();
    
    progressCallback(100, '脱机数据写入完成');

    return {
      success: status.hasData,
      programSize: programData.length,
      eepromSize: eepromData.length,
      checksum: status.checksum
    };
  }

  async offlineRead(progressCallback) {
    const status = await this.getOfflineStatus();
    
    if (!status.hasData) {
      throw new Error('编程器中没有存储的程序数据');
    }

    const programSize = status.programSize;
    const eepromSize = status.eepromSize;

    const programData = [];
    const eepromData = [];
    const configData = [];

    progressCallback(10, '读取程序存储器...');
    for (let i = 0; i < programSize * 2; i += 60) {
      const header = [0x00, (i >> 8) & 0xFF, i & 0xFF, Math.min(60, programSize * 2 - i)];
      await this.sendCommand(PICkit2Commands.OFFLINE_READ, header);
      const data = await this.readResponse(Math.min(60, programSize * 2 - i));
      
      for (let j = 0; j < data.length; j += 2) {
        programData.push(data[j] | (data[j + 1] << 8));
      }
      
      progressCallback(10 + (i / (programSize * 2)) * 60,
        `读取程序存储器... ${Math.round((i / (programSize * 2)) * 100)}%`);
    }

    progressCallback(70, '读取EEPROM...');
    for (let i = 0; i < eepromSize; i += 60) {
      const header = [0x01, (i >> 8) & 0xFF, i & 0xFF, Math.min(60, eepromSize - i)];
      await this.sendCommand(PICkit2Commands.OFFLINE_READ, header);
      const data = await this.readResponse(Math.min(60, eepromSize - i));
      
      for (let j = 0; j < data.length; j++) {
        eepromData.push(data[j]);
      }
      
      progressCallback(70 + (i / eepromSize) * 20,
        `读取EEPROM... ${Math.round((i / eepromSize) * 100)}%`);
    }

    progressCallback(90, '读取配置位...');
    await this.sendCommand(PICkit2Commands.OFFLINE_READ, [0x02, 0x00, 0x00, 16]);
    const configRaw = await this.readResponse(16);
    for (let i = 0; i < configRaw.length; i += 2) {
      configData.push(configRaw[i] | (configRaw[i + 1] << 8));
    }

    progressCallback(100, '读取完成');

    return {
      program: programData,
      eeprom: eepromData,
      config: configData,
      checksum: status.checksum
    };
  }

  async offlineStart(progressCallback) {
    const status = await this.getOfflineStatus();
    
    if (!status.hasData) {
      throw new Error('编程器中没有存储的程序数据，请先写入脱机数据');
    }

    progressCallback(0, '开始脱机编程...');
    
    await this.sendSync();
    
    progressCallback(10, '擦除目标芯片...');
    await this.sendCommand(PICkit2Commands.OFFLINE_ERASE);
    await new Promise(resolve => setTimeout(resolve, 500));

    progressCallback(30, '写入程序...');
    await this.sendCommand(PICkit2Commands.OFFLINE_PROGRAM);
    
    let progress = 30;
    while (progress < 80) {
      await new Promise(resolve => setTimeout(resolve, 200));
      progress += 10;
      progressCallback(progress, '写入程序...');
    }

    progressCallback(80, '校验程序...');
    await this.sendCommand(PICkit2Commands.OFFLINE_VERIFY);
    await new Promise(resolve => setTimeout(resolve, 500));

    const response = await this.readResponse();
    const success = response[0] === 0x00;

    progressCallback(100, success ? '脱机编程完成' : '脱机编程失败');

    return {
      success,
      status: response[0],
      message: success ? '编程成功' : '编程失败'
    };
  }

  async offlineVerify(progressCallback) {
    progressCallback(0, '开始脱机校验...');
    
    await this.sendCommand(PICkit2Commands.OFFLINE_VERIFY);
    
    let progress = 0;
    while (progress < 90) {
      await new Promise(resolve => setTimeout(resolve, 200));
      progress += 15;
      progressCallback(progress, '校验中...');
    }

    const response = await this.readResponse();
    const match = response[0] === 0x00;

    progressCallback(100, match ? '校验通过' : '校验失败');

    return {
      success: true,
      match,
      status: response[0]
    };
  }

  async offlineCheck() {
    await this.sendCommand(PICkit2Commands.OFFLINE_CHECK);
    const response = await this.readResponse();
    
    return {
      valid: response[0] === 0x00,
      checksum: response[1] | (response[2] << 8),
      dataSize: response[3] | (response[4] << 8)
    };
  }
}

module.exports = PICkit2Protocol;
