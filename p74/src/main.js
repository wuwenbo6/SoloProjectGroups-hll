const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const UTIF = require('utif');
const Tesseract = require('tesseract.js');
const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      enableRemoteModule: true
    },
    icon: path.join(__dirname, '../assets/icon.png')
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer/index.html'));

  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.on('ready', createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});

ipcMain.handle('open-tiff-file', async (event) => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [
      { name: 'TIFF Files', extensions: ['tiff', 'tif'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  });

  if (result.canceled) return null;

  const filePath = result.filePaths[0];
  const buffer = fs.readFileSync(filePath);
  const ifds = UTIF.decode(buffer);
  
  const totalPages = ifds.length;
  const pages = [];

  for (let i = 0; i < totalPages; i++) {
    const ifd = ifds[i];
    UTIF.decodeImage(buffer, ifd);
    const rgba = UTIF.toRGBA8(ifd);
    
    pages.push({
      index: i,
      width: ifd.width,
      height: ifd.height,
      data: Array.from(rgba),
      rotation: 0,
      annotations: [],
      ocrText: ''
    });

    if (totalPages > 20) {
      event.sender.send('file-load-progress', {
        current: i + 1,
        total: totalPages
      });
      await new Promise(resolve => setImmediate(resolve));
    }
  }

  global.gc && global.gc();

  return {
    filePath,
    fileName: path.basename(filePath),
    pages
  };
});

ipcMain.handle('perform-ocr', async (event, imageData) => {
  try {
    const result = await Tesseract.recognize(
      Uint8ClampedArray.from(imageData.data),
      imageData.width,
      imageData.height,
      'chi_sim+eng',
      {
        logger: m => {
          if (m.status === 'recognizing text') {
            event.sender.send('ocr-progress', m.progress);
          }
        }
      }
    );
    return result.data.text;
  } catch (error) {
    console.error('OCR Error:', error);
    return '';
  }
});

ipcMain.handle('save-project', async (event, projectData) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    filters: [
      { name: 'Project Files', extensions: ['tiffproj'] },
      { name: 'All Files', extensions: ['*'] }
    ],
    defaultPath: projectData.fileName.replace(/\.(tiff|tif)$/i, '.tiffproj')
  });

  if (result.canceled) return false;

  try {
    fs.writeFileSync(result.filePath, JSON.stringify(projectData, null, 2));
    return true;
  } catch (error) {
    console.error('Save Error:', error);
    return false;
  }
});

ipcMain.handle('load-project', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [
      { name: 'Project Files', extensions: ['tiffproj'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  });

  if (result.canceled) return null;

  try {
    const data = fs.readFileSync(result.filePaths[0], 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Load Error:', error);
    return null;
  }
});

ipcMain.handle('export-tiff', async (event, projectData) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    filters: [
      { name: 'TIFF Files', extensions: ['tiff', 'tif'] }
    ],
    defaultPath: 'exported.tiff'
  });

  if (result.canceled) return false;
  return true;
});

ipcMain.handle('export-pdf', async (event, projectData) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    filters: [
      { name: 'PDF Files', extensions: ['pdf'] }
    ],
    defaultPath: projectData.fileName.replace(/\.(tiff|tif)$/i, '.pdf')
  });

  if (result.canceled) return false;

  try {
    const pdfDoc = await PDFDocument.create();
    const helveticaFont = await pdfDoc.embedFont(StandardFonts.Helvetica);

    for (let i = 0; i < projectData.pages.length; i++) {
      const page = projectData.pages[i];
      const { width, height } = page;
      
      const pdfPage = pdfDoc.addPage([width, height]);
      
      const imageData = Uint8Array.from(page.data);
      let pngBuffer = null;
      
      try {
        const { createCanvas } = require('canvas');
        const canvas = createCanvas(width, height);
        const ctx = canvas.getContext('2d');
        const imgData = ctx.createImageData(width, height);
        imgData.data.set(imageData);
        ctx.putImageData(imgData, 0, 0);
        pngBuffer = canvas.toBuffer('image/png');
      } catch (e) {
        const tempCanvas = { width, height, data: imageData };
        const png = await createPNG(tempCanvas);
        pngBuffer = Buffer.from(png);
      }

      if (pngBuffer) {
        const image = await pdfDoc.embedPng(pngBuffer);
        pdfPage.drawImage(image, {
          x: 0,
          y: 0,
          width,
          height,
        });
      }

      if (page.ocrText && page.ocrText.trim()) {
        const fontSize = 10;
        const lines = page.ocrText.split('\n');
        let yPos = height - 20;
        
        lines.forEach((line) => {
          if (line.trim()) {
            pdfPage.drawText(line.trim(), {
              x: 10,
              y: yPos,
              size: fontSize,
              font: helveticaFont,
              color: rgb(0, 0, 0),
              opacity: 0,
            });
            yPos -= fontSize * 1.5;
          }
        });
      }

      event.sender.send('export-progress', {
        current: i + 1,
        total: projectData.pages.length
      });
    }

    const pdfBytes = await pdfDoc.save();
    fs.writeFileSync(result.filePath, pdfBytes);
    
    return true;
  } catch (error) {
    console.error('PDF Export Error:', error);
    throw error;
  }
});

function createPNG(canvas) {
  return new Promise((resolve) => {
    const { width, height, data } = canvas;
    const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
    const ihdr = createChunk('IHDR', Buffer.concat([
      writeUInt32BE(width),
      writeUInt32BE(height),
      Buffer.from([8, 6, 0, 0, 0])
    ]));
    
    const rawData = [];
    for (let y = 0; y < height; y++) {
      rawData.push(0);
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4;
        rawData.push(data[idx], data[idx + 1], data[idx + 2], data[idx + 3]);
      }
    }
    
    const { deflateSync } = require('zlib');
    const compressed = deflateSync(Buffer.from(rawData));
    const idat = createChunk('IDAT', compressed);
    const iend = createChunk('IEND', Buffer.alloc(0));
    
    resolve(Buffer.concat([pngSignature, ihdr, idat, iend]));
  });
}

function createChunk(type, data) {
  const { crc32 } = require('zlib');
  const length = writeUInt32BE(data.length);
  const typeBuffer = Buffer.from(type);
  const crc = writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])) >>> 0);
  return Buffer.concat([length, typeBuffer, data, crc]);
}

function writeUInt32BE(value) {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32BE(value, 0);
  return buffer;
}
