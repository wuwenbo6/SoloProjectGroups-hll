const { ipcRenderer } = require('electron');

class ESCPOS {
  constructor() {
    this.commands = [];
    this.useNativeEncoding = true;
  }

  reset() {
    this.commands = [];
    this.add(0x1B, 0x40);
    return this;
  }

  add(...bytes) {
    this.commands.push(...bytes);
    return this;
  }

  async addText(text) {
    if (this.useNativeEncoding && ipcRenderer) {
      try {
        const bytes = await ipcRenderer.invoke('encode-gb18030', text);
        this.commands.push(...bytes);
        return this;
      } catch (error) {
        console.warn('使用内置编码回退:', error);
      }
    }
    
    const bytes = this.encodeGB18030(text);
    this.commands.push(...bytes);
    return this;
  }

  addTextSync(text) {
    const bytes = this.encodeGB18030(text);
    this.commands.push(...bytes);
    return this;
  }

  encodeGB18030(text) {
    const bytes = [];
    for (let i = 0; i < text.length; i++) {
      const code = text.charCodeAt(i);
      
      if (code <= 0x7F) {
        bytes.push(code);
      } else if (code >= 0x4E00 && code <= 0x9FA5) {
        const gbCode = this.unicodeToGB(code);
        if (gbCode) {
          bytes.push((gbCode >> 8) & 0xFF);
          bytes.push(gbCode & 0xFF);
        } else {
          bytes.push(0x3F);
        }
      } else {
        const gbCode = this.unicodeToGB(code);
        if (gbCode) {
          if (gbCode > 0xFFFF) {
            bytes.push((gbCode >> 16) & 0xFF);
            bytes.push((gbCode >> 8) & 0xFF);
            bytes.push(gbCode & 0xFF);
            bytes.push(0x00);
          } else {
            bytes.push((gbCode >> 8) & 0xFF);
            bytes.push(gbCode & 0xFF);
          }
        } else {
          bytes.push(0x3F);
        }
      }
    }
    return bytes;
  }

  unicodeToGB(unicode) {
    if (unicode <= 0x7F) {
      return unicode;
    }
    
    if (this.gbTable && this.gbTable[unicode]) {
      return this.gbTable[unicode];
    }
    
    if (unicode >= 0x4E00 && unicode <= 0x9FA5) {
      const offset = unicode - 0x4E00;
      const row = Math.floor(offset / 94) + 0xB0;
      const col = (offset % 94) + 0xA1;
      if (row >= 0xB0 && row <= 0xF7 && col >= 0xA1 && col <= 0xFE) {
        return (row << 8) | col;
      }
    }
    
    return null;
  }

  setChineseMode(enable = true) {
    if (enable) {
      this.add(0x1C, 0x26);
    } else {
      this.add(0x1C, 0x2E);
    }
    return this;
  }

  setCharacterSet(charset = 0) {
    this.add(0x1B, 0x52, charset);
    return this;
  }

  setCodePage(page = 0) {
    this.add(0x1B, 0x74, page);
    return this;
  }

  newline() {
    this.add(0x0A);
    return this;
  }

  setAlign(align = 'left') {
    const alignMap = { left: 0, center: 1, right: 2 };
    this.add(0x1B, 0x61, alignMap[align] || 0);
    return this;
  }

  setFontSize(width = 1, height = 1) {
    const size = ((width - 1) << 4) | (height - 1);
    this.add(0x1D, 0x21, size);
    return this;
  }

  setBold(enable = true) {
    this.add(0x1B, 0x45, enable ? 1 : 0);
    return this;
  }

  setLineSpacing(spacing = 30) {
    this.add(0x1B, 0x33, spacing);
    return this;
  }

  printLine(text, options = {}) {
    if (options.align) this.setAlign(options.align);
    if (options.bold) this.setBold(true);
    if (options.size) this.setFontSize(options.size.width || 1, options.size.height || 1);
    this.addTextSync(text);
    this.newline();
    this.setAlign('left');
    this.setBold(false);
    this.setFontSize(1, 1);
    return this;
  }

  printDashLine() {
    this.addTextSync('--------------------------------');
    this.newline();
    return this;
  }

