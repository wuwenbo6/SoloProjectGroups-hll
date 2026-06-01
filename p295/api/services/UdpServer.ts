import dgram from 'dgram';
import type { GelfMessage } from '../types.js';
import { store } from './MemoryStore.js';

const GELF_PORT = 12201;
const CHUNKED_MAGIC = [0x1e, 0x0f];
const CHUNK_TIMEOUT_MS = 60000;
const CLEANUP_INTERVAL_MS = 5000;
const MAX_PENDING_CHUNKS = 1000;

interface ChunkBufferEntry {
  chunks: Map<number, Buffer>;
  totalChunks: number;
  createdAt: number;
  lastUpdatedAt: number;
  sourceAddress: string;
}

interface ChunkStats {
  totalReceived: number;
  totalReassembled: number;
  totalDropped: number;
  totalInvalid: number;
}

class GelfChunkBuffer {
  private buffers = new Map<string, ChunkBufferEntry>();
  private stats: ChunkStats = {
    totalReceived: 0,
    totalReassembled: 0,
    totalDropped: 0,
    totalInvalid: 0,
  };

  addChunk(
    messageId: string,
    sequenceNumber: number,
    totalChunks: number,
    chunkData: Buffer,
    sourceAddress: string
  ): Buffer | null {
    this.stats.totalReceived++;

    if (sequenceNumber >= totalChunks) {
      this.stats.totalInvalid++;
      return null;
    }

    let entry = this.buffers.get(messageId);

    if (!entry) {
      if (this.buffers.size >= MAX_PENDING_CHUNKS) {
        this.stats.totalDropped++;
        this.dropOldestEntry();
      }

      entry = {
        chunks: new Map(),
        totalChunks,
        createdAt: Date.now(),
        lastUpdatedAt: Date.now(),
        sourceAddress,
      };
      this.buffers.set(messageId, entry);
      console.debug(
        `[GELF] New chunked message id=${messageId.slice(0, 8)}... total=${totalChunks} from ${sourceAddress}`
      );
    }

    if (entry.totalChunks !== totalChunks) {
      this.stats.totalInvalid++;
      console.warn(
        `[GELF] Chunk count mismatch for id=${messageId.slice(0, 8)}..., expected ${entry.totalChunks}, got ${totalChunks}`
      );
      return null;
    }

    if (entry.chunks.has(sequenceNumber)) {
      return null;
    }

    entry.chunks.set(sequenceNumber, Buffer.from(chunkData));
    entry.lastUpdatedAt = Date.now();

    if (entry.chunks.size === entry.totalChunks) {
      return this.reassembleAndRemove(messageId, entry);
    }

    return null;
  }

  private reassembleAndRemove(
    messageId: string,
    entry: ChunkBufferEntry
  ): Buffer | null {
    this.buffers.delete(messageId);

    const sortedKeys = Array.from(entry.chunks.keys()).sort((a, b) => a - b);

    for (let i = 0; i < entry.totalChunks; i++) {
      if (sortedKeys[i] !== i) {
        this.stats.totalDropped++;
        console.warn(
          `[GELF] Missing chunk ${i} for message id=${messageId.slice(0, 8)}...`
        );
        return null;
      }
    }

    const orderedChunks: Buffer[] = [];
    for (let i = 0; i < entry.totalChunks; i++) {
      const chunk = entry.chunks.get(i);
      if (!chunk) {
        this.stats.totalDropped++;
        return null;
      }
      orderedChunks.push(chunk);
    }

    this.stats.totalReassembled++;
    const totalBytes = orderedChunks.reduce((sum, c) => sum + c.length, 0);
    console.debug(
      `[GELF] Reassembled message id=${messageId.slice(0, 8)}... chunks=${entry.totalChunks} size=${totalBytes}B`
    );

    return Buffer.concat(orderedChunks);
  }

