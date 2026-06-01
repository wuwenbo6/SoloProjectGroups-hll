import dgram from 'dgram';
import fs from 'fs';
import path from 'path';
import {
  type CoapMessage,
  type BlockOptionValue,
  MessageType,
  MethodCode,
  OptionNumber,
  ResponseCode,
  encodeMessage,
  decodeMessage,
  decodeBlockOption,
  encodeBlockOption,
  findOption,
  responseCodeToString,
  codeToString,
  blockSizeFromSzx,
  szxFromBlockSize,
} from './protocol.js';

export enum ServerBlockState {
  RECEIVED = 'received',
  ASSEMBLED = 'assembled',
}

export interface ServerBlockInfo {
  num: number;
  state: ServerBlockState;
  receivedAt: number;
  size: number;
}

interface PendingUpload {
  fileName: string;
  totalSize: number;
  blockSize: number;
  receivedBlocks: Map<number, Buffer>;
  blockStates: Map<number, ServerBlockInfo>;
  expectedBlocks: number;
  createdAt: number;
  lastActiveAt: number;
}

export interface UploadNotification {
  type: 'upload_progress' | 'upload_complete' | 'upload_failed';
  fileName: string;
  uploadId: string;
  blockNum: number;
  totalBlocks: number;
  receivedCount: number;
  totalSize: number;
  timestamp: number;
}

export interface ObserverRegistration {
  token: Buffer;
  rinfo: { address: string; port: number };
  resource: string;
  registeredAt: number;
  lastNotifiedSeq: number;
}

export class CoapServer {
  private socket: dgram.Socket;
  private port: number;
  private uploadsDir: string;
  private pendingUploads: Map<string, PendingUpload> = new Map();
  private completedFiles: Map<string, { fileName: string; filePath: string; size: number; completedAt: number }> = new Map();
  private onUploadComplete?: (fileName: string, filePath: string) => void;
  private onBlockReceived?: (info: {
    uploadId: string;
    blockNum: number;
    more: boolean;
    size: number;
  }) => void;
  private observers: Map<string, ObserverRegistration> = new Map();
  private observeSeq: number = 0;
  private block2Size: number = 1024;

  constructor(port: number = 5683, uploadsDir?: string) {
    this.port = port;
    this.uploadsDir = uploadsDir || path.join(process.cwd(), 'uploads');
    this.socket = dgram.createSocket('udp4');

    if (!fs.existsSync(this.uploadsDir)) {
      fs.mkdirSync(this.uploadsDir, { recursive: true });
    }

    this.socket.on('message', (msg, rinfo) => {
      try {
        this.handleMessage(msg, rinfo);
      } catch (err) {
        console.error('[CoAP Server] Error handling message:', err);
      }
    });

    this.socket.on('error', (err) => {
      console.error('[CoAP Server] Socket error:', err);
    });
  }

  setOnUploadComplete(callback: (fileName: string, filePath: string) => void) {
    this.onUploadComplete = callback;
  }

  setOnBlockReceived(callback: (info: { uploadId: string; blockNum: number; more: boolean; size: number }) => void) {
    this.onBlockReceived = callback;
  }

  setBlock2Size(size: number) {
    this.block2Size = size;
  }

  getObserverCount(): number {
    return this.observers.size;
  }

  getCompletedFiles(): Array<{ fileName: string; filePath: string; size: number; completedAt: number }> {
    return Array.from(this.completedFiles.values());
  }

  getUploadState(uploadId: string): {
    fileName: string;
    totalSize: number;
    blockSize: number;
    expectedBlocks: number;
    receivedCount: number;
    highestBlock: number;
    blockStates: Map<number, ServerBlockInfo>;
  } | null {
    const upload = this.pendingUploads.get(uploadId);
    if (!upload) return null;

    let highestBlock = -1;
    for (const num of upload.blockStates.keys()) {
      if (num > highestBlock) highestBlock = num;
    }

    return {
      fileName: upload.fileName,
      totalSize: upload.totalSize,
      blockSize: upload.blockSize,
      expectedBlocks: upload.expectedBlocks,
      receivedCount: upload.blockStates.size,
      highestBlock,
      blockStates: upload.blockStates,
    };
  }