  printBarcode(code, type = 'CODE128', height = 80) {
    const typeMap = {
      'UPC-A': 0, 'UPC-E': 1, 'JAN13': 2, 'JAN8': 3,
      'CODE39': 4, 'ITF': 5, 'CODABAR': 6, 'CODE93': 7, 'CODE128': 8
    };
    
    this.add(0x1D, 0x68, height);
    this.add(0x1D, 0x77, 2);
    this.add(0x1D, 0x48, 2);
    this.add(0x1D, 0x6B, typeMap[type] || 8);
    
    if (type === 'CODE128') {
      this.add(code.length);
    }
    
    this.addTextSync(code);
    
    if (type !== 'CODE128') {
      this.add(0x00);
    }
    
    this.newline();
    return this;
  }

  printQRCode(text, size = 8, errorLevel = 'M') {
    const levelMap = { 'L': 48, 'M': 49, 'Q': 50, 'H': 51 };
    
    const len = text.length;
    const pL = len & 0xFF;
    const pH = (len >> 8) & 0xFF;
    
    this.add(0x1D, 0x28, 0x6B, 0x04, 0x00, 0x31, 0x41, size, 0x00);
    this.add(0x1D, 0x28, 0x6B, 0x03, 0x00, 0x31, 0x45, levelMap[errorLevel] || 49);
    this.add(0x1D, 0x28, 0x6B, pL + 3, pH, 0x31, 0x50, 0x30);
    this.addTextSync(text);
    this.add(0x1D, 0x28, 0x6B, 0x03, 0x00, 0x31, 0x51, 0x30);
    this.newline();
    return this;
  }

  feed(lines = 3) {
    for (let i = 0; i < lines; i++) {
      this.newline();
    }
    return this;
  }

  feedAndCut(mode = 'full') {
    this.feed(5);
    
    this.add(0x1D, 0x56, mode === 'partial' ? 66 : 65, 3);
    
    return this;
  }

  cut(mode = 'full') {
    this.add(0x1D, 0x56, mode === 'partial' ? 66 : 65, 0);
    return this;
  }

  pulse(pin = 2, onTime = 100, offTime = 200) {
    const t1 = Math.min(255, Math.floor(onTime / 2));
    const t2 = Math.min(255, Math.floor(offTime / 2));
    this.add(0x1B, 0x70, pin, t1, t2);
    return this;
  }

  toUint8Array() {
    return new Uint8Array(this.commands);
  }

  static async fromTemplate(template, data = {}) {
    const escpos = new ESCPOS();
    escpos.reset();
    
    escpos.setChineseMode(true);
    escpos.setCodePage(255);
    escpos.setCharacterSet(0);
    escpos.setLineSpacing(30);
    
    escpos.setAlign('center');
    escpos.setFontSize(2, 2);
    escpos.setBold(true);

    for (const item of template.items) {
      const value = item.content || '';
      switch (item.type) {
        case 'title':
          escpos.setAlign(item.align || 'center');
          escpos.setFontSize(item.width || 2, item.height || 2);
          escpos.setBold(true);
          await escpos.addText(value);
          escpos.newline();
          escpos.setFontSize(1, 1);
          escpos.setBold(false);
          escpos.setAlign('left');
          break;
        case 'text':
          escpos.setAlign(item.align || 'left');
          if (item.bold) escpos.setBold(true);
          await escpos.addText(value);
          escpos.newline();
          if (item.bold) escpos.setBold(false);
          escpos.setAlign('left');
          break;
        case 'line':
          escpos.printDashLine();
          break;
        case 'space':
          for (let i = 0; i < (item.lines || 1); i++) {
            escpos.newline();
          }
          break;
        case 'barcode':
          escpos.setAlign('center');
          escpos.printBarcode(value, item.format || 'CODE128', item.height || 80);
          escpos.setAlign('left');
          break;
        case 'qrcode':
          escpos.setAlign('center');
          escpos.printQRCode(value, item.size || 8, item.errorLevel || 'M');
          escpos.setAlign('left');
          break;
      }
    }

    escpos.feedAndCut('full');
    return escpos.toUint8Array();
  }
}

window.ESCPOS = ESCPOS;
