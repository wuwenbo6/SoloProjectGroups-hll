const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { WaveFile } = require('wavefile');
const { lc3Encode, lc3Decode } = require('./src/lc3');
const { calculateMOS } = require('./src/mos');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools();
  }
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

ipcMain.handle('select-wav-file', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [
      { name: 'WAV Files', extensions: ['wav'] }
    ]
  });

  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }

  const filePath = result.filePaths[0];
  const fileBuffer = fs.readFileSync(filePath);
  const fileName = path.basename(filePath);
  const fileSize = fs.statSync(filePath).size;

  return {
    name: fileName,
    size: fileSize,
    data: Array.from(fileBuffer)
  };
});

ipcMain.handle('process-audio', async (event, wavDataArray, bitrate) => {
  try {
    const wavBuffer = Buffer.from(wavDataArray);
    const wav = new WaveFile(wavBuffer);

    const sampleRate = wav.fmt.sampleRate;
    const numChannels = wav.fmt.numChannels;
    const bitDepth = wav.fmt.bitsPerSample;

    if (bitDepth !== 16) {
      throw new Error('只支持16位WAV文件');
    }

    const samples = wav.getSamples(false, Float64Array);
    const channelData = numChannels === 1 ? [samples] : [samples[0], samples[1]];

    const encoded = lc3Encode(channelData, sampleRate, bitrate, numChannels);
    const decoded = lc3Decode(encoded, sampleRate, bitrate, numChannels);

    const outputWav = new WaveFile();
    outputWav.fromScratch(
      numChannels,
      sampleRate,
      '16',
      decoded.map(ch => Array.from(ch))
    );

    const outputBuffer = outputWav.toBuffer();

    const originalSamples = channelData[0];
    const processedSamples = decoded[0];
    const minLen = Math.min(originalSamples.length, processedSamples.length);

    const mosScore = calculateMOS(
      originalSamples.slice(0, minLen),
      processedSamples.slice(0, minLen),
      sampleRate
    );

    const originalSize = wavBuffer.length;
    const compressedSize = encoded.byteLength;
    const compressionRatio = (compressedSize / originalSize * 100).toFixed(2);

    return {
      success: true,
      processedData: Array.from(outputBuffer),
      compressedSize: compressedSize,
      originalSize: originalSize,
      compressionRatio: compressionRatio,
      mos: mosScore,
      bitrate: bitrate,
      sampleRate: sampleRate,
      numChannels: numChannels
    };
  } catch (error) {
    console.error('处理音频时出错:', error);
    return {
      success: false,
      error: error.message
    };
  }
});

ipcMain.handle('process-audio-multi-bitrate', async (event, wavDataArray, bitrates) => {
  try {
    const wavBuffer = Buffer.from(wavDataArray);
    const wav = new WaveFile(wavBuffer);

    const sampleRate = wav.fmt.sampleRate;
    const numChannels = wav.fmt.numChannels;
    const bitDepth = wav.fmt.bitsPerSample;

    if (bitDepth !== 16) {
      throw new Error('只支持16位WAV文件');
    }

    const samples = wav.getSamples(false, Float64Array);
    const channelData = numChannels === 1 ? [samples] : [samples[0], samples[1]];
    const originalSamples = channelData[0];
    const originalSize = wavBuffer.length;

    const results = [];

    for (const bitrate of bitrates) {
      const encoded = lc3Encode(channelData, sampleRate, bitrate, numChannels);
      const decoded = lc3Decode(encoded, sampleRate, bitrate, numChannels);

      const outputWav = new WaveFile();
      outputWav.fromScratch(
        numChannels,
        sampleRate,
        '16',
        decoded.map(ch => Array.from(ch))
      );

      const outputBuffer = outputWav.toBuffer();
      const processedSamples = decoded[0];
      const minLen = Math.min(originalSamples.length, processedSamples.length);

      const mosScore = calculateMOS(
        originalSamples.slice(0, minLen),
        processedSamples.slice(0, minLen),
        sampleRate
      );

      const compressedSize = encoded.byteLength;
      const compressionRatio = (compressedSize / originalSize * 100).toFixed(2);

      results.push({
        bitrate: bitrate,
        processedData: Array.from(outputBuffer),
        compressedSize: compressedSize,
        compressionRatio: compressionRatio,
        mos: mosScore
      });
    }

    return {
      success: true,
      originalSize: originalSize,
      sampleRate: sampleRate,
      numChannels: numChannels,
      results: results
    };
  } catch (error) {
    console.error('多比特率处理音频时出错:', error);
    return {
      success: false,
      error: error.message
    };
  }
});

ipcMain.handle('process-audio-chunk', async (event, chunkData, sampleRate, bitrate, numChannels) => {
  try {
    const channelData = [];
    for (let ch = 0; ch < numChannels; ch++) {
      const channelSamples = new Float64Array(chunkData[ch]);
      channelData.push(channelSamples);
    }

    const encoded = lc3Encode(channelData, sampleRate, bitrate, numChannels);
    const decoded = lc3Decode(encoded, sampleRate, bitrate, numChannels);

    const decodedData = decoded.map(ch => Array.from(ch));

    const minLen = Math.min(channelData[0].length, decoded[0].length);
    const mosScore = calculateMOS(
      channelData[0].slice(0, minLen),
      decoded[0].slice(0, minLen),
      sampleRate
    );

    return {
      success: true,
      decodedData: decodedData,
      mos: mosScore,
      compressedSize: encoded.byteLength
    };
  } catch (error) {
    console.error('处理音频块时出错:', error);
    return {
      success: false,
      error: error.message
    };
  }
});
