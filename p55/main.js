const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const net = require('net');
const iconv = require('iconv-lite');
const PDFDocument = require('pdfkit');

const DATA_DIR = path.join(app.getPath('userData'), 'templates');
const PRINTER_CONFIG_PATH = path.join(app.getPath('userData'), 'printer-config.json');
const PRINT_QUEUE_PATH = path.join(app.getPath('userData'), 'print-queue.json');

let mainWindow = null;
let printQueue = [];
let isProcessingQueue = false;
let networkPrinterConfig = {
  ip: '',
  port: 9100,
  enabled: false
};

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function loadPrinterConfig() {
  try {
    if (fs.existsSync(PRINTER_CONFIG_PATH)) {
      const config = JSON.parse(fs.readFileSync(PRINTER_CONFIG_PATH, 'utf8'));
      networkPrinterConfig = { ...networkPrinterConfig, ...config };
    }
  } catch (error) {
    console.error('加载打印机配置失败:', error);
  }
}

function savePrinterConfig() {
  try {
    fs.writeFileSync(PRINTER_CONFIG_PATH, JSON.stringify(networkPrinterConfig, null, 2));
  } catch (error) {
    console.error('保存打印机配置失败:', error);
  }
}

function loadPrintQueue() {
  try {
    if (fs.existsSync(PRINT_QUEUE_PATH)) {
      printQueue = JSON.parse(fs.readFileSync(PRINT_QUEUE_PATH, 'utf8'));
    }
  } catch (error) {
    console.error('加载打印队列失败:', error);
  }
}

function savePrintQueue() {
  try {
    fs.writeFileSync(PRINT_QUEUE_PATH, JSON.stringify(printQueue, null, 2));
  } catch (error) {
    console.error('保存打印队列失败:', error);
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 950,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  mainWindow.loadFile('index.html');
  
  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools();
  }
}

function sendToNetworkPrinter(data) {
  return new Promise((resolve, reject) => {
    if (!networkPrinterConfig.enabled || !networkPrinterConfig.ip) {
      reject(new Error('网络打印机未配置'));
      return;
    }

    const socket = new net.Socket();
    const port = networkPrinterConfig.port || 9100;
    
    socket.setTimeout(10000);
    
    socket.on('connect', () => {
      console.log('已连接到网络打印机');
      socket.write(Buffer.from(data), () => {
        setTimeout(() => {
          socket.end();
          resolve({ success: true });
        }, 500);
      });
    });

    socket.on('timeout', () => {
      socket.destroy();
      reject(new Error('连接超时'));
    });

    socket.on('error', (error) => {
      socket.destroy();
      reject(error);
    });

    socket.on('close', () => {
      console.log('网络打印机关闭连接');
    });

    socket.connect(port, networkPrinterConfig.ip);
  });
}

async function processQueue() {
  if (isProcessingQueue || printQueue.length === 0) return;
  
  isProcessingQueue = true;
  
  while (printQueue.length > 0) {
    const job = printQueue[0];
    try {
      job.status = 'printing';
      notifyQueueUpdate();
      
      if (job.printerType === 'network') {
        await sendToNetworkPrinter(job.data);
      }
      
      job.status = 'completed';
      job.completedAt = new Date().toISOString();
      
      printQueue.shift();
      savePrintQueue();
      notifyQueueUpdate();
      
      await sleep(1000);
    } catch (error) {
      console.error('打印任务失败:', error);
      job.status = 'failed';
      job.error = error.message;
      job.failedAt = new Date().toISOString();
      savePrintQueue();
      notifyQueueUpdate();
      break;
    }
  }
  
  isProcessingQueue = false;
}

function notifyQueueUpdate() {
  if (mainWindow) {
    mainWindow.webContents.send('queue-updated', printQueue);
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function generateReceiptPDF(template, outputPath) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: [226, 500],
        margins: { top: 10, bottom: 10, left: 10, right: 10 }
      });
      
      const stream = fs.createWriteStream(outputPath);
      doc.pipe(stream);
      
      let yPos = 10;
      const pageWidth = 206;
      
      doc.font('Helvetica-Bold');
      
      template.items.forEach(item => {
        const value = item.content || '';
        
        switch (item.type) {
          case 'title':
            const fontSize = 12 * (item.width || 2);
            doc.fontSize(fontSize);
            doc.font('Helvetica-Bold');
            const titleWidth = doc.widthOfString(value);
            const titleX = (item.align === 'center') ? (pageWidth - titleWidth) / 2 : 
                          (item.align === 'right' ? pageWidth - titleWidth : 0);
            doc.text(value, titleX, yPos);
            yPos += fontSize + 5;
            break;
            
          case 'text':
            doc.fontSize(item.bold ? 10 : 9);
            doc.font(item.bold ? 'Helvetica-Bold' : 'Helvetica');
            const textX = item.align === 'center' ? (pageWidth - doc.widthOfString(value)) / 2 :
                         item.align === 'right' ? pageWidth - doc.widthOfString(value) : 0;
            doc.text(value, textX, yPos);
            yPos += 14;
            break;
            
          case 'line':
            doc.moveTo(0, yPos).lineTo(pageWidth, yPos).dash(2, { space: 2 }).stroke();
            doc.undash();
            yPos += 10;
            break;
            
          case 'space':
            yPos += (item.lines || 1) * 15;
            break;
            
          case 'barcode':
            yPos += 10;
            doc.fontSize(8);
            doc.font('Helvetica');
            doc.text(value, (pageWidth - doc.widthOfString(value)) / 2, yPos + 40);
            yPos += 55;
            break;
            
          case 'qrcode':
            yPos += 10;
            const qrSize = 50;
            doc.rect((pageWidth - qrSize) / 2, yPos, qrSize, qrSize).stroke();
            yPos += qrSize + 15;
            break;
        }
      });
      
      doc.end();
      
      stream.on('finish', () => {
        resolve({ success: true, path: outputPath });
      });
      
      stream.on('error', (error) => {
        reject(error);
      });
      
    } catch (error) {
      reject(error);
    }
  });
}

