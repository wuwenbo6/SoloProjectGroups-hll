export class ThroughputService {
  private static readonly RB_BANDWIDTH = 180;

  static calculateThroughput(snr: number, mcs: number): number {
    const snrLinear = Math.pow(10, snr / 10);
    const shannonCapacity = Math.log2(1 + snrLinear);

    const mcsEfficiency = this.getMCSEfficiency(mcs);
    const efficiency = Math.min(shannonCapacity, mcsEfficiency);

    return this.RB_BANDWIDTH * efficiency / 1000;
  }

  private static getMCSEfficiency(mcs: number): number {
    const mcsTable = [
      0.15, 0.23, 0.38, 0.60, 0.88, 1.18, 1.48, 1.91,
      2.41, 2.73, 3.32, 3.90, 4.52, 5.12, 5.55, 6.22
    ];
    return mcsTable[Math.min(Math.max(mcs, 0), 15)];
  }

  static calculateJainFairnessIndex(throughputs: number[]): number {
    if (throughputs.length === 0) return 0;

    const sum = throughputs.reduce((a, b) => a + b, 0);
    const sumSquared = throughputs.reduce((a, b) => a + b * b, 0);
    const n = throughputs.length;

    if (sumSquared === 0) return 1;

    return (sum * sum) / (n * sumSquared);
  }
}
