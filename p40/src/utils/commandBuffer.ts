export class CommandBuffer {
  private lastSequence: number = 0;
  private bufferSize: number = 5;
  private maxAgeMs: number = 100;

  constructor(bufferSize: number = 5, maxAgeMs: number = 100) {
    this.bufferSize = bufferSize;
    this.maxAgeMs = maxAgeMs;
  }

  validateCommand(sequence: number, timestamp: number): { valid: boolean; reason?: string } {
    const now = Date.now();
    const age = now - timestamp;

    if (age > this.maxAgeMs) {
      return { valid: false, reason: `expired: ${age}ms old` };
    }

    if (sequence <= this.lastSequence) {
      if (this.lastSequence - sequence > this.bufferSize) {
        return { valid: false, reason: `out of order: seq ${sequence} < last ${this.lastSequence}` };
      }
    }

    this.lastSequence = Math.max(this.lastSequence, sequence);
    return { valid: true };
  }

  reset(): void {
    this.lastSequence = 0;
  }

  getLastSequence(): number {
    return this.lastSequence;
  }
}

export class SequenceGenerator {
  private sequence: number = 0;

  next(): number {
    this.sequence = (this.sequence + 1) % Number.MAX_SAFE_INTEGER;
    return this.sequence;
  }

  reset(): void {
    this.sequence = 0;
  }
}