  start(): Promise<void> {
    return new Promise((resolve) => {
      this.socket.bind(this.port, () => {
        console.log(`[CoAP Server] Listening on UDP port ${this.port}`);
        resolve();
      });
    });
  }

  stop(): Promise<void> {
    return new Promise((resolve) => {
      this.socket.close(() => resolve());
    });
  }

  private async handleMessage(msg: Buffer, rinfo: dgram.RemoteInfo) {
    let coapMsg: CoapMessage;
    try {
      coapMsg = decodeMessage(msg);
    } catch {
      console.error('[CoAP Server] Failed to decode message');
      return;
    }

    console.log(`[CoAP Server] Received ${codeToString(coapMsg.code)} from ${rinfo.address}:${rinfo.port}, MID=${coapMsg.messageId}`);

    if (coapMsg.type === MessageType.RST) {
      this.removeObserver(coapMsg.token, rinfo);
      return;
    }

    if (coapMsg.type === MessageType.ACK) {
      return;
    }

    if (coapMsg.code === MethodCode.GET) {
      await this.handleGet(coapMsg, rinfo);
    } else if (coapMsg.code === MethodCode.PUT) {
      await this.handlePut(coapMsg, rinfo);
    } else {
      this.sendReset(coapMsg, rinfo);
    }
  }

  private async handleGet(msg: CoapMessage, rinfo: dgram.RemoteInfo) {
    const observeOpt = findOption(msg.options, OptionNumber.Observe);
    let resource = '/';
    for (const opt of msg.options) {
      if (opt.number === OptionNumber.UriPath) {
        resource = opt.value.toString();
        break;
      }
    }

    if (observeOpt) {
      const observeValue = observeOpt.value.length > 0 ? observeOpt.value[0] : 0;

      if (observeValue === 0) {
        this.registerObserver(msg, rinfo, resource);
        const statusPayload = this.buildUploadStatusPayload();
        const block2Opt = findOption(msg.options, OptionNumber.Block2);

        if (block2Opt) {
          const block2 = decodeBlockOption(block2Opt.value);
          this.sendBlock2Response(msg, rinfo, statusPayload, block2.szx, this.observeSeq);
        } else {
          this.sendObserveNotification(msg, rinfo, statusPayload, this.observeSeq);
        }
        return;
      } else if (observeValue === 1) {
        this.removeObserver(msg.token, rinfo);
        this.sendAck(msg, rinfo, ResponseCode.Content);
        return;
      }
    }

    if (resource === 'status' || resource === '/') {
      const statusPayload = this.buildUploadStatusPayload();
      const block2Opt = findOption(msg.options, OptionNumber.Block2);

      if (block2Opt) {
        const block2 = decodeBlockOption(block2Opt.value);
        this.sendBlock2Response(msg, rinfo, statusPayload, block2.szx, undefined);
      } else if (statusPayload.length > this.block2Size) {
        const szx = szxFromBlockSize(this.block2Size);
        this.sendBlock2Response(msg, rinfo, statusPayload, szx, undefined);
      } else {
        this.sendGetResponse(msg, rinfo, statusPayload);
      }
      return;
    }

    const fileInfo = this.findCompletedFile(resource);
    if (fileInfo) {
      const fileData = fs.readFileSync(fileInfo.filePath);
      const block2Opt = findOption(msg.options, OptionNumber.Block2);

      if (block2Opt) {
        const block2 = decodeBlockOption(block2Opt.value);
        this.sendBlock2Response(msg, rinfo, fileData, block2.szx, undefined);
      } else if (fileData.length > this.block2Size) {
        const szx = szxFromBlockSize(this.block2Size);
        this.sendBlock2Response(msg, rinfo, fileData, szx, undefined);
      } else {
        this.sendGetResponse(msg, rinfo, fileData);
      }
      return;
    }

    this.sendAck(msg, rinfo, ResponseCode.NotFound);
  }

  private buildUploadStatusPayload(): Buffer {
    const pendingInfo = Array.from(this.pendingUploads.entries()).map(([id, upload]) => ({
      id,
      fileName: upload.fileName,
      totalSize: upload.totalSize,
      receivedCount: upload.receivedBlocks.size,
      expectedBlocks: upload.expectedBlocks,
    }));

    const completedInfo = Array.from(this.completedFiles.entries()).map(([id, info]) => ({
      id,
      fileName: info.fileName,
      size: info.size,
      completedAt: info.completedAt,
    }));

    return Buffer.from(JSON.stringify({
      pending: pendingInfo,
      completed: completedInfo,
      observers: this.observers.size,
    }));
  }