  private dropOldestEntry(): void {
    let oldestId: string | null = null;
    let oldestTime = Infinity;

    for (const [id, entry] of this.buffers) {
      if (entry.createdAt < oldestTime) {
        oldestTime = entry.createdAt;
        oldestId = id;
      }
    }

    if (oldestId) {
      this.buffers.delete(oldestId);
      console.debug(
        `[GELF] Dropped oldest pending chunk id=${oldestId.slice(0, 8)}... due to cache full`
      );
    }
  }

  cleanupExpired(): number {
    const now = Date.now();
    let dropped = 0;

    for (const [id, entry] of this.buffers) {
      if (now - entry.lastUpdatedAt > CHUNK_TIMEOUT_MS) {
        this.buffers.delete(id);
        this.stats.totalDropped++;
        dropped++;
        console.debug(
          `[GELF] Timed out chunk id=${id.slice(0, 8)}... received=${entry.chunks.size}/${entry.totalChunks} from ${entry.sourceAddress}`
        );
      }
    }

    return dropped;
  }

  getStats(): ChunkStats & { pendingCount: number } {
    return {
      ...this.stats,
      pendingCount: this.buffers.size,
    };
  }

  getPendingDetails(): Array<{
    messageId: string;
    received: number;
    total: number;
    age: number;
    source: string;
  }> {
    const now = Date.now();
    return Array.from(this.buffers.entries()).map(([id, entry]) => ({
      messageId: id,
      received: entry.chunks.size,
      total: entry.totalChunks,
      age: now - entry.createdAt,
      source: entry.sourceAddress,
    }));
  }
}

const chunkBuffer = new GelfChunkBuffer();

setInterval(() => {
  const dropped = chunkBuffer.cleanupExpired();
  if (dropped > 0) {
    console.log(`[GELF] Cleanup: dropped ${dropped} expired chunks`);
  }
  const stats = chunkBuffer.getStats();
  if (stats.pendingCount > 0) {
    console.debug(
      `[GELF] Status: pending=${stats.pendingCount}, received=${stats.totalReceived}, reassembled=${stats.totalReassembled}, dropped=${stats.totalDropped}`
    );
  }
}, CLEANUP_INTERVAL_MS);

function parseGelfMessage(buf: Buffer): { raw: string; parsed: GelfMessage } | null {
  const raw = buf.toString('utf-8').replace(/\0.*$/, '').trim();
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as GelfMessage;
    if (!parsed.host || !parsed.short_message) {
      return null;
    }
    return { raw, parsed };
  } catch {
    return null;
  }
}

function handleMessage(msg: Buffer, rinfo: dgram.RemoteInfo): Buffer | null {
  if (msg.length < 12) {
    return msg;
  }

  const isChunked = msg[0] === CHUNKED_MAGIC[0] && msg[1] === CHUNKED_MAGIC[1];

  if (!isChunked) {
    return msg;
  }

  if (msg.length < 12) {
    return null;
  }

  const messageId = msg.subarray(2, 10).toString('hex');
  const sequenceNumber = msg[10];
  const totalChunks = msg[11];
  const chunkData = msg.subarray(12);

  return chunkBuffer.addChunk(
    messageId,
    sequenceNumber,
    totalChunks,
    chunkData,
    rinfo.address
  );
}

export function startUdpServer(): dgram.Socket {
  const server = dgram.createSocket('udp4');

  server.on('message', (msg: Buffer, rinfo: dgram.RemoteInfo) => {
    const reassembled = handleMessage(msg, rinfo);
    if (!reassembled) return;

    const result = parseGelfMessage(reassembled);
    if (!result) return;

    store.insert(result.raw, result.parsed);
  });

  server.on('error', (err) => {
    console.error('UDP server error:', err);
  });

  server.on('listening', () => {
    const address = server.address();
    console.log(`GELF UDP server listening on ${address.address}:${address.port}`);
    console.log(`  Chunk timeout: ${CHUNK_TIMEOUT_MS}ms`);
    console.log(`  Max pending chunks: ${MAX_PENDING_CHUNKS}`);
  });

  server.bind(GELF_PORT);
  return server;
}

export function getChunkStats() {
  return chunkBuffer.getStats();
}

export function getPendingChunks() {
  return chunkBuffer.getPendingDetails();
}
