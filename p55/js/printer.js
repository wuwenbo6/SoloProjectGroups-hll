class WebHIDPrinter {
  constructor() {
    this.device = null;
    this.connected = false;
    this.chunkDelay = 10;
  }

  async connect() {
    try {
      const devices = await navigator.hid.requestDevice({
        filters: []
      });

      if (devices.length === 0) {
        throw new Error('没有选择打印机');
      }

      this.device = devices[0];
      await this.device.open();
      
      if (!this.device.opened) {
        throw new Error('无法打开设备');
      }

      this.connected = true;
      console.log('打印机已连接:', this.device.productName);
      return this.device;
    } catch (error) {
      console.error('连接打印机失败:', error);
      throw error;
    }
  }

  async disconnect() {
    if (this.device && this.device.opened) {
      await this.device.close();
      this.connected = false;
      this.device = null;
    }
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async send(data, options = {}) {
    if (!this.connected || !this.device) {
      throw new Error('打印机未连接');
    }

    const reportId = options.reportId || 0;
    const chunkSize = options.chunkSize || 60;
    const delay = options.delay || this.chunkDelay;
    
    for (let i = 0; i < data.length; i += chunkSize) {
      const chunk = data.slice(i, i + chunkSize);
      await this.device.sendReport(reportId, chunk);
      
      if (i + chunkSize < data.length) {
        await this.sleep(delay);
      }
    }

    return true;
  }

  async sendWithDelay(data, delayMs) {
    await this.send(data);
    await this.sleep(delayMs);
  }

  async print(template, data = {}) {
    const commands = await ESCPOS.fromTemplate(template, data);
    
    const totalLength = commands.length;
    const cutPosition = Math.max(0, totalLength - 30);
    
    const printCommands = commands.slice(0, cutPosition);
    const cutCommands = commands.slice(cutPosition);
    
    await this.send(printCommands);
    await this.sleep(300);
    await this.send(cutCommands);
    await this.sleep(200);
    
    return true;
  }

  async testPrint() {
    const escpos = new ESCPOS();
    escpos.reset();
    
    escpos.setChineseMode(true);
    escpos.setCodePage(255);
    escpos.setCharacterSet(0);
    escpos.setLineSpacing(30);
    
    escpos.setAlign('center');
    escpos.setFontSize(2, 2);
    escpos.setBold(true);
    await escpos.addText('测试打印');
    escpos.newline();
    escpos.setFontSize(1, 1);
    escpos.setBold(false);
    escpos.setAlign('left');
    escpos.newline();
    
    escpos.setAlign('center');
    await escpos.addText('打印机连接成功！');
    escpos.newline();
    await escpos.addText('中文测试：你好世界');
    escpos.newline();
    await escpos.addText('时间: ' + new Date().toLocaleString());
    escpos.newline();
    escpos.printDashLine();
    escpos.setAlign('center');
    
    escpos.printBarcode('1234567890', 'CODE128', 80);
    escpos.newline();
    
    escpos.printQRCode('https://example.com', 6, 'M');
    escpos.newline();
    
    escpos.feedAndCut('full');
    
    const commands = escpos.toUint8Array();
    
    const totalLength = commands.length;
    const cutPosition = Math.max(0, totalLength - 30);
    
    const printCommands = commands.slice(0, cutPosition);
    const cutCommands = commands.slice(cutPosition);
    
    await this.send(printCommands);
    await this.sleep(400);
    await this.send(cutCommands);
    await this.sleep(200);
  }

  async openCashDrawer() {
    const escpos = new ESCPOS();
    escpos.pulse(2, 100, 200);
    await this.send(escpos.toUint8Array());
  }
}

window.WebHIDPrinter = WebHIDPrinter;
