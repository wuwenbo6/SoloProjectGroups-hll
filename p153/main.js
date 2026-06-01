const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const dicomParser = require('dicom-parser');

let mainWindow;

const LARGE_FILE_THRESHOLD = 100 * 1024 * 1024;

const TRANSFER_SYNTAX_MAP = {
  '1.2.840.10008.1.2': { name: 'Implicit VR Little Endian', littleEndian: true, implicit: true },
  '1.2.840.10008.1.2.1': { name: 'Explicit VR Little Endian', littleEndian: true, implicit: false },
  '1.2.840.10008.1.2.1.99': { name: 'Deflated Explicit VR Little Endian', littleEndian: true, implicit: false },
  '1.2.840.10008.1.2.2': { name: 'Explicit VR Big Endian', littleEndian: false, implicit: false },
  '1.2.840.10008.1.2.4.50': { name: 'JPEG Baseline', littleEndian: true, implicit: false, compressed: true },
  '1.2.840.10008.1.2.4.51': { name: 'JPEG Extended', littleEndian: true, implicit: false, compressed: true },
  '1.2.840.10008.1.2.4.57': { name: 'JPEG Lossless', littleEndian: true, implicit: false, compressed: true },
  '1.2.840.10008.1.2.4.70': { name: 'JPEG Lossless SV1', littleEndian: true, implicit: false, compressed: true },
  '1.2.840.10008.1.2.4.80': { name: 'JPEG-LS Lossless', littleEndian: true, implicit: false, compressed: true },
  '1.2.840.10008.1.2.4.81': { name: 'JPEG-LS Lossy', littleEndian: true, implicit: false, compressed: true },
  '1.2.840.10008.1.2.4.90': { name: 'JPEG 2000 Lossless', littleEndian: true, implicit: false, compressed: true },
  '1.2.840.10008.1.2.4.91': { name: 'JPEG 2000', littleEndian: true, implicit: false, compressed: true },
  '1.2.840.10008.1.2.4.92': { name: 'JPEG 2000 Lossless Multicomponent', littleEndian: true, implicit: false, compressed: true },
  '1.2.840.10008.1.2.4.93': { name: 'JPEG 2000 Multicomponent', littleEndian: true, implicit: false, compressed: true },
  '1.2.840.10008.1.2.5': { name: 'RLE Lossless', littleEndian: true, implicit: false, compressed: true },
};

function getTransferSyntaxInfo(uid) {
  return TRANSFER_SYNTAX_MAP[uid] || { name: 'Unknown', littleEndian: true, implicit: true };
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile('index.html');
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

let currentDataSet = null;
let currentFilePath = null;
let currentByteArray = null;
let currentFileDescriptor = null;
let currentFileSize = 0;
let isLargeFile = false;
let currentTransferSyntax = null;
let pixelDataOffset = -1;
let pixelDataLength = -1;

function cleanupResources() {
  if (currentFileDescriptor !== null) {
    try {
      fs.closeSync(currentFileDescriptor);
    } catch (e) {}
    currentFileDescriptor = null;
  }
  currentByteArray = null;
  currentDataSet = null;
  isLargeFile = false;
  pixelDataOffset = -1;
  pixelDataLength = -1;
}

ipcMain.handle('load-dicom', async () => {
  cleanupResources();

  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [{ name: 'DICOM Files', extensions: ['dcm', 'dicom', ''] }],
  });

  if (result.canceled) {
    return { success: false, canceled: true };
  }

  const filePath = result.filePaths[0];
  currentFilePath = filePath;

  try {
    currentFileSize = fs.statSync(filePath).size;
    isLargeFile = currentFileSize > LARGE_FILE_THRESHOLD;

    if (isLargeFile) {
      return loadLargeDicom(filePath);
    } else {
      return loadSmallDicom(filePath);
    }
  } catch (error) {
    return { success: false, error: error.message };
  }
});