  private findCompletedFile(resourceName: string): { fileName: string; filePath: string; size: number; completedAt: number } | null {
    for (const [, info] of this.completedFiles) {
      const safeName = info.fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
      if (safeName === resourceName || info.fileName === resourceName) {
        return info;
      }
    }
    return null;
  }

  private registerObserver(msg: CoapMessage, rinfo: dgram.RemoteInfo, resource: string) {
    const key = `${rinfo.address}:${rinfo.port}:${msg.token.toString('hex')}`;
    const registration: ObserverRegistration = {
      token: Buffer.from(msg.token),
      rinfo: { address: rinfo.address, port: rinfo.port },
      resource,
      registeredAt: Date.now(),
      lastNotifiedSeq: this.observeSeq,
    };

    this.observers.set(key, registration);
    console.log(`[CoAP Server] Observer registered: ${key} for resource "${resource}" (total: ${this.observers.size})`);
  }

  private removeObserver(token: Buffer, rinfo: { address: string; port: number }) {
    const tokenHex = token.toString('hex');
    for (const [key, reg] of this.observers) {
      if (reg.token.toString('hex') === tokenHex && reg.rinfo.address === rinfo.address && reg.rinfo.port === rinfo.port) {
        this.observers.delete(key);
        console.log(`[CoAP Server] Observer removed: ${key} (remaining: ${this.observers.size})`);
        return;
      }
    }
  }

  private notifyObservers(notification: UploadNotification) {
    this.observeSeq++;
    const payload = Buffer.from(JSON.stringify(notification));

    for (const [, observer] of this.observers) {
      if (observer.resource === '/' || observer.resource === 'status') {
        try {
          this.sendObserveNotificationToObserver(observer, payload, this.observeSeq);
          observer.lastNotifiedSeq = this.observeSeq;
          console.log(`[CoAP Server] Notified observer ${observer.rinfo.address}:${observer.rinfo.port} seq=${this.observeSeq}`);
        } catch (err) {
          console.error(`[CoAP Server] Failed to notify observer:`, err);
        }
      }
    }
  }

  private sendObserveNotification(
    originalMsg: CoapMessage,
    rinfo: dgram.RemoteInfo,
    payload: Buffer,
    seq: number,
  ) {
    const response: CoapMessage = {
      version: 1,
      type: MessageType.ACK,
      tokenLength: originalMsg.token.length,
      code: ResponseCode.Content,
      messageId: originalMsg.messageId,
      token: originalMsg.token,
      options: [
        { number: OptionNumber.Observe, value: Buffer.from([seq & 0xFF]) },
        { number: OptionNumber.ContentFormat, value: Buffer.from([0x32]) },
      ],
      payload,
    };

    const buf = encodeMessage(response);
    this.socket.send(buf, rinfo.port, rinfo.address);
    console.log(`[CoAP Server] Sent Observe notification seq=${seq} to ${rinfo.address}:${rinfo.port}`);
  }

  private sendObserveNotificationToObserver(
    observer: ObserverRegistration,
    payload: Buffer,
    seq: number,
  ) {
    const mid = (Date.now() + seq) & 0xFFFF;

    if (payload.length > this.block2Size) {
      const szx = szxFromBlockSize(this.block2Size);
      const actualBlockSize = blockSizeFromSzx(szx);
      const firstChunk = payload.subarray(0, actualBlockSize);
      const hasMore = payload.length > actualBlockSize;

      const response: CoapMessage = {
        version: 1,
        type: MessageType.NON,
        tokenLength: observer.token.length,
        code: ResponseCode.Content,
        messageId: mid,
        token: observer.token,
        options: [
          { number: OptionNumber.Observe, value: Buffer.from([seq & 0xFF]) },
          { number: OptionNumber.ContentFormat, value: Buffer.from([0x32]) },
          {
            number: OptionNumber.Block2,
            value: encodeBlockOption({ szx, more: hasMore, num: 0 }),
          },
          {
            number: OptionNumber.Size2,
            value: (() => { const b = Buffer.alloc(4); b.writeUInt32BE(payload.length); return b; })(),
          },
        ],
        payload: firstChunk,
      };

      const buf = encodeMessage(response);
      this.socket.send(buf, observer.rinfo.port, observer.rinfo.address);
      return;
    }

    const response: CoapMessage = {
      version: 1,
      type: MessageType.NON,
      tokenLength: observer.token.length,
      code: ResponseCode.Content,
      messageId: mid,
      token: observer.token,
      options: [
        { number: OptionNumber.Observe, value: Buffer.from([seq & 0xFF]) },
        { number: OptionNumber.ContentFormat, value: Buffer.from([0x32]) },
      ],
      payload,
    };

    const buf = encodeMessage(response);
    this.socket.send(buf, observer.rinfo.port, observer.rinfo.address);
  }

