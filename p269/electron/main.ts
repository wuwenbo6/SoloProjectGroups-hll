import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron';
import * as path from 'path';
import * as os from 'os';
import { fileURLToPath } from 'url';
import { WavReader } from './dsp/wav-reader';
import { Fsk4Demodulator } from './dsp/fsk4-demodulator';
import { DmrParser } from './dsp/dmr-parser';
import { VoiceSaver } from './dsp/voice-saver';
import type { WavFileInfo, DemodulationConfig, AnalysisResult, AnalysisProgress, TimeSlotOccupancy } from '@shared/types';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow: BrowserWindow | null = null;
let isAnalyzing = false;
let shouldCancel = false;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1280,
    minHeight: 800,
    backgroundColor: '#0a0e17',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    titleBarStyle: 'hiddenInset',
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

ipcMain.handle('dmr:select-file', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [
      { name: 'WAV Audio Files', extensions: ['wav'] },
      { name: 'All Files', extensions: ['*'] },
    ],
  });

  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }

  try {
    const filePath = result.filePaths[0];
    const wavData = WavReader.readFile(filePath);
    return wavData.info;
  } catch (error) {
    console.error('Error reading WAV file:', error);
    return null;
  }
});

ipcMain.handle('dmr:start-analysis', async (_event, { filePath, config }: { filePath: string; config: DemodulationConfig }) => {
  if (isAnalyzing) {
    return;
  }

  isAnalyzing = true;
  shouldCancel = false;

  try {
    sendProgress('reading', 0);

    const wavData = WavReader.readFile(filePath);
    sendProgress('reading', 10);

    if (shouldCancel) {
      isAnalyzing = false;
      return;
    }

    const normalizedSamples = WavReader.normalize(wavData.samples);
    sendProgress('demodulating', 20);

    const demodulator = new Fsk4Demodulator(config, wavData.sampleRate);

    const chunkSize = Math.floor(wavData.samples.length / 10);
    let allSymbols: number[] = [];

    for (let i = 0; i < 10; i++) {
      if (shouldCancel) {
        isAnalyzing = false;
        return;
      }

      const start = i * chunkSize;
      const end = i === 9 ? wavData.samples.length : (i + 1) * chunkSize;
      const chunk = normalizedSamples.slice(start, end);
      const result = demodulator.demodulate(chunk);
      allSymbols = allSymbols.concat(result.symbols);

      const progress = 20 + (i + 1) * 6;
      sendProgress('demodulating', progress);
    }

    if (shouldCancel) {
      isAnalyzing = false;
      return;
    }

    sendProgress('parsing', 80);

    const parser = new DmrParser(config.symbolRate);
    const frames = parser.parse(allSymbols, wavData.sampleRate);

    if (shouldCancel) {
      isAnalyzing = false;
      return;
    }

    sendProgress('parsing', 90);

    const timeSlotsWithSamples = parser.generateTimeSlots(frames);
    const outputDir = path.join(os.tmpdir(), 'dmr_voice_segments', path.basename(filePath, path.extname(filePath)));
    const voiceSaver = new VoiceSaver(outputDir, wavData.sampleRate);

    const finalTimeSlots: TimeSlotOccupancy[] = [];
    for (let i = 0; i < timeSlotsWithSamples.length; i++) {
      const ts = timeSlotsWithSamples[i];
      let voiceFile: string | undefined;
      
      if (ts.voiceSamples && ts.voiceSamples.length > 0) {
        voiceFile = voiceSaver.saveVoiceSegment({
          slot: ts.slot,
          startTime: ts.startTime,
          endTime: ts.endTime,
          callType: ts.callType,
          talkgroupId: ts.talkgroupId,
          sourceId: ts.sourceId,
          destinationId: ts.destinationId,
          samples: ts.voiceSamples,
        }, i + 1) || undefined;
      }

      finalTimeSlots.push({
        slot: ts.slot,
        startTime: ts.startTime,
        endTime: ts.endTime,
        callType: ts.callType,
        sourceId: ts.sourceId,
        destinationId: ts.destinationId,
        talkgroupId: ts.talkgroupId,
        duration: ts.duration,
        frameCount: ts.frameCount,
        voiceFile,
      });
    }

    const statistics = parser.generateStatistics(frames, finalTimeSlots, wavData.info.duration * 1000);

    const demodResult = demodulator.demodulate(normalizedSamples);

    const analysisResult: AnalysisResult = {
      fileInfo: wavData.info,
      demodulation: {
        ...demodResult,
        symbols: allSymbols,
      },
      frames,
      timeSlots: finalTimeSlots,
      callStatistics: statistics,
      voiceOutputDir: outputDir,
    };

    sendProgress('complete', 100);

    mainWindow?.webContents.send('dmr:analysis-complete', analysisResult);
  } catch (error) {
    console.error('Analysis error:', error);
    mainWindow?.webContents.send('dmr:analysis-error', {
      message: error instanceof Error ? error.message : 'Unknown error occurred',
    });
  } finally {
    isAnalyzing = false;
  }
});

ipcMain.handle('dmr:cancel-analysis', () => {
  shouldCancel = true;
  isAnalyzing = false;
});

ipcMain.handle('dmr:open-voice-file', async (_event, filePath: string) => {
  try {
    await shell.openPath(filePath);
  } catch (error) {
    console.error('Failed to open voice file:', error);
  }
});

ipcMain.handle('dmr:open-voice-folder', async (_event, folderPath: string) => {
  try {
    await shell.openPath(folderPath);
  } catch (error) {
    console.error('Failed to open voice folder:', error);
  }
});

function sendProgress(phase: AnalysisProgress['phase'], progress: number) {
  mainWindow?.webContents.send('dmr:analysis-progress', { phase, progress });
}
