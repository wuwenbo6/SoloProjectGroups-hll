import dgram from 'dgram';
import {
  type CoapMessage,
  type BlockOptionValue,
  MessageType,
  MethodCode,
  OptionNumber,
  ResponseCode,
  encodeMessage,
  decodeMessage,
  encodeBlockOption,
  decodeBlockOption,
  findOption,
  responseCodeToString,
  blockSizeFromSzx,
  szxFromBlockSize,
} from './protocol.js';
import type { UploadNotification } from './server.js';

export interface ProgressCallback {
  (info: {
    currentBlock: number;
    totalBlocks: number;
    bytesSent: number;
    totalBytes: number;
    blockSize: number;
    moreBlocks: boolean;
    responseCode: number;
    speed: number;
  }): void;
}

export enum BlockState {
  PENDING = 'pending',
  IN_FLIGHT = 'in_flight',
  ACKED = 'acked',
  FAILED = 'failed',
}

export interface BlockStateInfo {
  blockNum: number;
  state: BlockState;
  ackedAt?: number;
  retries: number;
}

export enum TransferPhase {
  INIT = 'init',
  TRANSFERRING = 'transferring',
  FINALIZING = 'finalizing',
  COMPLETE = 'complete',
  FAILED = 'failed',
}

export interface TransferState {
  phase: TransferPhase;
  currentBlock: number;
  highestAckedBlock: number;
  blockStates: Map<number, BlockStateInfo>;
  totalBlocks: number;
  blockSize: number;
  totalBytes: number;
  fileName: string;
  sessionToken: Buffer;
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
  error?: string;
}

export interface UploadOptions {
  resumeFrom?: number;
  blockSize?: number;
  maxRetries?: number;
  timeoutMs?: number;
}

export interface ObserveCallback {
  (notification: UploadNotification, seq: number): void;
}

export class CoapClient {
  private socket: dgram.Socket;
  private serverPort: number;
  private serverHost: string;
  private messageIdCounter: number = Math.floor(Math.random() * 65535);
  private pendingAcks: Map<number, {
    resolve: (msg: CoapMessage) => void;
    reject: (err: Error) => void;
    timer: ReturnType<typeof setTimeout>;
  }> = new Map();
  private observeTokens: Map<string, Buffer> = new Map();
  private observeCallbacks: Map<string, ObserveCallback> = new Map();
  private isObserving: boolean = false;

  constructor(serverPort: number = 5683, serverHost: string = '127.0.0.1') {
    this.serverPort = serverPort;
    this.serverHost = serverHost;
    this.socket = dgram.createSocket('udp4');

    this.socket.on('message', (msg) => {
      try {
        const coapMsg = decodeMessage(msg);
        if (coapMsg.type === MessageType.ACK || coapMsg.type === MessageType.RST) {
          const pending = this.pendingAcks.get(coapMsg.messageId);
          if (pending) {
            clearTimeout(pending.timer);
            this.pendingAcks.delete(coapMsg.messageId);
            pending.resolve(coapMsg);
            return;
          }
        }

        if (coapMsg.type === MessageType.NON || coapMsg.type === MessageType.CON) {
          this.handleNotification(coapMsg);
        }
      } catch (err) {
        console.error('[CoAP Client] Error decoding response:', err);
      }
    });

    this.socket.on('error', (err) => {
      console.error('[CoAP Client] Socket error:', err);
    });
  }

  async start(): Promise<void> {
    return new Promise((resolve => {
      this.socket.bind(() => resolve());
    }));
  }

  async stop(): Promise<void> {
    for (const [, pending] of this.pendingAcks) {
      clearTimeout(pending.timer);
      pending.reject(new Error('Client stopped'));
    }
    this.pendingAcks.clear();
    this.isObserving = false;
    return new Promise(resolve => this.socket.close(() => resolve()));
  }

  private nextMessageId(): number {
    this.messageIdCounter = (this.messageIdCounter + 1) & 0xFFFF;
    return this.messageIdCounter;
  }