  private sendBlock2Response(
    msg: CoapMessage,
    rinfo: dgram.RemoteInfo,
    fullPayload: Buffer,
    szx: number,
    observeSeq: number | undefined,
  ) {
    const actualBlockSize = blockSizeFromSzx(szx);
    const totalBlocks = Math.ceil(fullPayload.length / actualBlockSize);
    const block2Opt = findOption(msg.options, OptionNumber.Block2);
    let requestedNum = 0;

    if (block2Opt) {
      const reqBlock = decodeBlockOption(block2Opt.value);
      requestedNum = reqBlock.num;
      szx = Math.min(szx, reqBlock.szx);
    }

    const offset = requestedNum * actualBlockSize;
    if (offset >= fullPayload.length) {
      this.sendAck(msg, rinfo, ResponseCode.BadRequest);
      return;
    }

    const end = Math.min(offset + actualBlockSize, fullPayload.length);
    const chunk = fullPayload.subarray(offset, end);
    const isLast = requestedNum >= totalBlocks - 1;
    const more = !isLast;

    const options: { number: number; value: Buffer }[] = [
      {
        number: OptionNumber.Block2,
        value: encodeBlockOption({ szx, more, num: requestedNum }),
      },
      { number: OptionNumber.ContentFormat, value: Buffer.from([0x32]) },
    ];

    if (requestedNum === 0) {
      const sizeBuf = Buffer.alloc(4);
      sizeBuf.writeUInt32BE(fullPayload.length);
      options.push({ number: OptionNumber.Size2, value: sizeBuf });
    }

    if (observeSeq !== undefined) {
      options.push({ number: OptionNumber.Observe, value: Buffer.from([observeSeq & 0xFF]) });
    }

    const response: CoapMessage = {
      version: 1,
      type: MessageType.ACK,
      tokenLength: msg.token.length,
      code: ResponseCode.Content,
      messageId: msg.messageId,
      token: msg.token,
      options,
      payload: chunk,
    };

    const buf = encodeMessage(response);
    this.socket.send(buf, rinfo.port, rinfo.address);
    console.log(`[CoAP Server] Sent Block2 response: NUM=${requestedNum}/${totalBlocks - 1}, M=${more ? 1 : 0}, ${chunk.length}B to ${rinfo.address}:${rinfo.port}`);
  }

  private sendGetResponse(msg: CoapMessage, rinfo: dgram.RemoteInfo, payload: Buffer) {
    const response: CoapMessage = {
      version: 1,
      type: MessageType.ACK,
      tokenLength: msg.token.length,
      code: ResponseCode.Content,
      messageId: msg.messageId,
      token: msg.token,
      options: [
        { number: OptionNumber.ContentFormat, value: Buffer.from([0x32]) },
      ],
      payload,
    };

    const buf = encodeMessage(response);
    this.socket.send(buf, rinfo.port, rinfo.address);
    console.log(`[CoAP Server] Sent GET response ${payload.length}B to ${rinfo.address}:${rinfo.port}`);
  }

