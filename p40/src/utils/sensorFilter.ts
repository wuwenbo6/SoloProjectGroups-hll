export class SensorDataFilter {
  private windowSize: number;
  private values: number[] = [];
  private lastValue: number = 0;
  private lastTimestamp: number = 0;

  constructor(windowSize: number = 5) {
    this.windowSize = windowSize;
  }

  filter(value: number, timestamp: number): number {
    this.values.push(value);
    if (this.values.length > this.windowSize) {
      this.values.shift();
    }

    const avg = this.values.reduce((a, b) => a + b, 0) / this.values.length;
    
    const dt = timestamp - this.lastTimestamp;
    if (dt > 0 && dt < 1000) {
      const alpha = Math.min(0.3, dt / 100);
      const filtered = this.lastValue + alpha * (avg - this.lastValue);
      this.lastValue = filtered;
      this.lastTimestamp = timestamp;
      return filtered;
    }

    this.lastValue = avg;
    this.lastTimestamp = timestamp;
    return avg;
  }

  reset(): void {
    this.values = [];
    this.lastValue = 0;
    this.lastTimestamp = 0;
  }

  getSmoothedValue(): number {
    return this.lastValue;
  }
}

export class PredictiveFilter {
  private history: { value: number; timestamp: number }[] = [];
  private maxHistory: number = 10;
  private lastPredicted: number = 0;
  private filter: SensorDataFilter;

  constructor(maxHistory: number = 10, smoothWindow: number = 3) {
    this.maxHistory = maxHistory;
    this.filter = new SensorDataFilter(smoothWindow);
  }

  addMeasurement(value: number, timestamp: number): number {
    this.history.push({ value, timestamp });
    if (this.history.length > this.maxHistory) {
      this.history.shift();
    }

    return this.filter.filter(value, timestamp);
  }

  predict(msAhead: number): number {
    if (this.history.length < 2) {
      return this.lastPredicted;
    }

    const recent = this.history.slice(-5);
    let totalVelocity = 0;
    let count = 0;

    for (let i = 1; i < recent.length; i++) {
      const dt = recent[i].timestamp - recent[i - 1].timestamp;
      if (dt > 0) {
        const velocity = (recent[i].value - recent[i - 1].value) / dt;
        totalVelocity += velocity;
        count++;
      }
    }

    if (count === 0) {
      return this.lastPredicted;
    }

    const avgVelocity = totalVelocity / count;
    const lastValue = recent[recent.length - 1].value;
    const predicted = lastValue + avgVelocity * msAhead;

    this.lastPredicted = predicted;
    return predicted;
  }

  reset(): void {
    this.history = [];
    this.lastPredicted = 0;
    this.filter.reset();
  }
}

export const calculateForceFeedback = (
  distance: number,
  virtualWallDistance: number = 50
): { resistance: number; warning: 'none' | 'caution' | 'danger' } => {
  if (distance >= virtualWallDistance) {
    return { resistance: 0, warning: 'none' };
  }

  const normalizedDistance = Math.max(0, distance);
  const resistance = Math.min(1, Math.pow((virtualWallDistance - normalizedDistance) / virtualWallDistance, 1.5));
  
  let warning: 'none' | 'caution' | 'danger' = 'none';
  if (resistance > 0.7) {
    warning = 'danger';
  } else if (resistance > 0.3) {
    warning = 'caution';
  }

  return { resistance, warning };
};