  private async sendAndWaitAck(msg: CoapMessage, timeoutMs: number = 5000): Promise<CoapMessage> {
    const buf = encodeMessage(msg);

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingAcks.delete(msg.messageId);
        reject(new Error(`ACK timeout for MID=${msg.messageId}`));
      }, timeoutMs);

      this.pendingAcks.set(msg.messageId, { resolve, reject, timer });

      this.socket.send(buf, this.serverPort, this.serverHost, (err) => {
        if (err) {
          clearTimeout(timer);
          this.pendingAcks.delete(msg.messageId);
          reject(err);
        }
      });
    });
  }

  private handleNotification(msg: CoapMessage) {
    const observeOpt = findOption(msg.options, OptionNumber.Observe);
    if (!observeOpt) return;

    const seq = observeOpt.value.length > 0 ? observeOpt.value[0] : 0;
    const tokenHex = msg.token.toString('hex');

    const callback = this.observeCallbacks.get(tokenHex);
    if (!callback) return;

    try {
      const notification: UploadNotification = JSON.parse(msg.payload.toString());
      console.log(`[CoAP Client] Observe notification seq=${seq}: ${notification.type} ${notification.fileName}`);
      callback(notification, seq);
    } catch {
      console.warn('[CoAP Client] Failed to parse observe notification payload');
    }

    if (msg.type === MessageType.CON) {
      const ack: CoapMessage = {
        version: 1,
        type: MessageType.ACK,
        tokenLength: msg.token.length,
        code: 0,
        messageId: msg.messageId,
        token: msg.token,
        options: [],
        payload: Buffer.alloc(0),
      };
      const buf = encodeMessage(ack);
      this.socket.send(buf, this.serverPort, this.serverHost);
    }
  }

  async observe(
    resource: string,
    callback: ObserveCallback,
    options: { blockSize?: number } = {},
  ): Promise<void> {
    const token = Buffer.alloc(4);
    token.writeUInt32BE(Math.floor(Math.random() * 0xFFFFFFFF), 0);
    const tokenHex = token.toString('hex');

    this.observeTokens.set(tokenHex, token);
    this.observeCallbacks.set(tokenHex, callback);
    this.isObserving = true;

    const mid = this.nextMessageId();
    const msgOptions: { number: number; value: Buffer }[] = [
      { number: OptionNumber.Observe, value: Buffer.from([0x00]) },
      { number: OptionNumber.UriPath, value: Buffer.from(resource) },
    ];

    if (options.blockSize) {
      const szx = szxFromBlockSize(options.blockSize);
      msgOptions.push({
        number: OptionNumber.Block2,
        value: encodeBlockOption({ szx, more: false, num: 0 }),
      });
    }

    const request: CoapMessage = {
      version: 1,
      type: MessageType.CON,
      tokenLength: token.length,
      code: MethodCode.GET,
      messageId: mid,
      token,
      options: msgOptions,
      payload: Buffer.alloc(0),
    };

    try {
      const response = await this.sendAndWaitAck(request, 5000);
      console.log(`[CoAP Client] Observe registered for "${resource}" (token=${tokenHex})`);

      if (response.payload.length > 0) {
        try {
          const notification: UploadNotification = JSON.parse(response.payload.toString());
          callback(notification, 0);
        } catch {}
      }

      const block2Opt = findOption(response.options, OptionNumber.Block2);
      if (block2Opt) {
        const block2 = decodeBlockOption(block2Opt.value);
        if (block2.more) {
          await this.fetchRemainingBlock2(token, resource, szxFromBlockSize(options.blockSize || 1024), block2);
        }
      }
    } catch (err) {
      console.error('[CoAP Client] Observe registration failed:', err);
      this.observeTokens.delete(tokenHex);
      this.observeCallbacks.delete(tokenHex);
      this.isObserving = false;
    }
  }

  async cancelObserve(resource: string): Promise<void> {
    for (const [tokenHex, callback] of this.observeCallbacks) {
      const token = this.observeTokens.get(tokenHex)!;

      const mid = this.nextMessageId();
      const request: CoapMessage = {
        version: 1,
        type: MessageType.CON,
        tokenLength: token.length,
        code: MethodCode.GET,
        messageId: mid,
        token,
        options: [
          { number: OptionNumber.Observe, value: Buffer.from([0x01]) },
          { number: OptionNumber.UriPath, value: Buffer.from(resource) },
        ],
        payload: Buffer.alloc(0),
      };

      try {
        await this.sendAndWaitAck(request, 3000);
        console.log(`[CoAP Client] Observe cancelled for "${resource}"`);
      } catch {}

      this.observeTokens.delete(tokenHex);
      this.observeCallbacks.delete(tokenHex);
    }
    this.isObserving = false;
  }

  async getResource(
    resource: string,
    options: { blockSize?: number } = {},
  ): Promise<Buffer> {
    const token = Buffer.alloc(4);
    token.writeUInt32BE(Math.floor(Math.random() * 0xFFFFFFFF), 0);

    const mid = this.nextMessageId();
    const msgOptions: { number: number; value: Buffer }[] = [
      { number: OptionNumber.UriPath, value: Buffer.from(resource) },
    ];

    if (options.blockSize) {
      const szx = szxFromBlockSize(options.blockSize);
      msgOptions.push({
        number: OptionNumber.Block2,
        value: encodeBlockOption({ szx, more: false, num: 0 }),
      });
    }

    const request: CoapMessage = {
      version: 1,
      type: MessageType.CON,
      tokenLength: token.length,
      code: MethodCode.GET,
      messageId: mid,
      token,
      options: msgOptions,
      payload: Buffer.alloc(0),
    };

    const response = await this.sendAndWaitAck(request, 5000);

    if (response.code >= 0x80) {
      throw new Error(`Server error: ${responseCodeToString(response.code)}`);
    }

    const block2Opt = findOption(response.options, OptionNumber.Block2);
    if (block2Opt) {
      const block2 = decodeBlockOption(block2Opt.value);
      const chunks: Buffer[] = [response.payload];

      if (block2.more) {
        const remaining = await this.fetchRemainingBlock2(token, resource, block2.szx, block2);
        chunks.push(...remaining);
      }

      return Buffer.concat(chunks);
    }

    return response.payload;
  }

  private async fetchRemainingBlock2(
    token: Buffer,
    resource: string,
    szx: number,
    firstBlock2: BlockOptionValue,
  ): Promise<Buffer[]> {
    const chunks: Buffer[] = [];
    let currentNum = firstBlock2.num + 1;
    const maxBlocks = 1024;

    while (currentNum < maxBlocks) {
      const mid = this.nextMessageId();

      const request: CoapMessage = {
        version: 1,
        type: MessageType.CON,
        tokenLength: token.length,
        code: MethodCode.GET,
        messageId: mid,
        token,
        options: [
          { number: OptionNumber.UriPath, value: Buffer.from(resource) },
          {
            number: OptionNumber.Block2,
            value: encodeBlockOption({ szx, more: false, num: currentNum }),
          },
        ],
        payload: Buffer.alloc(0),
      };

      try {
        const response = await this.sendAndWaitAck(request, 5000);
        chunks.push(response.payload);

        const block2Opt = findOption(response.options, OptionNumber.Block2);
        if (block2Opt) {
          const block2 = decodeBlockOption(block2Opt.value);
          console.log(`[CoAP Client] Block2 received: NUM=${block2.num}, M=${block2.more ? 1 : 0}, ${response.payload.length}B`);
          if (!block2.more) {
            break;
          }
          currentNum = block2.num + 1;
        } else {
          break;
        }
      } catch (err) {
        console.error(`[CoAP Client] Block2 fetch error for NUM=${currentNum}:`, err);
        break;
      }
    }

    return chunks;
  }

  private createTransferState(
    fileName: string,
    fileData: Buffer,
    actualBlockSize: number,
    resumeFrom: number = 0,
  ): TransferState {
    const totalBlocks = Math.ceil(fileData.length / actualBlockSize);
    const blockStates = new Map<number, BlockStateInfo>();

    for (let i = 0; i < totalBlocks; i++) {
      blockStates.set(i, {
        blockNum: i,
        state: i < resumeFrom ? BlockState.ACKED : BlockState.PENDING,
        retries: 0,
        ackedAt: i < resumeFrom ? Date.now() : undefined,
      });
    }

    const sessionToken = Buffer.alloc(4);
    sessionToken.writeUInt32BE(Math.floor(Math.random() * 0xFFFFFFFF), 0);

    return {
      phase: TransferPhase.INIT,
      currentBlock: resumeFrom,
      highestAckedBlock: resumeFrom > 0 ? resumeFrom - 1 : -1,
      blockStates,
      totalBlocks,
      blockSize: actualBlockSize,
      totalBytes: fileData.length,
      fileName,
      sessionToken,
      createdAt: Date.now(),
    };
  }

  private markBlockAcked(state: TransferState, blockNum: number): void {
    const blockInfo = state.blockStates.get(blockNum);
    if (blockInfo) {
      blockInfo.state = BlockState.ACKED;
      blockInfo.ackedAt = Date.now();
      if (blockNum > state.highestAckedBlock) {
        state.highestAckedBlock = blockNum;
      }
    }
  }

  private findNextBlock(state: TransferState): number | null {
    for (let i = 0; i < state.totalBlocks; i++) {
      const info = state.blockStates.get(i);
      if (info && info.state === BlockState.PENDING) {
        return i;
      }
    }
    return null;
  }

  private isTransferComplete(state: TransferState): boolean {
    for (let i = 0; i < state.totalBlocks; i++) {
      const info = state.blockStates.get(i);
      if (!info || info.state !== BlockState.ACKED) {
        return false;
      }
    }
    return true;
  }

  async uploadFile(
    fileName: string,
    fileData: Buffer,
    onProgress?: ProgressCallback,
    options: UploadOptions = {},
  ): Promise<{ success: boolean; totalBlocks: number; state: TransferState }> {
    const {
      resumeFrom = 0,
      blockSize = 1024,
      maxRetries = 3,
      timeoutMs = 5000,
    } = options;

    const szx = szxFromBlockSize(blockSize);
    const actualBlockSize = blockSizeFromSzx(szx);

    const state = this.createTransferState(fileName, fileData, actualBlockSize, resumeFrom);
    state.startedAt = Date.now();
    state.phase = TransferPhase.TRANSFERRING;

    console.log(`[CoAP Client] Starting upload: ${fileName}, size=${state.totalBytes}, blockSize=${actualBlockSize}, totalBlocks=${state.totalBlocks}, resumeFrom=${resumeFrom}`);

    while (state.phase === TransferPhase.TRANSFERRING) {
      const blockNum = this.findNextBlock(state);

      if (blockNum === null) {
        if (this.isTransferComplete(state)) {
          state.phase = TransferPhase.FINALIZING;
          break;
        }
        break;
      }

      const blockInfo = state.blockStates.get(blockNum)!;
      blockInfo.state = BlockState.IN_FLIGHT;
      state.currentBlock = blockNum;

      const offset = blockNum * actualBlockSize;
      const end = Math.min(offset + actualBlockSize, state.totalBytes);
      const blockPayload = fileData.subarray(offset, end);
      const isLast = blockNum === state.totalBlocks - 1;
      const more = !isLast;

      const mid = this.nextMessageId();

      const options = [
        { number: OptionNumber.UriPath, value: Buffer.from(fileName) },
        { number: OptionNumber.ContentFormat, value: Buffer.from([0x00]) },
        {
          number: OptionNumber.Block1,
          value: encodeBlockOption({ szx, more, num: blockNum }),
        },
      ];

      if (blockNum === 0 || resumeFrom > 0) {
        const sizeBuf = Buffer.alloc(4);
        sizeBuf.writeUInt32BE(state.totalBytes, 0);
        options.push({ number: OptionNumber.Size1, value: sizeBuf });
      }

      const request: CoapMessage = {
        version: 1,
        type: MessageType.CON,
        tokenLength: state.sessionToken.length,
        code: MethodCode.PUT,
        messageId: mid,
        token: state.sessionToken,
        options,
        payload: blockPayload,
      };

      let response: CoapMessage | undefined;
      let blockSuccess = false;

      while (blockInfo.retries <= maxRetries) {
        try {
          console.log(`[CoAP Client] Sending block ${blockNum}, attempt ${blockInfo.retries + 1}`);
          response = await this.sendAndWaitAck(request, timeoutMs);
          break;
        } catch (err) {
          blockInfo.retries++;
          if (blockInfo.retries > maxRetries) {
            console.error(`[CoAP Client] Max retries (${maxRetries}) reached for block ${blockNum}`);
            blockInfo.state = BlockState.FAILED;
            state.phase = TransferPhase.FAILED;
            state.error = `Max retries reached for block ${blockNum}`;
            break;
          }
          console.warn(`[CoAP Client] Retry ${blockInfo.retries}/${maxRetries} for block ${blockNum}`);
        }
      }

      if (state.phase === TransferPhase.FAILED || !response) {
        break;
      }

      const respCode = response.code;
      const elapsed = Date.now() - (state.startedAt || state.createdAt);
      const bytesSent = (state.highestAckedBlock + 1) * actualBlockSize;
      const speed = elapsed > 0 ? (bytesSent / (elapsed / 1000)) : 0;

      const block1AckOpt = findOption(response.options, OptionNumber.Block1);
      if (block1AckOpt) {
        const ackedBlock = decodeBlockOption(block1AckOpt.value);
        console.log(`[CoAP Client] Block ${blockNum} ACK: num=${ackedBlock.num}, more=${ackedBlock.more} (M=0)`);

        if (!ackedBlock.more) {
          this.markBlockAcked(state, blockNum);
          blockSuccess = true;
        }
      } else {
        this.markBlockAcked(state, blockNum);
        blockSuccess = true;
      }

      if (!blockSuccess) {
        console.warn(`[CoAP Client] Block ${blockNum} not fully confirmed, retrying`);
        blockInfo.state = BlockState.PENDING;
        continue;
      }

      console.log(`[CoAP Client] Block ${blockNum}/${state.totalBlocks - 1}: ${responseCodeToString(respCode)} ${more ? '(more)' : '(last)'}`);

      if (onProgress) {
        onProgress({
          currentBlock: state.highestAckedBlock,
          totalBlocks: state.totalBlocks,
          bytesSent: (state.highestAckedBlock + 1) * actualBlockSize,
          totalBytes: state.totalBytes,
          blockSize: actualBlockSize,
          moreBlocks: more,
          responseCode: respCode,
          speed,
        });
      }

      if (respCode === ResponseCode.Changed && !isLast) {
        console.warn(`[CoAP Client] Unexpected 2.04 Changed before last block`);
        this.markBlockAcked(state, blockNum);
        state.phase = TransferPhase.FINALIZING;
        break;
      }

      if (respCode >= 0x80) {
        console.error(`[CoAP Client] Error response: ${responseCodeToString(respCode)}`);
        blockInfo.state = BlockState.FAILED;
        state.phase = TransferPhase.FAILED;
        state.error = `Error response: ${responseCodeToString(respCode)}`;
        break;
      }

      if (!isLast && respCode !== ResponseCode.Continue) {
        console.warn(`[CoAP Client] Expected 2.31 Continue, got ${responseCodeToString(respCode)}`);
      }
    }

    if (state.phase === TransferPhase.FINALIZING && this.isTransferComplete(state)) {
      state.phase = TransferPhase.COMPLETE;
      state.completedAt = Date.now();
      console.log(`[CoAP Client] Upload complete: ${fileName}`);
    }

    return {
      success: state.phase === TransferPhase.COMPLETE,
      totalBlocks: state.totalBlocks,
      state,
    };
  }
}
