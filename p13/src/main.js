const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const usb = require('usb');

const MAX_PACKET_BUFFER = 100000;
const BATCH_SIZE = 100;

let usbAddon;
try {
  const addonPath = path.join(__dirname, '..', 'build', 'Release', 'usb-monitor.node');
  if (fs.existsSync(addonPath)) {
    usbAddon = require(addonPath);
    console.log('C++ addon loaded successfully');
  } else {
    console.log('C++ addon not found, using fallback');
    usbAddon = null;
  }
} catch (e) {
  console.log('C++ addon not loaded, using fallback:', e.message);
  usbAddon = null;
}

let mainWindow;
let capturedPackets = [];
let isCapturing = false;
let packetBatch = [];
let batchTimer = null;

function parseSetupPacket(data) {
  if (!data || data.length < 8) return null;
  
  const bmRequestType = data[0];
  const bRequest = data[1];
  const wValue = data[2] | (data[3] << 8);
  const wIndex = data[4] | (data[5] << 8);
  const wLength = data[6] | (data[7] << 8);
  
  const USB_DIR_MASK = 0x80;
  const USB_DIR_IN = 0x80;
  
  const direction = (bmRequestType & USB_DIR_MASK) === USB_DIR_IN ? 'in' : 'out';
  
  return {
    bmRequestType,
    bRequest,
    wValue,
    wIndex,
    wLength,
    direction,
    requestType: (bmRequestType >> 5) & 0x03,
    recipient: bmRequestType & 0x1f
  };
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  mainWindow.webContents.openDevTools();
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

ipcMain.handle('get-devices', () => {
  const devices = usb.getDeviceList();
  return devices.map(device => {
    try {
      device.open();
      const descriptor = device.deviceDescriptor;
      const configDescriptor = device.configDescriptor;
      
      const result = {
        busNumber: device.busNumber,
        deviceAddress: device.deviceAddress,
        vendorId: descriptor.idVendor,
        productId: descriptor.idProduct,
        deviceDescriptor: {
          bLength: descriptor.bLength,
          bDescriptorType: descriptor.bDescriptorType,
          bcdUSB: descriptor.bcdUSB,
          bDeviceClass: descriptor.bDeviceClass,
          bDeviceSubClass: descriptor.bDeviceSubClass,
          bDeviceProtocol: descriptor.bDeviceProtocol,
          bMaxPacketSize0: descriptor.bMaxPacketSize0,
          idVendor: `0x${descriptor.idVendor.toString(16).padStart(4, '0')}`,
          idProduct: `0x${descriptor.idProduct.toString(16).padStart(4, '0')}`,
          bcdDevice: descriptor.bcdDevice,
          iManufacturer: descriptor.iManufacturer,
          iProduct: descriptor.iProduct,
          iSerialNumber: descriptor.iSerialNumber,
          bNumConfigurations: descriptor.bNumConfigurations
        },
        configDescriptor: configDescriptor ? {
          bLength: configDescriptor.bLength,
          bDescriptorType: configDescriptor.bDescriptorType,
          wTotalLength: configDescriptor.wTotalLength,
          bNumInterfaces: configDescriptor.bNumInterfaces,
          bConfigurationValue: configDescriptor.bConfigurationValue,
          iConfiguration: configDescriptor.iConfiguration,
          bmAttributes: configDescriptor.bmAttributes,
          bMaxPower: configDescriptor.bMaxPower,
          interfaces: configDescriptor.interfaces?.map(iface => ({
            bInterfaceNumber: iface[0]?.bInterfaceNumber,
            bAlternateSetting: iface[0]?.bAlternateSetting,
            bNumEndpoints: iface[0]?.bNumEndpoints,
            bInterfaceClass: iface[0]?.bInterfaceClass,
            bInterfaceSubClass: iface[0]?.bInterfaceSubClass,
            bInterfaceProtocol: iface[0]?.bInterfaceProtocol,
            iInterface: iface[0]?.iInterface,
            endpoints: iface[0]?.endpoints?.map(ep => ({
              bLength: ep.bLength,
              bDescriptorType: ep.bDescriptorType,
              bEndpointAddress: ep.bEndpointAddress,
              bmAttributes: ep.bmAttributes,
              wMaxPacketSize: ep.wMaxPacketSize,
              bInterval: ep.bInterval
            }))
          }))
        } : null
      };
      
      device.close();
      return result;
    } catch (e) {
      return {
        busNumber: device.busNumber,
        deviceAddress: device.deviceAddress,
        vendorId: device.deviceDescriptor.idVendor,
        productId: device.deviceDescriptor.idProduct,
        error: e.message
      };
    }
  });
});

function flushPacketBatch() {
  if (packetBatch.length === 0 || !mainWindow) return;
  
  mainWindow.webContents.send('urb-batch', packetBatch);
  packetBatch = [];
}

function addPacketToBatch(packet) {
  if (capturedPackets.length >= MAX_PACKET_BUFFER) {
    capturedPackets.shift();
  }
  capturedPackets.push(packet);
  
  packetBatch.push(packet);
  
  if (packetBatch.length >= BATCH_SIZE) {
    flushPacketBatch();
  } else if (!batchTimer) {
    batchTimer = setTimeout(flushPacketBatch, 16);
  }
}

ipcMain.handle('start-capture', (event, deviceFilter) => {
  if (isCapturing) return { success: false, message: 'Already capturing' };
  
  isCapturing = true;
  capturedPackets = [];
  packetBatch = [];
  
  if (batchTimer) {
    clearTimeout(batchTimer);
    batchTimer = null;
  }
  
  if (usbAddon) {
    try {
      const monitor = new usbAddon.USBMonitor();
      monitor.startCapture((packet) => {
        if (mainWindow && isCapturing) {
          const urbPacket = {
            timestamp: packet.timestamp || Date.now(),
            type: packet.type || 'URB',
            direction: packet.direction || 'out',
            endpoint: packet.endpoint || 0,
            length: packet.length || 0,
            data: packet.data ? Array.from(packet.data) : [],
            status: packet.status || 'success',
            isControlTransfer: packet.isControlTransfer || false,
            setupPacket: packet.isControlTransfer ? {
              bmRequestType: packet.bmRequestType,
              bRequest: packet.bRequest,
              wValue: packet.wValue,
              wIndex: packet.wIndex,
              wLength: packet.wLength
            } : null
          };
          addPacketToBatch(urbPacket);
        }
      });
    } catch (e) {
      console.log('Addon capture failed, using simulation:', e.message);
      simulateCapture();
    }
  } else {
    simulateCapture();
  }
  
  return { success: true };
});

ipcMain.handle('stop-capture', () => {
  isCapturing = false;
  
  if (batchTimer) {
    clearTimeout(batchTimer);
    batchTimer = null;
  }
  flushPacketBatch();
  
  return { success: true, packetCount: capturedPackets.length };
});

function simulateCapture() {
  let packetCount = 0;
  const simulate = () => {
    if (!isCapturing) return;
    
    const isControl = Math.random() < 0.1;
    let packet;
    
    if (isControl) {
      const setupData = Array.from({ length: 8 }, () => Math.floor(Math.random() * 256));
      const setup = parseSetupPacket(setupData);
      const dataLen = Math.floor(Math.random() * 64);
      const payload = Array.from({ length: dataLen }, () => Math.floor(Math.random() * 256));
      
      packet = {
        timestamp: Date.now(),
        type: ['URB_SUBMIT', 'URB_COMPLETE', 'URB_ERROR'][Math.floor(Math.random() * 3)],
        direction: setup ? setup.direction : (Math.random() > 0.5 ? 'in' : 'out'),
        endpoint: 0,
        length: 8 + dataLen,
        data: [...setupData, ...payload],
        status: Math.random() > 0.95 ? 'error' : 'success',
        isControlTransfer: true,
        setupPacket: setup
      };
    } else {
      packet = {
        timestamp: Date.now(),
        type: ['URB_SUBMIT', 'URB_COMPLETE', 'URB_ERROR'][Math.floor(Math.random() * 3)],
        direction: Math.random() > 0.5 ? 'in' : 'out',
        endpoint: Math.floor(Math.random() * 16),
        length: Math.floor(Math.random() * 4096),
        data: Array.from({ length: Math.floor(Math.random() * 512) }, () => Math.floor(Math.random() * 256)),
        status: Math.random() > 0.95 ? 'error' : 'success',
        isControlTransfer: false,
        setupPacket: null
      };
    }
    
    addPacketToBatch(packet);
    packetCount++;
    
    const delay = packetCount % 1000 === 0 ? 10 : Math.random() * 50;
    setTimeout(simulate, delay);
  };
  
  simulate();
}

ipcMain.handle('save-pcap', async (event, filePath) => {
  if (!filePath) {
    const result = await dialog.showSaveDialog(mainWindow, {
      filters: [{ name: 'PCAP Files', extensions: ['pcap'] }],
      defaultPath: 'capture.pcap'
    });
    if (result.canceled) return { success: false };
    filePath = result.filePath;
  }
  
  const pcapData = buildPcap(capturedPackets);
  fs.writeFileSync(filePath, pcapData);
  
  return { success: true, path: filePath };
});

function buildPcap(packets) {
  const buffer = Buffer.alloc(24 + packets.reduce((sum, p) => sum + 16 + p.data.length, 0));
  let offset = 0;
  
  buffer.writeUInt32LE(0xa1b2c3d4, offset); offset += 4;
  buffer.writeUInt16LE(2, offset); offset += 2;
  buffer.writeUInt16LE(4, offset); offset += 2;
  buffer.writeUInt32LE(0, offset); offset += 4;
  buffer.writeUInt32LE(0, offset); offset += 4;
  buffer.writeUInt32LE(65535, offset); offset += 4;
  buffer.writeUInt32LE(147, offset); offset += 4;
  
  packets.forEach(packet => {
    const tsSec = Math.floor(packet.timestamp / 1000);
    const tsUsec = (packet.timestamp % 1000) * 1000;
    const data = Buffer.from(packet.data);
    
    buffer.writeUInt32LE(tsSec, offset); offset += 4;
    buffer.writeUInt32LE(tsUsec, offset); offset += 4;
    buffer.writeUInt32LE(data.length, offset); offset += 4;
    buffer.writeUInt32LE(data.length, offset); offset += 4;
    data.copy(buffer, offset);
    offset += data.length;
  });
  
  return buffer;
}

ipcMain.handle('load-pcap', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    filters: [{ name: 'PCAP Files', extensions: ['pcap'] }],
    properties: ['openFile']
  });
  
  if (result.canceled) return { success: false };
  
  try {
    const data = fs.readFileSync(result.filePaths[0]);
    const packets = parsePcap(data);
    capturedPackets = packets;
    return { success: true, packets };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('send-control-request', async (event, request) => {
  try {
    const { deviceIndex, bmRequestType, bRequest, wValue, wIndex, wLength, data } = request;
    
    const devices = usb.getDeviceList();
    if (deviceIndex < 0 || deviceIndex >= devices.length) {
      return { success: false, error: 'Invalid device index' };
    }
    
    const device = devices[deviceIndex];
    device.open();
    
    const deviceHandle = device.deviceHandle || device;
    
    let responseData;
    const isIn = (bmRequestType & 0x80) !== 0;
    
    if (isIn) {
      responseData = await new Promise((resolve, reject) => {
        deviceHandle.controlTransfer(
          bmRequestType,
          bRequest,
          wValue,
          wIndex,
          wLength,
          (err, buf) => {
            if (err) reject(err);
            else resolve(buf ? Array.from(buf) : []);
          }
        );
      });
    } else {
      const buf = data ? Buffer.from(data) : Buffer.alloc(0);
      await new Promise((resolve, reject) => {
        deviceHandle.controlTransfer(
          bmRequestType,
          bRequest,
          wValue,
          wIndex,
          buf,
          (err) => {
            if (err) reject(err);
            else resolve();
          }
        );
      });
      responseData = [];
    }
    
    device.close();
    
    return { success: true, data: responseData };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('export-packets', async (event, format, includeSetup) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    filters: [
      { name: `${format.toUpperCase()} Files`, extensions: [format === 'json' ? 'json' : 'pcap'] }
    ],
    defaultPath: `capture.${format === 'json' ? 'json' : 'pcap'}`
  });
  
  if (result.canceled) return { success: false };
  
  let fileData;
  switch (format) {
    case 'json':
      fileData = buildJson(capturedPackets, includeSetup);
      break;
    case 'pcapng':
      fileData = buildPcapNg(capturedPackets);
      break;
    case 'usbpcap':
      fileData = buildUsbPcap(capturedPackets);
      break;
    default:
      fileData = buildPcap(capturedPackets);
  }
  
  fs.writeFileSync(result.filePath, fileData);
  return { success: true, path: result.filePath };
});

function buildJson(packets, includeSetup) {
  const data = packets.map(p => ({
    timestamp: p.timestamp,
    type: p.type,
    direction: p.direction,
    endpoint: p.endpoint,
    length: p.length,
    status: p.status,
    isControlTransfer: p.isControlTransfer,
    data: p.data,
    setupPacket: includeSetup ? p.setupPacket : undefined
  }));
  return JSON.stringify(data, null, 2);
}

function buildPcapNg(packets) {
  const buffers = [];
  
  const shb = buildPcapNgBlock(0x0a0d0d0a, () => {
    const buf = Buffer.alloc(28);
    buf.writeUInt16LE(1, 0);
    buf.writeUInt16LE(0, 2);
    buf.writeUInt32LE(0x1a2b3c4d, 4);
    buf.writeUInt16LE(2, 8);
    buf.writeUInt16LE(0, 10);
    return buf;
  });
  buffers.push(shb);
  
  const idb = buildPcapNgBlock(1, () => {
    const buf = Buffer.alloc(20);
    buf.writeUInt16LE(220, 0);
    buf.writeUInt16LE(0, 2);
    buf.writeUInt32LE(0, 4);
    buf.writeUInt32LE(65535, 8);
    return buf;
  });
  buffers.push(idb);
  
  packets.forEach(packet => {
    const epb = buildPcapNgBlock(6, () => {
      const data = Buffer.from(packet.data);
      const paddedLen = (data.length + 3) & ~3;
      const buf = Buffer.alloc(32 + paddedLen);
      
      buf.writeUInt32LE(0, 0);
      buf.writeUInt32LE(0, 4);
      buf.writeUInt32LE(Math.floor(packet.timestamp / 1000000), 8);
      buf.writeUInt32LE((packet.timestamp % 1000000) * 1000, 12);
      buf.writeUInt32LE(data.length, 16);
      buf.writeUInt32LE(data.length, 20);
      
      data.copy(buf, 24);
      return buf;
    });
    buffers.push(epb);
  });
  
  return Buffer.concat(buffers);
}

function buildPcapNgBlock(type, buildContent) {
  const content = buildContent();
  const totalLen = 12 + content.length;
  const buf = Buffer.alloc(totalLen);
  
  buf.writeUInt32LE(type, 0);
  buf.writeUInt32LE(totalLen, 4);
  content.copy(buf, 8);
  buf.writeUInt32LE(totalLen, 8 + content.length);
  
  return buf;
}

function buildUsbPcap(packets) {
  const header = Buffer.alloc(24);
  header.writeUInt32LE(0xa1b2c3d4, 0);
  header.writeUInt16LE(2, 4);
  header.writeUInt16LE(4, 6);
  header.writeUInt32LE(0, 8);
  header.writeUInt32LE(0, 12);
  header.writeUInt32LE(65535, 16);
  header.writeUInt32LE(220, 20);
  
  const packetBuffers = [header];
  
  packets.forEach(packet => {
    const usbHeader = Buffer.alloc(48);
    usbHeader.writeUInt16LE(48, 0);
    usbHeader.writeUInt8(packet.isControlTransfer ? 2 : 3, 2);
    usbHeader.writeUInt8(packet.direction === 'in' ? 1 : 0, 3);
    usbHeader.writeUInt8(packet.endpoint, 4);
    usbHeader.writeUInt8(0, 5);
    usbHeader.writeUInt16LE(0, 6);
    usbHeader.writeUInt64LE ? usbHeader.writeUInt64LE(BigInt(packet.timestamp * 1000), 8) : 
      usbHeader.writeUInt32LE(Math.floor(packet.timestamp / 1000), 8);
    usbHeader.writeUInt32LE(packet.data.length, 16);
    usbHeader.writeUInt32LE(packet.data.length, 20);
    
    const pcapHeader = Buffer.alloc(16);
    const tsSec = Math.floor(packet.timestamp / 1000);
    const tsUsec = (packet.timestamp % 1000) * 1000;
    pcapHeader.writeUInt32LE(tsSec, 0);
    pcapHeader.writeUInt32LE(tsUsec, 4);
    pcapHeader.writeUInt32LE(48 + packet.data.length, 8);
    pcapHeader.writeUInt32LE(48 + packet.data.length, 12);
    
    packetBuffers.push(pcapHeader, usbHeader, Buffer.from(packet.data));
  });
  
  return Buffer.concat(packetBuffers);
}

function parsePcap(data) {
  const packets = [];
  let offset = 24;
  
  while (offset < data.length) {
    const tsSec = data.readUInt32LE(offset); offset += 4;
    const tsUsec = data.readUInt32LE(offset); offset += 4;
    const inclLen = data.readUInt32LE(offset); offset += 4;
    offset += 4;
    
    const packetData = data.slice(offset, offset + inclLen);
    offset += inclLen;
    
    const isControl = inclLen >= 8;
    const setupPacket = isControl ? parseSetupPacket(packetData) : null;
    
    packets.push({
      timestamp: tsSec * 1000 + Math.floor(tsUsec / 1000),
      type: 'URB_COMPLETE',
      direction: setupPacket ? setupPacket.direction : 'in',
      endpoint: 0,
      length: inclLen,
      data: Array.from(packetData),
      status: 'success',
      isControlTransfer: isControl,
      setupPacket
    });
  }
  
  return packets;
}
