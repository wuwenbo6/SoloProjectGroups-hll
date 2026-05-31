export class FrameBuffer {
  private buffer: string[] = [];
  private maxSize: number;
  private onBufferFull: (frames: string[]) => void;

  constructor(maxSize: number = 16, onBufferFull: (frames: string[]) => void) {
    this.maxSize = maxSize;
    this.onBufferFull = onBufferFull;
  }

  addFrame(frame: string): void {
    this.buffer.push(frame);

    if (this.buffer.length >= this.maxSize) {
      const frames = [...this.buffer];
      this.onBufferFull(frames);
      this.buffer = this.buffer.slice(Math.floor(this.maxSize / 2));
    }
  }

  clear(): void {
    this.buffer = [];
  }

  getBuffer(): string[] {
    return [...this.buffer];
  }

  getSize(): number {
    return this.buffer.length;
  }
}

export class SlidingWindowBuffer {
  private buffer: string[] = [];
  private windowSize: number;
  private stepSize: number;
  private lastProcessedIndex: number = 0;

  constructor(windowSize: number = 16, stepSize: number = 8) {
    this.windowSize = windowSize;
    this.stepSize = stepSize;
  }

  addFrame(frame: string): string[] | null {
    this.buffer.push(frame);

    if (this.buffer.length - this.lastProcessedIndex >= this.stepSize &&
        this.buffer.length >= this.windowSize) {
      const startIndex = this.buffer.length - this.windowSize;
      const window = this.buffer.slice(startIndex, startIndex + this.windowSize);
      this.lastProcessedIndex = this.buffer.length - this.stepSize;
      
      if (this.buffer.length > 100) {
        this.buffer = this.buffer.slice(-50);
        this.lastProcessedIndex = Math.max(0, this.lastProcessedIndex - (this.buffer.length - 50));
      }
      
      return window;
    }

    return null;
  }

  clear(): void {
    this.buffer = [];
    this.lastProcessedIndex = 0;
  }

  getSize(): number {
    return this.buffer.length;
  }
}

export interface MotionVector {
  dx: number;
  dy: number;
}

export function calculateFrameMotion(
  prevFrame: ImageData,
  currFrame: ImageData,
  blockSize: number = 8
): MotionVector {
  const width = prevFrame.width;
  const height = prevFrame.height;
  
  let totalDx = 0;
  let totalDy = 0;
  let count = 0;

  for (let y = blockSize; y < height - blockSize; y += blockSize * 2) {
    for (let x = blockSize; x < width - blockSize; x += blockSize * 2) {
      let minSad = Infinity;
      let bestDx = 0;
      let bestDy = 0;

      for (let dy = -4; dy <= 4; dy++) {
        for (let dx = -4; dx <= 4; dx++) {
          if (dx === 0 && dy === 0) continue;
          
          let sad = 0;
          
          for (let by = 0; by < blockSize; by++) {
            for (let bx = 0; bx < blockSize; bx++) {
              const prevIdx = ((y + by) * width + (x + bx)) * 4;
              const currIdx = ((y + by + dy) * width + (x + bx + dx)) * 4;
              
              sad += Math.abs(prevFrame.data[prevIdx] - currFrame.data[currIdx]);
            }
          }

          if (sad < minSad) {
            minSad = sad;
            bestDx = dx;
            bestDy = dy;
          }
        }
      }

      if (minSad < blockSize * blockSize * 30) {
        totalDx += bestDx;
        totalDy += bestDy;
        count++;
      }
    }
  }

  if (count === 0) {
    return { dx: 0, dy: 0 };
  }

  return {
    dx: totalDx / count,
    dy: totalDy / count
  };
}

export function detectLipMovement(
  prevLandmarks: { upperLip: any[]; lowerLip: any[] } | null,
  currLandmarks: { upperLip: any[]; lowerLip: any[] } | null
): number {
  if (!prevLandmarks || !currLandmarks) return 0;

  let totalMovement = 0;
  const allPoints = ['upperLip', 'lowerLip'] as const;

  for (const part of allPoints) {
    const prevPoints = prevLandmarks[part];
    const currPoints = currLandmarks[part];

    for (let i = 0; i < prevPoints.length && i < currPoints.length; i++) {
      const dx = currPoints[i].x - prevPoints[i].x;
      const dy = currPoints[i].y - prevPoints[i].y;
      totalMovement += Math.sqrt(dx * dx + dy * dy);
    }
  }

  return totalMovement;
}
