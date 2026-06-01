import dgram from 'dgram';
import { ArtNetPacketBuilder } from '../lib/artnet.js';
import type { ArtNetConfig } from '../../shared/types.js';
import { CHANNEL_COUNT, SEND_INTERVAL_MS } from '../../shared/types.js';

export class ArtNetSender {
  private socket: dgram.Socket | null = null;
  private buffer: number[] = new Array(CHANNEL_COUNT).fill(0);
  private dirty: boolean = false;
  private sequence: number = 0;
  private config: ArtNetConfig;
  private grandMaster: number = 1;
  private blackout: boolean = false;
  private sendInterval: NodeJS.Timeout | null = null;
  private lastSentPacket: Buffer | null = null;
  private pendingUpdates: Map<number, number> = new Map();

  constructor(config: ArtNetConfig) {
    this.config = config;
    this.initSocket();
    this.startSending();
  }

  private initSocket(): void {
    if (this.socket) {
      try {
        this.socket.close();
      } catch {
        // ignore
      }
    }

    this.socket = dgram.createSocket('udp4');

    const isBroadcast =
      this.config.targetIp === '255.255.255.255' ||
      this.config.targetIp.endsWith('.255');

    if (!isBroadcast) {
      return;
    }

    try {
      this.socket.bind(() => {
        this.socket?.setBroadcast(true);
      });
    } catch (err) {
      console.error('Failed to bind UDP socket:', err);
    }
  }

  private startSending(): void {
    this.sendInterval = setInterval(() => {
      this.flushBuffer();
    }, SEND_INTERVAL_MS);
  }

  private flushBuffer(): void {
    if (!this.socket) return;

    this.applyPendingUpdates();

    const outputChannels = this.getOutputChannels();

    const packet = ArtNetPacketBuilder.buildDmxPacket(
      outputChannels,
      this.config.net,
      this.config.switch_,
      this.config.universe,
      this.sequence
    );

    if (this.lastSentPacket && packet.equals(this.lastSentPacket)) {
      return;
    }

    this.lastSentPacket = packet;
    this.sequence = (this.sequence + 1) % 256;

    this.socket.send(
      packet,
      this.config.targetPort,
      this.config.targetIp,
      (err) => {
        if (err) {
          console.error('Failed to send Art-Net packet:', err);
        }
      }
    );
  }

  private applyPendingUpdates(): void {
    if (this.pendingUpdates.size === 0) return;

    for (const [idx, value] of this.pendingUpdates) {
      this.buffer[idx] = Math.max(0, Math.min(255, Math.floor(value)));
    }
    this.pendingUpdates.clear();
    this.dirty = true;
  }

  private getOutputChannels(): number[] {
    const output = new Array(CHANNEL_COUNT).fill(0);

    if (this.blackout) {
      return output;
    }

    for (let i = 0; i < CHANNEL_COUNT; i++) {
      output[i] = Math.floor(this.buffer[i] * this.grandMaster);
    }

    return output;
  }

  setChannel(channel: number, value: number): void {
    const idx = channel - 1;
    if (idx < 0 || idx >= CHANNEL_COUNT) return;
    this.pendingUpdates.set(idx, value);
  }

  setChannels(channels: { channel: number; value: number }[]): void {
    for (const { channel, value } of channels) {
      const idx = channel - 1;
      if (idx < 0 || idx >= CHANNEL_COUNT) continue;
      this.pendingUpdates.set(idx, value);
    }
  }

  setFullFrame(data: number[]): void {
    this.pendingUpdates.clear();
    for (let i = 0; i < Math.min(data.length, CHANNEL_COUNT); i++) {
      this.buffer[i] = Math.max(0, Math.min(255, Math.floor(data[i])));
    }
    this.dirty = true;
    this.lastSentPacket = null;
  }

  setGrandMaster(value: number): void {
    this.grandMaster = Math.max(0, Math.min(1, value));
    this.lastSentPacket = null;
  }

  setBlackout(active: boolean): void {
    this.blackout = active;
    this.lastSentPacket = null;
  }

  setConfig(config: ArtNetConfig): void {
    const needsSocketReset =
      config.targetIp !== this.config.targetIp ||
      config.targetPort !== this.config.targetPort;

    const addressChanged =
      config.net !== this.config.net ||
      config.switch_ !== this.config.switch_ ||
      config.universe !== this.config.universe;

    this.config = config;

    if (needsSocketReset) {
      this.initSocket();
    }

    if (addressChanged) {
      this.lastSentPacket = null;
    }
  }

  getChannels(): number[] {
    this.applyPendingUpdates();
    return [...this.buffer];
  }

  getConfig(): ArtNetConfig {
    return { ...this.config };
  }

  destroy(): void {
    if (this.sendInterval) {
      clearInterval(this.sendInterval);
      this.sendInterval = null;
    }
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
  }
}