ipcMain.handle('save-template', async (event, template) => {
  ensureDataDir();
  template.id = template.id || Date.now().toString();
  template.updatedAt = new Date().toISOString();
  const filePath = path.join(DATA_DIR, `${template.id}.json`);
  fs.writeFileSync(filePath, JSON.stringify(template, null, 2));
  return template;
});

ipcMain.handle('get-templates', async () => {
  ensureDataDir();
  const files = fs.readdirSync(DATA_DIR).filter(f => f.endsWith('.json'));
  return files.map(file => {
    const content = fs.readFileSync(path.join(DATA_DIR, file), 'utf8');
    return JSON.parse(content);
  });
});

ipcMain.handle('delete-template', async (event, id) => {
  ensureDataDir();
  const filePath = path.join(DATA_DIR, `${id}.json`);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
    return { success: true };
  }
  return { success: false };
});

ipcMain.handle('encode-gb18030', async (event, text) => {
  try {
    const buffer = iconv.encode(text, 'gb18030');
    return Array.from(buffer);
  } catch (error) {
    console.error('GB18030编码失败:', error);
    const buffer = Buffer.from(text, 'utf8');
    return Array.from(buffer);
  }
});

ipcMain.handle('encode-gbk', async (event, text) => {
  try {
    const buffer = iconv.encode(text, 'gbk');
    return Array.from(buffer);
  } catch (error) {
    console.error('GBK编码失败:', error);
    const buffer = Buffer.from(text, 'utf8');
    return Array.from(buffer);
  }
});

ipcMain.handle('get-network-printer-config', async () => {
  return networkPrinterConfig;
});

ipcMain.handle('save-network-printer-config', async (event, config) => {
  networkPrinterConfig = { ...networkPrinterConfig, ...config };
  savePrinterConfig();
  return { success: true };
});

ipcMain.handle('test-network-printer', async () => {
  try {
    const testCommands = [
      0x1B, 0x40,
      0x1C, 0x26,
      0x1B, 0x74, 255,
      0x1B, 0x61, 1,
      0x1D, 0x21, 0x11,
      0x1B, 0x45, 1
    ];
    
    const textBuffer = iconv.encode('网络打印测试\n', 'gb18030');
    testCommands.push(...Array.from(textBuffer));
    
    testCommands.push(
      0x1B, 0x45, 0,
      0x1D, 0x21, 0,
      0x1B, 0x61, 0
    );
    
    const textBuffer2 = iconv.encode('时间: ' + new Date().toLocaleString() + '\n', 'gb18030');
    testCommands.push(...Array.from(textBuffer2));
    
    testCommands.push(
      0x0A, 0x0A, 0x0A, 0x0A,
      0x1D, 0x56, 66, 3
    );
    
    await sendToNetworkPrinter(testCommands);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('send-to-network-printer', async (event, data) => {
  try {
    await sendToNetworkPrinter(data);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('add-to-print-queue', async (event, job) => {
  const queueJob = {
    id: Date.now().toString(),
    ...job,
    status: 'pending',
    createdAt: new Date().toISOString()
  };
  
  printQueue.push(queueJob);
  savePrintQueue();
  notifyQueueUpdate();
  
  processQueue();
  
  return { success: true, jobId: queueJob.id };
});

ipcMain.handle('get-print-queue', async () => {
  return printQueue;
});

ipcMain.handle('remove-from-queue', async (event, jobId) => {
  const index = printQueue.findIndex(j => j.id === jobId);
  if (index > -1) {
    printQueue.splice(index, 1);
    savePrintQueue();
    notifyQueueUpdate();
    return { success: true };
  }
  return { success: false };
});

ipcMain.handle('clear-print-queue', async () => {
  printQueue = printQueue.filter(j => j.status === 'printing');
  savePrintQueue();
  notifyQueueUpdate();
  return { success: true };
});

ipcMain.handle('retry-print-queue', async () => {
  printQueue.forEach(j => {
    if (j.status === 'failed') {
      j.status = 'pending';
      delete j.error;
      delete j.failedAt;
    }
  });
  savePrintQueue();
  notifyQueueUpdate();
  processQueue();
  return { success: true };
});

ipcMain.handle('export-pdf', async (event, template) => {
  try {
    const result = await dialog.showSaveDialog(mainWindow, {
      title: '导出PDF',
      defaultPath: `票据_${Date.now()}.pdf`,
      filters: [{ name: 'PDF文件', extensions: ['pdf'] }]
    });
    
    if (result.canceled) {
      return { canceled: true };
    }
    
    await generateReceiptPDF(template, result.filePath);
    return { success: true, path: result.filePath };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

app.whenReady().then(() => {
  ensureDataDir();
  loadPrinterConfig();
  loadPrintQueue();
  createWindow();
  
  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});