function loadSmallDicom(filePath) {
  const fileBuffer = fs.readFileSync(filePath);
  const byteArray = new Uint8Array(fileBuffer);
  currentByteArray = byteArray;

  let dataSet;
  try {
    dataSet = dicomParser.parseDicom(byteArray);
  } catch (parseError) {
    try {
      dataSet = dicomParser.parseDicom(byteArray, { ignoreErrors: true });
    } catch (e2) {
      return { success: false, error: e2.message };
    }
  }

  currentDataSet = dataSet;

  const transferSyntaxUID = dataSet.string('x00020010') || '1.2.840.10008.1.2';
  currentTransferSyntax = getTransferSyntaxInfo(transferSyntaxUID);

  const pixelDataElement = dataSet.elements.x7fe00010;
  if (pixelDataElement) {
    pixelDataOffset = pixelDataElement.dataOffset;
    pixelDataLength = pixelDataElement.length;
  }

  const elements = extractElements(dataSet);

  return {
    success: true,
    elements,
    filePath,
    fileName: path.basename(filePath),
    fileSize: currentFileSize,
    isLargeFile: false,
    transferSyntax: currentTransferSyntax,
  };
}

function loadLargeDicom(filePath) {
  currentFileDescriptor = fs.openSync(filePath, 'r');

  const headerBuffer = Buffer.alloc(8192);
  const bytesRead = fs.readSync(currentFileDescriptor, headerBuffer, 0, 8192, 0);

  const preamble = headerBuffer.slice(0, 128);
  const dicomPrefix = headerBuffer.slice(128, 132).toString('ascii');

  let metaLength = 0;
  let headerStart = 132;

  if (dicomPrefix === 'DICM') {
    const metaLenBuffer = Buffer.alloc(4);
    fs.readSync(currentFileDescriptor, metaLenBuffer, 0, 4, 132 + 12);
    metaLength = metaLenBuffer.readUInt32LE(0);
    headerStart = 132 + 16 + metaLength;
  } else {
    headerStart = 0;
  }

  const maxHeaderSize = Math.min(10 * 1024 * 1024, currentFileSize);
  const fullHeaderBuffer = Buffer.alloc(maxHeaderSize);
  fs.readSync(currentFileDescriptor, fullHeaderBuffer, 0, maxHeaderSize, 0);

  let dataSet;
  try {
    dataSet = dicomParser.parseDicom(new Uint8Array(fullHeaderBuffer));
  } catch (parseError) {
    try {
      dataSet = dicomParser.parseDicom(new Uint8Array(fullHeaderBuffer), { ignoreErrors: true });
    } catch (e2) {
      return { success: false, error: e2.message };
    }
  }

  currentDataSet = dataSet;

  const transferSyntaxUID = dataSet.string('x00020010') || '1.2.840.10008.1.2';
  currentTransferSyntax = getTransferSyntaxInfo(transferSyntaxUID);

  const pixelDataElement = dataSet.elements.x7fe00010;
  if (pixelDataElement) {
    pixelDataOffset = pixelDataElement.dataOffset;
    pixelDataLength = pixelDataElement.length;
  } else {
    const rows = parseInt(dataSet.string('x00280010')) || 0;
    const cols = parseInt(dataSet.string('x00280011')) || 0;
    const bitsAllocated = parseInt(dataSet.string('x00280100')) || 8;
    const samplesPerPixel = parseInt(dataSet.string('x00280002')) || 1;
    pixelDataLength = rows * cols * (bitsAllocated / 8) * samplesPerPixel;

    let offset = 0;
    for (const prop in dataSet.elements) {
      const el = dataSet.elements[prop];
      if (el.tag !== 'x7fe00010') {
        offset = Math.max(offset, el.dataOffset + el.length);
      }
    }
    pixelDataOffset = offset;
  }

  const elements = extractElements(dataSet);

  return {
    success: true,
    elements,
    filePath,
    fileName: path.basename(filePath),
    fileSize: currentFileSize,
    isLargeFile: true,
    transferSyntax: currentTransferSyntax,
  };
}

