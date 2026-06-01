import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { fileURLToPath } from 'url';
import type { ExportTask, ExportOptions } from '../../shared/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const EXPORTS_DIR = path.join(__dirname, '../../exports');
const RECORDINGS_DIR = path.join(__dirname, '../../recordings');

interface ExportTasksStore {
  tasks: Map<string, ExportTask>;
}

const store: ExportTasksStore = {
  tasks: new Map(),
};

function ensureExportsDir() {
  if (!fs.existsSync(EXPORTS_DIR)) {
    fs.mkdirSync(EXPORTS_DIR, { recursive: true });
  }
}

export function createExportTask(recordingId: string, options: ExportOptions): ExportTask {
  ensureExportsDir();

  const taskId = `export-${uuidv4().slice(0, 8)}`;
  const now = Date.now();

  const task: ExportTask = {
    id: taskId,
    recordingId,
    format: options.format,
    status: 'pending',
    progress: 0,
    startTime: now,
  };

  store.tasks.set(taskId, task);

  processExport(taskId, options);

  return task;
}

async function processExport(taskId: string, options: ExportOptions) {
  const task = store.tasks.get(taskId);
  if (!task) return;

  task.status = 'processing';
  task.progress = 0;

  try {
    const outputFileName = `${task.recordingId}-${taskId}.${options.format}`;
    const outputPath = path.join(EXPORTS_DIR, outputFileName);

    await simulateConversion(task, outputPath, options);

    task.status = 'completed';
    task.progress = 100;
    task.endTime = Date.now();
    task.outputFile = outputPath;

    const fakeSize = Math.floor(Math.random() * 500000000) + 100000000;
    task.fileSize = fakeSize;

    if (fs.existsSync(outputPath)) {
      task.fileSize = fs.statSync(outputPath).size;
    }

    console.log(`[Export] Task ${taskId} completed: ${outputFileName} (${formatFileSize(task.fileSize)})`);
  } catch (error: any) {
    task.status = 'failed';
    task.error = error.message || 'Export failed';
    task.endTime = Date.now();
    console.error(`[Export] Task ${taskId} failed:`, error.message);
  }
}

async function simulateConversion(task: ExportTask, outputPath: string, options: ExportOptions) {
  const totalSteps = 20;

  for (let step = 1; step <= totalSteps; step++) {
    await new Promise(resolve => setTimeout(resolve, 500));
    task.progress = Math.floor((step / totalSteps) * 100);

    if (step === 1) {
      writeAviHeader(outputPath, options);
    } else if (step <= totalSteps - 2) {
      appendAviFrame(outputPath, options);
    } else {
      finalizeAvi(outputPath, options);
    }
  }
}

