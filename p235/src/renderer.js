class PICkit2ProgrammerUI {
  constructor() {
    this.isConnected = false;
    this.isSimulation = false;
    this.selectedDevice = null;
    this.hexData = null;
    this.hexFilePath = null;
    this.isBusy = false;
    this.deviceList = [];
    
    this.initElements();
    this.initEventListeners();
    this.initProgressListener();
  }

  initElements() {
    this.connectBtn = document.getElementById('connectBtn');
    this.connectionStatus = document.getElementById('connectionStatus');
    this.statusDot = this.connectionStatus.querySelector('.status-dot');
    this.statusText = this.connectionStatus.querySelector('.status-text');
    
    this.deviceInfo = document.getElementById('deviceInfo');
    this.deviceSelect = document.getElementById('deviceSelect');
    this.deviceDetails = document.getElementById('deviceDetails');
    
    this.readChipIDBtn = document.getElementById('readChipIDBtn');
    this.verifyChipIDBtn = document.getElementById('verifyChipIDBtn');
    this.chipIDInfo = document.getElementById('chipIDInfo');
    
    this.fileDropZone = document.getElementById('fileDropZone');
    this.fileInput = document.getElementById('fileInput');
    this.hexInfo = document.getElementById('hexInfo');
    
    this.progressFill = document.getElementById('progressFill');
    this.progressText = document.getElementById('progressText');
    
    this.eraseBtn = document.getElementById('eraseBtn');
    this.programBtn = document.getElementById('programBtn');
    this.verifyBtn = document.getElementById('verifyBtn');
    this.readBtn = document.getElementById('readBtn');
    this.autoBtn = document.getElementById('autoBtn');
    
    this.offlineStatus = document.getElementById('offlineStatus');
    this.offlineEraseBtn = document.getElementById('offlineEraseBtn');
    this.offlineWriteBtn = document.getElementById('offlineWriteBtn');
    this.offlineReadBtn = document.getElementById('offlineReadBtn');
    this.offlineStatusBtn = document.getElementById('offlineStatusBtn');
    this.offlineStartBtn = document.getElementById('offlineStartBtn');
    this.offlineVerifyBtn = document.getElementById('offlineVerifyBtn');
    
    this.logContainer = document.getElementById('logContainer');
    
    this.currentChipID = null;
    this.offlineHasData = false;
  }

  initEventListeners() {
    this.connectBtn.addEventListener('click', () => this.toggleConnection());
    
    this.deviceSelect.addEventListener('change', (e) => this.onDeviceSelect(e));
    
    this.fileDropZone.addEventListener('click', () => this.fileInput.click());
    this.fileInput.addEventListener('change', (e) => this.handleFileSelect(e));
    
    this.fileDropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      this.fileDropZone.classList.add('dragover');
    });
    
    this.fileDropZone.addEventListener('dragleave', () => {
      this.fileDropZone.classList.remove('dragover');
    });
    
    this.fileDropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      this.fileDropZone.classList.remove('dragover');
      const files = e.dataTransfer.files;
      if (files.length > 0) {
        this.loadHexFile(files[0]);
      }
    });
    
    this.eraseBtn.addEventListener('click', () => this.eraseDevice());
    this.programBtn.addEventListener('click', () => this.programDevice());
    this.verifyBtn.addEventListener('click', () => this.verifyDevice());
    this.readBtn.addEventListener('click', () => this.readDevice());
    this.autoBtn.addEventListener('click', () => this.autoProgram());
    
    this.readChipIDBtn.addEventListener('click', () => this.readChipID());
    this.verifyChipIDBtn.addEventListener('click', () => this.verifyChipID());
    
    this.offlineEraseBtn.addEventListener('click', () => this.offlineErase());
    this.offlineWriteBtn.addEventListener('click', () => this.offlineWrite());
    this.offlineReadBtn.addEventListener('click', () => this.offlineRead());
    this.offlineStatusBtn.addEventListener('click', () => this.getOfflineStatus());
    this.offlineStartBtn.addEventListener('click', () => this.offlineStart());
    this.offlineVerifyBtn.addEventListener('click', () => this.offlineVerify());
  }

  initProgressListener() {
    window.api.onProgramProgress((data) => {
      this.updateProgress(data.progress, data.message);
    });
  }

  log(message, type = 'info') {
    const time = new Date().toLocaleTimeString();
    const entry = document.createElement('div');
    entry.className = `log-entry ${type}`;
    entry.innerHTML = `
      <span class="log-time">[${time}]</span>
      <span class="log-message">${message}</span>
    `;
    this.logContainer.appendChild(entry);
    this.logContainer.scrollTop = this.logContainer.scrollHeight;
  }

  updateProgress(progress, message) {
    this.progressFill.style.width = `${progress}%`;
    this.progressText.textContent = message;
  }

  setBusy(busy) {
    this.isBusy = busy;
    
    this.connectBtn.disabled = busy;
    this.deviceSelect.disabled = busy || !this.isConnected;
    this.fileDropZone.style.pointerEvents = busy ? 'none' : 'auto';
    
    const hasHex = this.hexData !== null;
    const hasDevice = this.selectedDevice !== null;
    
    this.eraseBtn.disabled = busy || !this.isConnected || !hasDevice;
    this.programBtn.disabled = busy || !this.isConnected || !hasDevice || !hasHex;
    this.verifyBtn.disabled = busy || !this.isConnected || !hasDevice || !hasHex;
    this.readBtn.disabled = busy || !this.isConnected || !hasDevice;
    this.autoBtn.disabled = busy || !this.isConnected || !hasDevice || !hasHex;
    
    this.readChipIDBtn.disabled = busy || !this.isConnected || !hasDevice;
    this.verifyChipIDBtn.disabled = busy || !this.isConnected || !hasDevice;
    
    this.offlineEraseBtn.disabled = busy || !this.isConnected;
    this.offlineWriteBtn.disabled = busy || !this.isConnected || !hasDevice || !hasHex;
    this.offlineReadBtn.disabled = busy || !this.isConnected || !this.offlineHasData;
    this.offlineStatusBtn.disabled = busy || !this.isConnected;
    this.offlineStartBtn.disabled = busy || !this.isConnected || !this.offlineHasData || !hasDevice;
    this.offlineVerifyBtn.disabled = busy || !this.isConnected || !this.offlineHasData || !hasDevice;
  }

  async toggleConnection() {
    if (this.isConnected) {
      await this.disconnect();
    } else {
      await this.connect();
    }
  }

  async connect() {
    this.log('正在连接PICkit2...', 'info');
    this.setBusy(true);
    
    try {
      const result = await window.api.connectDevice();
      
      if (result.success) {
        this.isConnected = true;
        this.isSimulation = result.simulation;
        
        if (this.isSimulation) {
          this.statusDot.className = 'status-dot simulation';
          this.statusText.textContent = '模拟模式';
          this.log('已进入模拟模式（未检测到硬件）', 'warning');
        } else {
          this.statusDot.className = 'status-dot connected';
          this.statusText.textContent = '已连接';
          this.log('PICkit2连接成功!', 'success');
        }
        
        this.connectBtn.textContent = '断开连接';
        
        this.deviceInfo.innerHTML = `
          <p><strong>设备:</strong> ${result.info.deviceName}</p>
          <p><strong>固件版本:</strong> ${result.info.firmwareVersion}</p>
          ${result.info.hardwareVersion !== 'N/A' ? `<p><strong>硬件版本:</strong> ${result.info.hardwareVersion}</p>` : ''}
        `;
        
        await this.loadDeviceList();
        await this.getOfflineStatus();
      } else {
        this.log('连接失败', 'error');
      }
    } catch (error) {
      this.log(`连接错误: ${error.message}`, 'error');
    }
    
    this.setBusy(false);
  }

  async disconnect() {
    this.log('正在断开连接...', 'info');
    
    try {
      await window.api.disconnectDevice();
      
      this.isConnected = false;
      this.isSimulation = false;
      this.selectedDevice = null;
      
      this.statusDot.className = 'status-dot disconnected';
      this.statusText.textContent = '未连接';
      this.connectBtn.textContent = '连接设备';
      
      this.deviceInfo.innerHTML = '<p class="text-muted">点击连接按钮连接PICkit2编程器</p>';
      
      this.deviceSelect.innerHTML = '<option value="">请先连接设备...</option>';
      this.deviceSelect.disabled = true;
      
      this.deviceDetails.innerHTML = '<p class="text-muted">选择设备后显示详细信息</p>';
      
      this.chipIDInfo.innerHTML = '<p class="text-muted">未读取芯片ID</p>';
      this.currentChipID = null;
      
      this.offlineStatus.className = 'offline-status empty';
      this.offlineStatus.innerHTML = '<p class="text-muted">编程器存储状态: 空</p>';
      this.offlineHasData = false;
      
      this.log('已断开连接', 'info');
    } catch (error) {
      this.log(`断开连接错误: ${error.message}`, 'error');
    }
    
    this.setBusy(false);
    this.updateButtons();
  }

  async loadDeviceList() {
    try {
      const result = await window.api.getDeviceList();
      
      if (result.success) {
        this.deviceList = result.devices;
        
        this.deviceSelect.innerHTML = '<option value="">选择目标设备...</option>';
        result.devices.forEach((device, index) => {
          const option = document.createElement('option');
          option.value = index;
          option.textContent = device.name;
          this.deviceSelect.appendChild(option);
        });
        
        this.deviceSelect.disabled = false;
        this.log(`已加载 ${result.devices.length} 个支持的设备`, 'info');
      }
    } catch (error) {
      this.log(`加载设备列表错误: ${error.message}`, 'error');
    }
  }

  onDeviceSelect(e) {
    const index = parseInt(e.target.value);
    
    if (isNaN(index)) {
      this.selectedDevice = null;
      this.deviceDetails.innerHTML = '<p class="text-muted">选择设备后显示详细信息</p>';
    } else {
      this.selectedDevice = this.deviceList[index];
      window.api.setTargetDevice(this.selectedDevice);
      
      this.deviceDetails.innerHTML = `
        <p><strong>系列:</strong> ${this.selectedDevice.family}</p>
        <p><strong>程序存储器:</strong> ${this.selectedDevice.programSize} 字 (${(this.selectedDevice.programSize * 2 / 1024).toFixed(1)} KB)</p>
        <p><strong>EEPROM:</strong> ${this.selectedDevice.eepromSize} 字节</p>
        <p><strong>预期芯片ID:</strong> 0x${this.selectedDevice.chipID.toString(16).toUpperCase().padStart(4, '0')}</p>
      `;
      
      this.log(`已选择目标设备: ${this.selectedDevice.name}`, 'info');
    }
    
    this.updateButtons();
  }

  handleFileSelect(e) {
    const file = e.target.files[0];
    if (file) {
      this.loadHexFile(file);
    }
  }

  async loadHexFile(file) {
    if (!file.name.toLowerCase().endsWith('.hex')) {
      this.log('请选择.hex格式的文件', 'error');
      return;
    }
    
    this.log(`正在加载HEX文件: ${file.name}...`, 'info');
    
    try {
      const result = await window.api.parseHex(file.path);
      
      if (result.success) {
        this.hexData = result.data;
        this.hexFilePath = file.path;
        
        const programSize = result.data.program ? result.data.program.length : 0;
        const eepromSize = result.data.eeprom ? result.data.eeprom.length : 0;
        
        this.hexInfo.innerHTML = `
          <p><strong>文件名:</strong> ${file.name}</p>
          <p><strong>程序存储器:</strong> ${programSize} 字</p>
          <p><strong>EEPROM:</strong> ${eepromSize} 字节</p>
          ${result.data.minAddress !== Infinity ? `<p><strong>地址范围:</strong> 0x${result.data.minAddress.toString(16).toUpperCase()} - 0x${result.data.maxAddress.toString(16).toUpperCase()}</p>` : ''}
        `;
        
        this.log(`HEX文件加载成功! 程序: ${programSize} 字, EEPROM: ${eepromSize} 字节`, 'success');
      } else {
        this.log(`解析HEX文件失败: ${result.error}`, 'error');
        this.hexInfo.innerHTML = `<p style="color: var(--danger-color);">解析失败: ${result.error}</p>`;
      }
    } catch (error) {
      this.log(`加载HEX文件错误: ${error.message}`, 'error');
    }
    
    this.updateButtons();
  }

  updateButtons() {
    const hasHex = this.hexData !== null;
    const hasDevice = this.selectedDevice !== null;
    
    this.eraseBtn.disabled = this.isBusy || !this.isConnected || !hasDevice;
    this.programBtn.disabled = this.isBusy || !this.isConnected || !hasDevice || !hasHex;
    this.verifyBtn.disabled = this.isBusy || !this.isConnected || !hasDevice || !hasHex;
    this.readBtn.disabled = this.isBusy || !this.isConnected || !hasDevice;
    this.autoBtn.disabled = this.isBusy || !this.isConnected || !hasDevice || !hasHex;
  }

  async eraseDevice() {
    if (!this.confirmAction('确定要擦除设备吗？')) return;
    
    this.log('开始擦除设备...', 'info');
    this.setBusy(true);
    this.updateProgress(0, '准备擦除...');
    
    try {
      const result = await window.api.eraseDevice();
      
      if (result.success) {
        this.log('设备擦除成功!', 'success');
        this.updateProgress(100, '擦除完成');
      } else {
        this.log(`擦除失败: ${result.error}`, 'error');
      }
    } catch (error) {
      this.log(`擦除错误: ${error.message}`, 'error');
    }
    
    this.setBusy(false);
  }

  async programDevice() {
    if (!this.confirmAction('确定要烧录设备吗？')) return;
    
    this.log('开始烧录设备...', 'info');
    this.setBusy(true);
    this.updateProgress(0, '准备烧录...');
    
    try {
      const result = await window.api.programDevice(this.hexData);
      
      if (result.success) {
        this.log('设备烧录成功!', 'success');
        this.updateProgress(100, '烧录完成');
      } else {
        this.log(`烧录失败: ${result.error}`, 'error');
      }
    } catch (error) {
      this.log(`烧录错误: ${error.message}`, 'error');
    }
    
    this.setBusy(false);
  }

  async verifyDevice() {
    this.log('开始校验设备...', 'info');
    this.setBusy(true);
    this.updateProgress(0, '准备校验...');
    
    try {
      const result = await window.api.verifyDevice(this.hexData);
      
      if (result.success) {
        if (result.match) {
          this.log('校验通过! 数据匹配', 'success');
          this.updateProgress(100, '校验通过');
        } else {
          this.log('校验失败! 数据不匹配', 'error');
          this.updateProgress(100, '校验失败');
        }
      } else {
        this.log(`校验失败: ${result.error}`, 'error');
      }
    } catch (error) {
      this.log(`校验错误: ${error.message}`, 'error');
    }
    
    this.setBusy(false);
  }

  async readDevice() {
    this.log('开始读取设备...', 'info');
    this.setBusy(true);
    this.updateProgress(0, '准备读取...');
    
    try {
      const result = await window.api.readDevice();
      
      if (result.success) {
        const programSize = result.data.program ? result.data.program.length : 0;
        const eepromSize = result.data.eeprom ? result.data.eeprom.length : 0;
        this.log(`设备读取成功! 程序: ${programSize} 字, EEPROM: ${eepromSize} 字节`, 'success');
        this.updateProgress(100, '读取完成');
      } else {
        this.log(`读取失败: ${result.error}`, 'error');
      }
    } catch (error) {
      this.log(`读取错误: ${error.message}`, 'error');
    }
    
    this.setBusy(false);
  }

  async autoProgram() {
    if (!this.confirmAction('确定要执行自动编程（擦除+烧录+校验）吗？')) return;
    
    this.log('开始自动编程...', 'info');
    this.setBusy(true);
    
    try {
      this.log('步骤 1/3: 擦除设备...', 'info');
      let result = await window.api.eraseDevice();
      
      if (!result.success) {
        throw new Error(`擦除失败: ${result.error}`);
      }
      
      this.log('步骤 2/3: 烧录设备...', 'info');
      result = await window.api.programDevice(this.hexData);
      
      if (!result.success) {
        throw new Error(`烧录失败: ${result.error}`);
      }
      
      this.log('步骤 3/3: 校验设备...', 'info');
      result = await window.api.verifyDevice(this.hexData);
      
      if (!result.success) {
        throw new Error(`校验失败: ${result.error}`);
      }
      
      if (result.match) {
        this.log('自动编程完成! 所有步骤成功', 'success');
        this.updateProgress(100, '自动编程完成');
      } else {
        this.log('自动编程完成，但校验失败!', 'error');
        this.updateProgress(100, '校验失败');
      }
    } catch (error) {
      this.log(`自动编程错误: ${error.message}`, 'error');
    }
    
    this.setBusy(false);
  }

  confirmAction(message) {
    return true;
  }

  async readChipID() {
    this.log('开始读取芯片ID...', 'info');
    this.setBusy(true);
    this.updateProgress(0, '准备读取...');
    
    try {
      const result = await window.api.readChipID();
      
      if (result.success) {
        this.currentChipID = result.chipID;
        this.chipIDInfo.innerHTML = `
          <p><strong>芯片ID:</strong> <span class="chip-id-value">${result.chipID.hexID}</span></p>
          <p><strong>设备ID:</strong> 0x${result.chipID.deviceID.toString(16).toUpperCase().padStart(4, '0')}</p>
          <p><strong>版本号:</strong> 0x${result.chipID.revision.toString(16).toUpperCase().padStart(4, '0')}</p>
        `;
        this.log(`芯片ID读取成功! ID: ${result.chipID.hexID}`, 'success');
        this.updateProgress(100, '读取完成');
      } else {
        this.log(`读取芯片ID失败: ${result.error}`, 'error');
        this.chipIDInfo.innerHTML = `<p style="color: var(--danger-color);">读取失败: ${result.error}</p>`;
      }
    } catch (error) {
      this.log(`读取芯片ID错误: ${error.message}`, 'error');
      this.chipIDInfo.innerHTML = `<p style="color: var(--danger-color);">读取错误: ${error.message}</p>`;
    }
    
    this.setBusy(false);
  }

  async verifyChipID() {
    if (!this.selectedDevice) {
      this.log('请先选择目标设备', 'error');
      return;
    }
    
    const expectedID = this.selectedDevice.chipID;
    this.log(`开始验证芯片ID，预期: 0x${expectedID.toString(16).toUpperCase().padStart(4, '0')}...`, 'info');
    this.setBusy(true);
    this.updateProgress(0, '准备验证...');
    
    try {
      const result = await window.api.verifyChipID(expectedID);
      
      if (result.success) {
        this.currentChipID = result.chipID;
        
        if (result.match) {
          this.chipIDInfo.innerHTML = `
            <p><strong>芯片ID:</strong> <span class="chip-id-value">${result.chipID.hexID}</span></p>
            <p><strong>预期ID:</strong> 0x${expectedID.toString(16).toUpperCase().padStart(4, '0')}</p>
            <p style="color: var(--success-color);"><strong>✓ 芯片ID匹配!</strong></p>
          `;
          this.log(`芯片ID验证通过! 实际: ${result.chipID.hexID}, 预期: 0x${expectedID.toString(16).toUpperCase().padStart(4, '0')}`, 'success');
          this.updateProgress(100, '验证通过');
        } else {
          this.chipIDInfo.innerHTML = `
            <p><strong>芯片ID:</strong> <span class="chip-id-mismatch">${result.chipID.hexID}</span></p>
            <p><strong>预期ID:</strong> 0x${expectedID.toString(16).toUpperCase().padStart(4, '0')}</p>
            <p style="color: var(--danger-color);"><strong>✗ 芯片ID不匹配!</strong></p>
          `;
          this.log(`芯片ID验证失败! 实际: ${result.chipID.hexID}, 预期: 0x${expectedID.toString(16).toUpperCase().padStart(4, '0')}`, 'error');
          this.updateProgress(100, '验证失败');
        }
      } else {
        this.log(`验证芯片ID失败: ${result.error}`, 'error');
        this.chipIDInfo.innerHTML = `<p style="color: var(--danger-color);">验证失败: ${result.error}</p>`;
      }
    } catch (error) {
      this.log(`验证芯片ID错误: ${error.message}`, 'error');
      this.chipIDInfo.innerHTML = `<p style="color: var(--danger-color);">验证错误: ${error.message}</p>`;
    }
    
    this.setBusy(false);
  }

  async getOfflineStatus() {
    try {
      const result = await window.api.getOfflineStatus();
      
      if (result.success) {
        this.offlineHasData = result.status.hasData;
        
        if (result.status.hasData) {
          this.offlineStatus.className = 'offline-status has-data';
          this.offlineStatus.innerHTML = `
            <p><strong>编程器存储状态:</strong> <span style="color: var(--success-color);">有数据</span></p>
            <p><strong>程序大小:</strong> ${result.status.programSize} 字</p>
            <p><strong>EEPROM大小:</strong> ${result.status.eepromSize} 字节</p>
            <p><strong>校验和:</strong> 0x${result.status.checksum.toString(16).toUpperCase().padStart(4, '0')}</p>
          `;
        } else {
          this.offlineStatus.className = 'offline-status empty';
          this.offlineStatus.innerHTML = '<p><strong>编程器存储状态:</strong> <span style="color: var(--warning-color);">空</span></p>';
        }
        
        this.setBusy(false);
        return result.status;
      }
    } catch (error) {
      this.log(`获取脱机状态错误: ${error.message}`, 'error');
    }
    return null;
  }

  async offlineErase() {
    if (!this.confirmAction('确定要擦除编程器内部存储吗？')) return;
    
    this.log('开始擦除编程器内部存储...', 'info');
    this.setBusy(true);
    this.updateProgress(0, '准备擦除...');
    
    try {
      const result = await window.api.offlineErase();
      
      if (result.success) {
        this.log('编程器内部存储擦除成功!', 'success');
        this.updateProgress(100, '擦除完成');
        await this.getOfflineStatus();
      } else {
        this.log(`擦除失败: ${result.error}`, 'error');
      }
    } catch (error) {
      this.log(`擦除编程器存储错误: ${error.message}`, 'error');
    }
    
    this.setBusy(false);
  }

  async offlineWrite() {
    if (!this.confirmAction('确定要将HEX数据写入编程器内部存储吗？')) return;
    
    this.log('开始写入脱机数据到编程器...', 'info');
    this.setBusy(true);
    this.updateProgress(0, '准备写入...');
    
    try {
      const result = await window.api.offlineWrite(this.hexData);
      
      if (result.success) {
        this.log(`脱机数据写入成功! 程序: ${result.programSize} 字, EEPROM: ${result.eepromSize} 字节`, 'success');
        this.updateProgress(100, '写入完成');
        await this.getOfflineStatus();
      } else {
        this.log(`写入失败: ${result.error}`, 'error');
      }
    } catch (error) {
      this.log(`写入脱机数据错误: ${error.message}`, 'error');
    }
    
    this.setBusy(false);
  }

  async offlineRead() {
    this.log('开始从编程器读取脱机数据...', 'info');
    this.setBusy(true);
    this.updateProgress(0, '准备读取...');
    
    try {
      const result = await window.api.offlineRead();
      
      if (result.success) {
        const programSize = result.data.program ? result.data.program.length : 0;
        const eepromSize = result.data.eeprom ? result.data.eeprom.length : 0;
        this.log(`脱机数据读取成功! 程序: ${programSize} 字, EEPROM: ${eepromSize} 字节`, 'success');
        this.updateProgress(100, '读取完成');
        
        this.hexData = result.data;
        this.hexInfo.innerHTML = `
          <p><strong>来源:</strong> 编程器内部存储</p>
          <p><strong>程序存储器:</strong> ${programSize} 字</p>
          <p><strong>EEPROM:</strong> ${eepromSize} 字节</p>
        `;
        
        this.setBusy(false);
        this.updateButtons();
      } else {
        this.log(`读取失败: ${result.error}`, 'error');
      }
    } catch (error) {
      this.log(`读取脱机数据错误: ${error.message}`, 'error');
    }
    
    this.setBusy(false);
  }

  async offlineStart() {
    if (!this.confirmAction('确定要开始脱机编程吗？\n这将擦除目标芯片并写入编程器中的数据。')) return;
    
    this.log('开始脱机编程...', 'info');
    this.setBusy(true);
    this.updateProgress(0, '准备编程...');
    
    try {
      const result = await window.api.offlineStart();
      
      if (result.success) {
        this.log(`脱机编程完成! ${result.message || ''}`, 'success');
        this.updateProgress(100, '编程完成');
      } else {
        this.log(`脱机编程失败: ${result.error || result.message}`, 'error');
        this.updateProgress(100, '编程失败');
      }
    } catch (error) {
      this.log(`脱机编程错误: ${error.message}`, 'error');
    }
    
    this.setBusy(false);
  }

  async offlineVerify() {
    this.log('开始脱机校验...', 'info');
    this.setBusy(true);
    this.updateProgress(0, '准备校验...');
    
    try {
      const result = await window.api.offlineVerify();
      
      if (result.success) {
        if (result.match) {
          this.log('脱机校验通过! 数据匹配', 'success');
          this.updateProgress(100, '校验通过');
        } else {
          this.log('脱机校验失败! 数据不匹配', 'error');
          this.updateProgress(100, '校验失败');
        }
      } else {
        this.log(`脱机校验失败: ${result.error}`, 'error');
      }
    } catch (error) {
      this.log(`脱机校验错误: ${error.message}`, 'error');
    }
    
    this.setBusy(false);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  new PICkit2ProgrammerUI();
});
