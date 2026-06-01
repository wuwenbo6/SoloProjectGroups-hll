import type { WebSocket as WS } from 'ws';

export interface LogEntry {
  timestamp: number;
  type: 'send' | 'ack' | 'error' | 'info';
  message: string;
  blockNum?: number;
  blockSize?: number;
  moreBlocks?: boolean;
}

export interface UploadProgress {
  id: string;
  fileName: string;
  fileSize: number;
  status: 'pending' | 'uploading' | 'completed' | 'failed';
  currentBlock: number;
  totalBlocks: number;
  bytesSent: number;
  totalBytes: number;
  blockSize: number;
  speed: number;
  logs: LogEntry[];
  createdAt: number;
  completedAt?: number;
  lastSuccessfulBlock: number;
}

export interface UploadRecord {
  id: string;
  fileName: string;
  fileSize: number;
  status: 'completed' | 'failed';
  totalBlocks: number;
  blockSize: number;
  createdAt: number;
  completedAt?: number;
  lastSuccessfulBlock: number;
}

class UploadStore {
  private uploads: Map<string, UploadProgress> = new Map();
  private records: UploadRecord[] = [];
  private wsClients: Set<WS> = new Set();

  addWsClient(ws: WS) {
    this.wsClients.add(ws);
    ws.on('close', () => this.wsClients.delete(ws));
  }

  updateCoapBlockReceived(info: { uploadId: string; blockNum: number; more: boolean; size: number }) {
    this.broadcastObserverNotification({
      type: 'coap_block_received',
      uploadId: info.uploadId,
      blockNum: info.blockNum,
      more: info.more,
      size: info.size,
      timestamp: Date.now(),
    });
  }

  broadcastObserverNotification(data: Record<string, unknown>) {
    const msg = JSON.stringify({ type: 'observe', data });
    for (const ws of this.wsClients) {
      if (ws.readyState === 1) {
        ws.send(msg);
      }
    }
  }

  createUpload(id: string, fileName: string, fileSize: number, totalBlocks: number, blockSize: number): UploadProgress {
    const progress: UploadProgress = {
      id,
      fileName,
      fileSize,
      status: 'pending',
      currentBlock: 0,
      totalBlocks,
      bytesSent: 0,
      totalBytes: fileSize,
      blockSize,
      speed: 0,
      logs: [],
      createdAt: Date.now(),
      lastSuccessfulBlock: -1,
    };
    this.uploads.set(id, progress);
    this.addLog(id, 'info', `上传已创建: ${fileName} (${this.formatSize(fileSize)}), ${totalBlocks} 块, 块大小 ${this.formatSize(blockSize)}`);
    this.broadcast(id);
    return progress;
  }

  resumeUpload(id: string, resumeFrom: number): UploadProgress | null {
    const upload = this.uploads.get(id);
    if (!upload) return null;

    upload.status = 'pending';
    upload.speed = 0;
    upload.currentBlock = resumeFrom;
    upload.bytesSent = resumeFrom * upload.blockSize;
    upload.lastSuccessfulBlock = resumeFrom - 1;

    this.addLog(id, 'info', `续传已启动: 从块 ${resumeFrom} 继续 (Block1 NUM=${resumeFrom}), 已成功 ${resumeFrom} 块`);
    this.broadcast(id);

    return upload;
  }

  updateProgress(id: string, info: {
    currentBlock: number;
    totalBlocks: number;
    bytesSent: number;
    totalBytes: number;
    blockSize: number;
    moreBlocks: boolean;
    responseCode: number;
    speed: number;
  }) {
    const upload = this.uploads.get(id);
    if (!upload) return;

    upload.status = 'uploading';
    upload.currentBlock = info.currentBlock;
    upload.totalBlocks = info.totalBlocks;
    upload.bytesSent = info.bytesSent;
    upload.totalBytes = info.totalBytes;
    upload.blockSize = info.blockSize;
    upload.speed = info.speed;
    upload.lastSuccessfulBlock = info.currentBlock;

    const respCodeStr = (info.responseCode >> 5) + '.' + (info.responseCode & 0x1F).toString().padStart(2, '0');

    this.addLog(id, 'send', `发送块 ${info.currentBlock}/${info.totalBlocks - 1} (${this.formatSize(info.blockSize)}), Block1(M=${info.moreBlocks ? 1 : 0}, NUM=${info.currentBlock})`, {
      blockNum: info.currentBlock,
      blockSize: info.blockSize,
      moreBlocks: info.moreBlocks,
    });

    this.addLog(id, 'ack', `收到确认 ${respCodeStr} (M=0) - 块 ${info.currentBlock} 已确认，不再重发`, {
      blockNum: info.currentBlock,
      blockSize: info.blockSize,
      moreBlocks: info.moreBlocks,
    });

    this.broadcast(id);
  }

  completeUpload(id: string, success: boolean) {
    const upload = this.uploads.get(id);
    if (!upload) return;

    upload.status = success ? 'completed' : 'failed';
    upload.completedAt = Date.now();
    upload.speed = 0;

    if (success) {
      this.addLog(id, 'info', `上传完成! ${upload.fileName} 已成功上传 (${this.formatSize(upload.totalBytes)}), 共 ${upload.totalBlocks} 块`);
    } else {
      this.addLog(id, 'error', `上传失败: ${upload.fileName}, 已成功 ${upload.lastSuccessfulBlock + 1}/${upload.totalBlocks} 块 (可续传)`);
    }

    this.records.push({
      id: upload.id,
      fileName: upload.fileName,
      fileSize: upload.fileSize,
      status: upload.status as 'completed' | 'failed',
      totalBlocks: upload.totalBlocks,
      blockSize: upload.blockSize,
      createdAt: upload.createdAt,
      completedAt: upload.completedAt,
      lastSuccessfulBlock: upload.lastSuccessfulBlock,
    });

    this.broadcast(id);
  }

  getUpload(id: string): UploadProgress | undefined {
    return this.uploads.get(id);
  }

  getRecords(): UploadRecord[] {
    return [...this.records].sort((a, b) => b.createdAt - a.createdAt);
  }

  private addLog(id: string, type: LogEntry['type'], message: string, extra?: { blockNum?: number; blockSize?: number; moreBlocks?: boolean }) {
    const upload = this.uploads.get(id);
    if (!upload) return;

    const entry: LogEntry = {
      timestamp: Date.now(),
      type,
      message,
      ...extra,
    };
    upload.logs.push(entry);
  }

  private broadcast(id: string) {
    const upload = this.uploads.get(id);
    if (!upload) return;

    const data = JSON.stringify({
      type: 'progress',
      data: {
        id: upload.id,
        status: upload.status,
        currentBlock: upload.currentBlock,
        totalBlocks: upload.totalBlocks,
        bytesSent: upload.bytesSent,
        totalBytes: upload.totalBytes,
        blockSize: upload.blockSize,
        speed: upload.speed,
        logs: upload.logs,
        fileName: upload.fileName,
        fileSize: upload.fileSize,
        createdAt: upload.createdAt,
        completedAt: upload.completedAt,
        lastSuccessfulBlock: upload.lastSuccessfulBlock,
      },
    });

    for (const ws of this.wsClients) {
      if (ws.readyState === 1) {
        ws.send(data);
      }
    }
  }

  private formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
}

export const uploadStore = new UploadStore();