  private async handlePut(msg: CoapMessage, rinfo: dgram.RemoteInfo) {
    const block1Opt = findOption(msg.options, OptionNumber.Block1);

    if (!block1Opt) {
      this.sendAck(msg, rinfo, ResponseCode.BadRequest);
      return;
    }

    const block1 = decodeBlockOption(block1Opt.value);
    const blockPayload = msg.payload;
    const actualBlockSize = blockSizeFromSzx(block1.szx);

    console.log(`[CoAP Server] Block1: num=${block1.num}, more=${block1.more} (M=${block1.more ? 1 : 0}), szx=${block1.szx} (${actualBlockSize}B), payload=${blockPayload.length}B`);

    const uploadId = msg.token.toString('hex') || `mid-${msg.messageId}`;

    let upload = this.pendingUploads.get(uploadId);

    if (!upload) {
      if (block1.num !== 0) {
        console.log(`[CoAP Server] Resume requested for block ${block1.num}, but no active session. Returning 4.08 Request Entity Incomplete.`);
        this.sendAck(msg, rinfo, ResponseCode.RequestEntityIncomplete);
        return;
      }

      const size1Opt = findOption(msg.options, OptionNumber.Size1);
      const totalSize = size1Opt ? size1Opt.value.readUInt32BE(0) : 0;

      let fileName = 'upload.bin';
      for (const opt of msg.options) {
        if (opt.number === OptionNumber.UriPath) {
          fileName = opt.value.toString();
          break;
        }
      }

      const expectedBlocks = totalSize > 0 ? Math.ceil(totalSize / actualBlockSize) : 1;

      upload = {
        fileName,
        totalSize,
        blockSize: actualBlockSize,
        receivedBlocks: new Map(),
        blockStates: new Map(),
        expectedBlocks,
        createdAt: Date.now(),
        lastActiveAt: Date.now(),
      };

      this.pendingUploads.set(uploadId, upload);
      console.log(`[CoAP Server] New upload: ${fileName}, totalSize=${totalSize}, blocks=${expectedBlocks}, session=${uploadId}`);
    } else {
      upload.lastActiveAt = Date.now();

      if (block1.num === 0) {
        const size1Opt = findOption(msg.options, OptionNumber.Size1);
        if (size1Opt) {
          const totalSize = size1Opt.value.readUInt32BE(0);
          if (totalSize !== upload.totalSize) {
            upload.totalSize = totalSize;
            upload.expectedBlocks = Math.ceil(totalSize / actualBlockSize);
            console.log(`[CoAP Server] Updated upload: ${upload.fileName}, new size=${totalSize}, blocks=${upload.expectedBlocks}`);
          }
        }
      }

      const existingBlock = upload.blockStates.get(block1.num);
      if (existingBlock && existingBlock.state === ServerBlockState.RECEIVED) {
        console.log(`[CoAP Server] Block ${block1.num} already received (M=0), acknowledging but not reprocessing.`);
        if (block1.more) {
          this.sendBlock1Ack(msg, rinfo, block1, true);
        } else {
          this.sendBlock1Ack(msg, rinfo, block1, false);
        }
        return;
      }
    }

    upload.receivedBlocks.set(block1.num, blockPayload);
    upload.blockStates.set(block1.num, {
      num: block1.num,
      state: ServerBlockState.RECEIVED,
      receivedAt: Date.now(),
      size: blockPayload.length,
    });

    if (this.onBlockReceived) {
      this.onBlockReceived({
        uploadId,
        blockNum: block1.num,
        more: block1.more,
        size: blockPayload.length,
      });
    }

    this.notifyObservers({
      type: 'upload_progress',
      fileName: upload.fileName,
      uploadId,
      blockNum: block1.num,
      totalBlocks: upload.expectedBlocks,
      receivedCount: upload.receivedBlocks.size,
      totalSize: upload.totalSize,
      timestamp: Date.now(),
    });

    if (block1.more) {
      console.log(`[CoAP Server] Block ${block1.num} acknowledged, waiting for more (M=1 → continue)`);
      this.sendBlock1Ack(msg, rinfo, block1, true);
    } else {
      const isComplete = this.checkUploadComplete(upload);

      if (isComplete) {
        console.log(`[CoAP Server] Final block ${block1.num} received (M=0), all blocks complete. Reassembling file...`);
        const filePath = await this.reassembleFile(uploadId, upload);
        this.sendBlock1Ack(msg, rinfo, block1, false);

        if (filePath && this.onUploadComplete) {
          this.onUploadComplete(upload.fileName, filePath);
        }

        this.notifyObservers({
          type: 'upload_complete',
          fileName: upload.fileName,
          uploadId,
          blockNum: block1.num,
          totalBlocks: upload.expectedBlocks,
          receivedCount: upload.receivedBlocks.size,
          totalSize: upload.totalSize,
          timestamp: Date.now(),
        });
      } else {
        console.log(`[CoAP Server] Final block ${block1.num} received (M=0), but some blocks missing. Waiting for resume...`);
        this.sendBlock1Ack(msg, rinfo, block1, false);

        this.notifyObservers({
          type: 'upload_failed',
          fileName: upload.fileName,
          uploadId,
          blockNum: block1.num,
          totalBlocks: upload.expectedBlocks,
          receivedCount: upload.receivedBlocks.size,
          totalSize: upload.totalSize,
          timestamp: Date.now(),
        });
      }
    }
  }