function writeAviHeader(outputPath: string, options: ExportOptions) {
  const qualityBitrate: Record<string, number> = {
    high: 8000000,
    medium: 4000000,
    low: 2000000,
  };

  const bitrate = qualityBitrate[options.quality] || 4000000;
  const width = 1920;
  const height = 1080;
  const fps = 25;
  const frameCount = 15000;

  const headerSize = 2048;
  const header = Buffer.alloc(headerSize);

  header.write('RIFF', 0);
  header.writeUInt32LE(headerSize + frameCount * 1024 - 8, 4);
  header.write('AVI ', 8);

  header.write('LIST', 12);
  header.writeUInt32LE(192, 16);
  header.write('hdrl', 20);

  header.write('avih', 24);
  header.writeUInt32LE(56, 28);
  header.writeUInt32LE(Math.floor(1000000 / fps), 32);
  header.writeUInt32LE(bitrate / 8, 36);
  header.writeUInt32LE(0, 40);
  header.writeUInt32LE(0x10 | 0x20, 44);
  header.writeUInt32LE(frameCount, 48);
  header.writeUInt32LE(0, 52);
  header.writeUInt32LE(1, 56);
  header.writeUInt32LE(width * height * 3, 60);
  header.writeUInt32LE(width, 64);
  header.writeUInt32LE(height, 68);

  header.write('LIST', 76);
  header.writeUInt32LE(116, 80);
  header.write('strl', 84);

  header.write('strh', 88);
  header.writeUInt32LE(56, 92);
  header.write('vids', 96);
  header.write('XVID', 100);
  header.writeUInt32LE(0, 104);
  header.writeUInt32LE(0, 108);
  header.writeUInt32LE(0, 112);
  header.writeUInt32LE(1, 116);
  header.writeUInt32LE(fps, 120);
  header.writeUInt32LE(0, 124);
  header.writeUInt32LE(frameCount, 128);
  header.writeUInt32LE(width * height * 3, 132);
  header.writeUInt32LE(0, 136);
  header.writeUInt16LE(width, 140);
  header.writeUInt16LE(height, 142);

  header.write('strf', 148);
  header.writeUInt32LE(40, 152);
  header.writeUInt32LE(40, 156);
  header.writeUInt32LE(width, 160);
  header.writeUInt32LE(height, 164);
  header.writeUInt16LE(1, 168);
  header.writeUInt16LE(24, 170);
  header.write('XVID', 172);
  header.writeUInt32LE(width * height * 3, 176);
  header.writeUInt32LE(0, 180);
  header.writeUInt32LE(0, 184);
  header.writeUInt32LE(0, 188);
  header.writeUInt32LE(0, 192);

  if (options.includeAudio) {
    header.write('LIST', 200);
    header.writeUInt32LE(80, 204);
    header.write('strl', 208);

    header.write('strh', 212);
    header.writeUInt32LE(56, 216);
    header.write('auds', 220);

    header.write('strf', 276);
    header.writeUInt32LE(18, 280);
    header.writeUInt16LE(1, 284);
    header.writeUInt16LE(2, 286);
    header.writeUInt32LE(44100, 288);
    header.writeUInt32LE(176400, 292);
    header.writeUInt16LE(4, 296);
    header.writeUInt16LE(16, 298);
    header.writeUInt16LE(0, 300);
  }

  fs.writeFileSync(outputPath, header);
}

function appendAviFrame(outputPath: string, _options: ExportOptions) {
  const frameSize = Math.floor(Math.random() * 30000) + 5000;
  const frame = Buffer.alloc(frameSize);

  frame.write('00dc', 0);
  frame.writeUInt32LE(frameSize - 8, 4);

  for (let i = 8; i < Math.min(32, frameSize); i++) {
    frame[i] = Math.floor(Math.random() * 256);
  }

  const fd = fs.openSync(outputPath, 'a');
  fs.writeSync(fd, frame);
  fs.closeSync(fd);
}

function finalizeAvi(outputPath: string, _options: ExportOptions) {
  const idx1Size = 12 * 15000;
  const idx1 = Buffer.alloc(Math.min(idx1Size, 1024));

  idx1.write('idx1', 0);
  idx1.writeUInt32LE(idx1Size - 8, 4);

  let offset = 2048;
  for (let i = 0; i < Math.min(15000, 85); i++) {
    const base = 8 + i * 12;
    if (base + 12 > idx1.length) break;
    idx1.write('00dc', base);
    idx1.writeUInt32LE(0x10, base + 4);
    idx1.writeUInt32LE(offset, base + 8);
    offset += 3072;
  }

  const fd = fs.openSync(outputPath, 'a');
  fs.writeSync(fd, idx1);
  fs.closeSync(fd);
}

export function getExportTask(taskId: string): ExportTask | null {
  return store.tasks.get(taskId) || null;
}

export function getAllExportTasks(recordingId?: string): ExportTask[] {
  const tasks = Array.from(store.tasks.values());
  if (recordingId) {
    return tasks.filter(t => t.recordingId === recordingId);
  }
  return tasks;
}

export function getExportFilePath(taskId: string): string | null {
  const task = store.tasks.get(taskId);
  if (!task || task.status !== 'completed' || !task.outputFile) return null;
  return task.outputFile;
}

export function deleteExportTask(taskId: string): boolean {
  const task = store.tasks.get(taskId);
  if (!task) return false;

  if (task.outputFile && fs.existsSync(task.outputFile)) {
    fs.unlinkSync(task.outputFile);
  }

  store.tasks.delete(taskId);
  return true;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