function extractElements(dataSet) {
  const elements = [];
  for (const propertyName in dataSet.elements) {
    const element = dataSet.elements[propertyName];
    let value;
    try {
      value = dataSet.string(propertyName);
    } catch (e) {
      value = '[无法解析]';
    }

    const tag = propertyName.toUpperCase();
    const group = tag.substring(0, 4);
    const elementNum = tag.substring(4, 8);
    const tagFormatted = `(${group},${elementNum})`;

    elements.push({
      tag: propertyName,
      tagFormatted,
      vr: element.vr,
      value: value !== undefined ? value : '',
      description: getTagDescription(propertyName),
    });
  }
  return elements;
}

ipcMain.handle('get-pixel-data-info', async () => {
  if (!currentDataSet) {
    return { success: false, error: '未加载 DICOM 文件' };
  }

  try {
    const rows = parseInt(currentDataSet.string('x00280010')) || 0;
    const cols = parseInt(currentDataSet.string('x00280011')) || 0;
    const bitsAllocated = parseInt(currentDataSet.string('x00280100')) || 8;
    const bitsStored = parseInt(currentDataSet.string('x00280101')) || bitsAllocated;
    const highBit = parseInt(currentDataSet.string('x00280102')) || bitsStored - 1;
    const samplesPerPixel = parseInt(currentDataSet.string('x00280002')) || 1;
    const photometricInterpretation = currentDataSet.string('x00280004') || 'MONOCHROME2';
    const pixelRepresentation = parseInt(currentDataSet.string('x00280103')) || 0;

    return {
      success: true,
      rows,
      cols,
      bitsAllocated,
      bitsStored,
      highBit,
      samplesPerPixel,
      photometricInterpretation,
      pixelRepresentation,
      pixelDataOffset,
      pixelDataLength,
      isLargeFile,
      transferSyntax: currentTransferSyntax,
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('get-pixel-data', async () => {
  if (!currentDataSet) {
    return { success: false, error: '未加载 DICOM 文件' };
  }

  try {
    const rows = parseInt(currentDataSet.string('x00280010')) || 0;
    const cols = parseInt(currentDataSet.string('x00280011')) || 0;
    const bitsAllocated = parseInt(currentDataSet.string('x00280100')) || 8;

    let pixelArray;

    if (isLargeFile && currentFileDescriptor !== null) {
      const bytesToRead = rows * cols * (bitsAllocated / 8);
      const pixelBuffer = Buffer.alloc(bytesToRead);
      fs.readSync(currentFileDescriptor, pixelBuffer, 0, bytesToRead, pixelDataOffset);

      if (bitsAllocated <= 8) {
        pixelArray = new Uint8Array(pixelBuffer);
      } else if (bitsAllocated <= 16) {
        pixelArray = new Uint16Array(pixelBuffer.buffer, pixelBuffer.byteOffset, rows * cols);
      } else {
        pixelArray = new Uint32Array(pixelBuffer.buffer, pixelBuffer.byteOffset, rows * cols);
      }
    } else if (currentByteArray) {
      const pixelData = currentByteArray.slice(pixelDataOffset);
      if (bitsAllocated <= 8) {
        pixelArray = new Uint8Array(pixelData);
      } else if (bitsAllocated <= 16) {
        pixelArray = new Uint16Array(pixelData.buffer, pixelDataOffset);
      } else {
        pixelArray = new Uint32Array(pixelData.buffer, pixelDataOffset);
      }
    } else {
      return { success: false, error: '无法读取像素数据' };
    }

    const pixelValues = Array.from(pixelArray.slice(0, rows * cols));

    return {
      success: true,
      pixels: pixelValues,
      rows,
      cols,
      bitsAllocated,
      isLargeFile,
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('apply-roi-replacement', async (_event, roiData) => {
  if (!currentDataSet) {
    return { success: false, error: '未加载 DICOM 文件' };
  }

  try {
    const { startX, startY, width, height, newValue } = roiData;

    const rows = parseInt(currentDataSet.string('x00280010')) || 0;
    const cols = parseInt(currentDataSet.string('x00280011')) || 0;
    const bitsAllocated = parseInt(currentDataSet.string('x00280100')) || 8;
    const bytesPerPixel = bitsAllocated / 8;

    if (isLargeFile && currentFileDescriptor !== null) {
      for (let y = startY; y < startY + height && y < rows; y++) {
        for (let x = startX; x < startX + width && x < cols; x++) {
          const pixelIndex = y * cols + x;
          const byteOffset = pixelDataOffset + pixelIndex * bytesPerPixel;

          const valueBuffer = Buffer.alloc(bytesPerPixel);
          if (bitsAllocated <= 8) {
            valueBuffer.writeUInt8(newValue & 0xff, 0);
          } else if (bitsAllocated <= 16) {
            if (currentTransferSyntax.littleEndian) {
              valueBuffer.writeUInt16LE(newValue & 0xffff, 0);
            } else {
              valueBuffer.writeUInt16BE(newValue & 0xffff, 0);
            }
          } else {
            if (currentTransferSyntax.littleEndian) {
              valueBuffer.writeUInt32LE(newValue >>> 0, 0);
            } else {
              valueBuffer.writeUInt32BE(newValue >>> 0, 0);
            }
          }

          fs.writeSync(currentFileDescriptor, valueBuffer, 0, bytesPerPixel, byteOffset);
        }
      }
    } else if (currentByteArray) {
      const modifiedByteArray = new Uint8Array(currentByteArray);

      for (let y = startY; y < startY + height && y < rows; y++) {
        for (let x = startX; x < startX + width && x < cols; x++) {
          const pixelIndex = y * cols + x;
          const byteOffset = pixelDataOffset + pixelIndex * bytesPerPixel;

          if (bitsAllocated <= 8) {
            modifiedByteArray[byteOffset] = newValue & 0xff;
          } else if (bitsAllocated <= 16) {
            const view = new DataView(modifiedByteArray.buffer);
            if (currentTransferSyntax.littleEndian) {
              view.setUint16(byteOffset, newValue & 0xffff, true);
            } else {
              view.setUint16(byteOffset, newValue & 0xffff, false);
            }
          } else {
            const view = new DataView(modifiedByteArray.buffer);
            if (currentTransferSyntax.littleEndian) {
              view.setUint32(byteOffset, newValue >>> 0, true);
            } else {
              view.setUint32(byteOffset, newValue >>> 0, false);
            }
          }
        }
      }

      currentByteArray = modifiedByteArray;
    }

    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('set-tag-value', async (_event, tag, newValue) => {
  if (!currentDataSet) {
    return { success: false, error: '未加载 DICOM 文件' };
  }

  if (isLargeFile) {
    return { success: false, error: '大文件模式下暂不支持 Tag 编辑' };
  }

  if (!currentByteArray) {
    return { success: false, error: '未加载 DICOM 数据' };
  }

  try {
    const element = currentDataSet.elements[tag];
    if (!element) {
      return { success: false, error: `Tag ${tag} 不存在` };
    }

    const oldValue = currentDataSet.string(tag) || '';
    const newBytes = encodeString(newValue, element.vr);

    const oldLength = element.length;
    const newLength = newBytes.length;

    let resultByteArray;

    if (newLength <= oldLength) {
      resultByteArray = new Uint8Array(currentByteArray);
      newBytes.forEach((byte, idx) => {
        resultByteArray[element.dataOffset + idx] = byte;
      });
      for (let i = newLength; i < oldLength; i++) {
        resultByteArray[element.dataOffset + i] = 0;
      }
    } else {
      const lengthDiff = newLength - oldLength;
      resultByteArray = new Uint8Array(currentByteArray.length + lengthDiff);

      const beforeEnd = element.dataOffset + oldLength;

      resultByteArray.set(currentByteArray.slice(0, element.dataOffset), 0);

      newBytes.forEach((byte, idx) => {
        resultByteArray[element.dataOffset + idx] = byte;
      });

      resultByteArray.set(currentByteArray.slice(beforeEnd), element.dataOffset + newLength);

      const view = new DataView(resultByteArray.buffer);
      const lengthFieldOffset = element.dataOffset - 2;
      if (element.vr === 'OB' || element.vr === 'OW' || element.vr === 'OF' ||
          element.vr === 'SQ' || element.vr === 'UT' || element.vr === 'UN') {
        view.setUint32(lengthFieldOffset, newLength, true);
      } else {
        view.setUint16(lengthFieldOffset, newLength, true);
      }
    }

    currentByteArray = resultByteArray;
    currentDataSet = dicomParser.parseDicom(resultByteArray);

    const pixelDataElement = currentDataSet.elements.x7fe00010;
    if (pixelDataElement) {
      pixelDataOffset = pixelDataElement.dataOffset;
      pixelDataLength = pixelDataElement.length;
    }

    return { success: true, oldValue };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('save-dicom', async () => {
  const result = await dialog.showSaveDialog(mainWindow, {
    defaultPath: currentFilePath || 'output.dcm',
    filters: [{ name: 'DICOM Files', extensions: ['dcm', 'dicom', ''] }],
  });

  if (result.canceled) {
    return { success: false, canceled: true };
  }

  try {
    if (isLargeFile && currentFileDescriptor !== null) {
      fs.closeSync(currentFileDescriptor);
      currentFileDescriptor = null;
      fs.copyFileSync(currentFilePath, result.filePath);
      currentFilePath = result.filePath;
      currentFileDescriptor = fs.openSync(currentFilePath, 'r+');
    } else if (currentByteArray) {
      fs.writeFileSync(result.filePath, Buffer.from(currentByteArray));
      currentFilePath = result.filePath;
    } else {
      return { success: false, error: '没有数据可保存' };
    }

    return { success: true, filePath: result.filePath };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

function encodeString(str, vr) {
  const encoder = new TextEncoder();
  return encoder.encode(str);
}

function getTagDescription(tag) {
  const tagDict = {
    'x00020010': 'Transfer Syntax UID',
    'x00080005': 'Specific Character Set',
    'x00080008': 'Image Type',
    'x00080016': 'SOP Class UID',
    'x00080018': 'SOP Instance UID',
    'x00080020': 'Study Date',
    'x00080021': 'Series Date',
    'x00080030': 'Study Time',
    'x00080031': 'Series Time',
    'x00080050': 'Accession Number',
    'x00080060': 'Modality',
    'x00080070': 'Manufacturer',
    'x00080080': 'Institution Name',
    'x00080090': 'Referring Physician Name',
    'x00081030': 'Study ID',
    'x00100010': 'Patient Name',
    'x00100020': 'Patient ID',
    'x00100030': 'Patient Birth Date',
    'x00100040': 'Patient Sex',
    'x00180050': 'Slice Thickness',
    'x00180060': 'KVP',
    'x00181030': 'Protocol Name',
    'x0020000D': 'Study Instance UID',
    'x0020000E': 'Series Instance UID',
    'x00200010': 'Study ID',
    'x00200011': 'Series Number',
    'x00200012': 'Acquisition Number',
    'x00200013': 'Instance Number',
    'x00280002': 'Samples Per Pixel',
    'x00280004': 'Photometric Interpretation',
    'x00280010': 'Rows',
    'x00280011': 'Columns',
    'x00280030': 'Pixel Spacing',
    'x00280100': 'Bits Allocated',
    'x00280101': 'Bits Stored',
    'x00280102': 'High Bit',
    'x00280103': 'Pixel Representation',
    'x7fe00010': 'Pixel Data',
  };

  return tagDict[tag] || '';
}

const REQUIRED_TAGS = [
  { tag: 'x00080016', name: 'SOP Class UID', vr: 'UI', module: 'SOP Common' },
  { tag: 'x00080018', name: 'SOP Instance UID', vr: 'UI', module: 'SOP Common' },
  { tag: 'x00080020', name: 'Study Date', vr: 'DA', module: 'General Study' },
  { tag: 'x00080030', name: 'Study Time', vr: 'TM', module: 'General Study' },
  { tag: 'x00080050', name: 'Accession Number', vr: 'SH', module: 'General Study' },
  { tag: 'x00080060', name: 'Modality', vr: 'CS', module: 'General Series' },
  { tag: 'x00080090', name: 'Referring Physician Name', vr: 'PN', module: 'General Study' },
  { tag: 'x00100010', name: 'Patient Name', vr: 'PN', module: 'Patient' },
  { tag: 'x00100020', name: 'Patient ID', vr: 'LO', module: 'Patient' },
  { tag: 'x00100030', name: 'Patient Birth Date', vr: 'DA', module: 'Patient' },
  { tag: 'x00100040', name: 'Patient Sex', vr: 'CS', module: 'Patient' },
  { tag: 'x0020000D', name: 'Study Instance UID', vr: 'UI', module: 'General Study' },
  { tag: 'x0020000E', name: 'Series Instance UID', vr: 'UI', module: 'General Series' },
  { tag: 'x00200011', name: 'Series Number', vr: 'IS', module: 'General Series' },
  { tag: 'x00280002', name: 'Samples Per Pixel', vr: 'US', module: 'Image Pixel' },
  { tag: 'x00280004', name: 'Photometric Interpretation', vr: 'CS', module: 'Image Pixel' },
  { tag: 'x00280010', name: 'Rows', vr: 'US', module: 'Image Pixel' },
  { tag: 'x00280011', name: 'Columns', vr: 'US', module: 'Image Pixel' },
  { tag: 'x00280100', name: 'Bits Allocated', vr: 'US', module: 'Image Pixel' },
  { tag: 'x00280101', name: 'Bits Stored', vr: 'US', module: 'Image Pixel' },
  { tag: 'x00280102', name: 'High Bit', vr: 'US', module: 'Image Pixel' },
  { tag: 'x00280103', name: 'Pixel Representation', vr: 'US', module: 'Image Pixel' },
  { tag: 'x7fe00010', name: 'Pixel Data', vr: 'OB/OW', module: 'Image Pixel' },
];

ipcMain.handle('validate-dicom', async () => {
  if (!currentDataSet) {
    return { success: false, error: '未加载 DICOM 文件' };
  }

  try {
    const errors = [];
    const warnings = [];

    for (const required of REQUIRED_TAGS) {
      const element = currentDataSet.elements[required.tag];
      if (!element) {
        errors.push({
          tag: required.tag,
          tagFormatted: formatTag(required.tag),
          name: required.name,
          vr: required.vr,
          module: required.module,
          level: 'error',
          message: `缺少必填 Tag: ${required.name}`,
        });
      } else {
        let value;
        try {
          value = currentDataSet.string(required.tag);
        } catch (e) {
          value = null;
        }

        if (value === undefined || value === null || value === '') {
          warnings.push({
            tag: required.tag,
            tagFormatted: formatTag(required.tag),
            name: required.name,
            vr: required.vr,
            module: required.module,
            level: 'warning',
            message: `Tag ${required.name} 存在但值为空`,
          });
        }
      }
    }

    const transferSyntaxUID = currentDataSet.string('x00020010');
    if (!transferSyntaxUID) {
      errors.push({
        tag: 'x00020010',
        tagFormatted: formatTag('x00020010'),
        name: 'Transfer Syntax UID',
        vr: 'UI',
        module: 'File Meta Information',
        level: 'error',
        message: '缺少 Transfer Syntax UID',
      });
    }

    return {
      success: true,
      errors,
      warnings,
      totalErrors: errors.length,
      totalWarnings: warnings.length,
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

function formatTag(tag) {
  const t = tag.toUpperCase().replace('X', '');
  const group = t.substring(0, 4);
  const elementNum = t.substring(4, 8);
  return `(${group},${elementNum})`;
}

ipcMain.handle('export-tag-dictionary', async () => {
  const result = await dialog.showSaveDialog(mainWindow, {
    defaultPath: 'dicom-tag-dictionary.json',
    filters: [{ name: 'JSON Files', extensions: ['json'] }],
  });

  if (result.canceled) {
    return { success: false, canceled: true };
  }

  try {
    const tagDictionary = {};
    
    for (const propertyName in currentDataSet.elements) {
      const element = currentDataSet.elements[propertyName];
      let value;
      try {
        value = currentDataSet.string(propertyName);
      } catch (e) {
        value = '[二进制数据]';
      }

      tagDictionary[propertyName] = {
        tag: propertyName,
        tagFormatted: formatTag(propertyName),
        vr: element.vr,
        value: value !== undefined ? value : '',
        description: getTagDescription(propertyName),
        length: element.length,
      };
    }

    const exportData = {
      exportedAt: new Date().toISOString(),
      sourceFile: currentFilePath,
      transferSyntax: currentTransferSyntax,
      tags: tagDictionary,
    };

    fs.writeFileSync(result.filePath, JSON.stringify(exportData, null, 2), 'utf-8');

    return { success: true, filePath: result.filePath, tagCount: Object.keys(tagDictionary).length };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('import-tag-dictionary', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [{ name: 'JSON Files', extensions: ['json'] }],
  });

  if (result.canceled) {
    return { success: false, canceled: true };
  }

  try {
    const filePath = result.filePaths[0];
    const jsonContent = fs.readFileSync(filePath, 'utf-8');
    const importData = JSON.parse(jsonContent);

    if (!importData.tags || typeof importData.tags !== 'object') {
      return { success: false, error: '无效的字典文件格式' };
    }

    return {
      success: true,
      filePath,
      data: importData,
      tagCount: Object.keys(importData.tags).length,
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('batch-modify-tags', async (_event, modifications) => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: 'DICOM Files', extensions: ['dcm', 'dicom', ''] }],
  });

  if (result.canceled) {
    return { success: false, canceled: true };
  }

  const filePaths = result.filePaths;
  const results = [];

  for (const filePath of filePaths) {
    try {
      const fileBuffer = fs.readFileSync(filePath);
      const byteArray = new Uint8Array(fileBuffer);
      let dataSet;

      try {
        dataSet = dicomParser.parseDicom(byteArray);
      } catch (parseError) {
        dataSet = dicomParser.parseDicom(byteArray, { ignoreErrors: true });
      }

      let modifiedByteArray = new Uint8Array(byteArray);
      let hasModifications = false;

      for (const mod of modifications) {
        const element = dataSet.elements[mod.tag];
        if (!element) continue;

        const newBytes = encodeString(mod.value, element.vr);
        const oldLength = element.length;
        const newLength = newBytes.length;

        if (newLength <= oldLength) {
          newBytes.forEach((byte, idx) => {
            modifiedByteArray[element.dataOffset + idx] = byte;
          });
          for (let i = newLength; i < oldLength; i++) {
            modifiedByteArray[element.dataOffset + i] = 0;
          }
          hasModifications = true;
        }
      }

      if (hasModifications) {
        fs.writeFileSync(filePath, Buffer.from(modifiedByteArray));
        results.push({ filePath, success: true, message: '修改成功' });
      } else {
        results.push({ filePath, success: true, message: '无需修改' });
      }
    } catch (error) {
      results.push({ filePath, success: false, error: error.message });
    }
  }

  const successCount = results.filter(r => r.success).length;
  const failCount = results.filter(r => !r.success).length;

  return {
    success: true,
    totalFiles: filePaths.length,
    successCount,
    failCount,
    results,
  };
});