  private checkUploadComplete(upload: PendingUpload): boolean {
    for (let i = 0; i < upload.expectedBlocks; i++) {
      const info = upload.blockStates.get(i);
      if (!info || info.state !== ServerBlockState.RECEIVED) {
        return false;
      }
    }
    return true;
  }

  private async reassembleFile(uploadId: string, upload: PendingUpload): Promise<string | null> {
    const sortedBlocks = Array.from(upload.receivedBlocks.entries()).sort((a, b) => a[0] - b[0]);

    const chunks: Buffer[] = [];
    for (const [, data] of sortedBlocks) {
      chunks.push(data);
    }

    const fileData = Buffer.concat(chunks);

    const safeName = upload.fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
    const timestamp = Date.now();
    const filePath = path.join(this.uploadsDir, `${timestamp}-${safeName}`);

    try {
      fs.writeFileSync(filePath, fileData);
      console.log(`[CoAP Server] File saved: ${filePath} (${fileData.length} bytes)`);

      for (const info of upload.blockStates.values()) {
        info.state = ServerBlockState.ASSEMBLED;
      }

      this.completedFiles.set(uploadId, {
        fileName: upload.fileName,
        filePath,
        size: fileData.length,
        completedAt: Date.now(),
      });

      this.pendingUploads.delete(uploadId);
      return filePath;
    } catch (err) {
      console.error('[CoAP Server] Error saving file:', err);
      return null;
    }
  }

  private sendAck(msg: CoapMessage, rinfo: dgram.RemoteInfo, responseCode: number) {
    const response: CoapMessage = {
      version: 1,
      type: MessageType.ACK,
      tokenLength: msg.token.length,
      code: responseCode,
      messageId: msg.messageId,
      token: msg.token,
      options: [],
      payload: Buffer.alloc(0),
    };

    const buf = encodeMessage(response);
    this.socket.send(buf, rinfo.port, rinfo.address);
    console.log(`[CoAP Server] Sent ACK ${responseCodeToString(responseCode)} to ${rinfo.address}:${rinfo.port}`);
  }

  private sendBlock1Ack(msg: CoapMessage, rinfo: dgram.RemoteInfo, block1: BlockOptionValue, hasMore: boolean) {
    const responseCode = hasMore ? ResponseCode.Continue : ResponseCode.Changed;

    const response: CoapMessage = {
      version: 1,
      type: MessageType.ACK,
      tokenLength: msg.token.length,
      code: responseCode,
      messageId: msg.messageId,
      token: msg.token,
      options: [
        {
          number: OptionNumber.Block1,
          value: encodeBlockOption({
            szx: block1.szx,
            more: false,
            num: block1.num,
          }),
        },
      ],
      payload: Buffer.alloc(0),
    };

    const buf = encodeMessage(response);
    this.socket.send(buf, rinfo.port, rinfo.address);
    console.log(`[CoAP Server] Sent ACK ${responseCodeToString(responseCode)} Block1(NUM=${block1.num}, M=0) to ${rinfo.address}:${rinfo.port}`);
  }

  private sendReset(msg: CoapMessage, rinfo: dgram.RemoteInfo) {
    const response: CoapMessage = {
      version: 1,
      type: MessageType.RST,
      tokenLength: 0,
      code: 0,
      messageId: msg.messageId,
      token: Buffer.alloc(0),
      options: [],
      payload: Buffer.alloc(0),
    };

    const buf = encodeMessage(response);
    this.socket.send(buf, rinfo.port, rinfo.address);
  }
}
