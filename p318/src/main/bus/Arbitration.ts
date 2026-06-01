import type { BusConfig } from '../../shared/types';

export class ArbitrationEngine {
  private config: BusConfig;

  constructor(config: BusConfig) {
    this.config = config;
  }

  updateConfig(config: BusConfig): void {
    this.config = config;
  }

  calculateBackoffTime(retryCount: number): number {
    const k = Math.min(retryCount, 10);
    const maxSlots = Math.pow(2, k) - 1;
    const randomSlots = Math.floor(Math.random() * (maxSlots + 1));
    return randomSlots * this.config.collisionDetectTime;
  }

  getBackoffSlots(retryCount: number): { k: number; maxSlots: number } {
    const k = Math.min(retryCount, 10);
    const maxSlots = Math.pow(2, k) - 1;
    return { k, maxSlots };
  }

  calculateSendTime(dataLength: number): number {
    const bitsPerByte = 10;
    const totalBits = dataLength * bitsPerByte;
    return (totalBits / this.config.baudRate) * 1000;
  }

  shouldDetectCollision(senders: string[]): boolean {
    return senders.length > 1;
  }

  getArbitrateWaitTime(): number {
    return this.config.arbitrateWaitTime;
  }

  getMaxRetries(): number {
    return this.config.maxRetries;
  }
}
