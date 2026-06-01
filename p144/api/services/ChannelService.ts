import { ChannelModel, UserPosition, BSSType } from '@shared/types';

export class ChannelService {
  private static userPositions: Map<number, UserPosition> = new Map();
  private static cellRadius = 500;
  private static bssList: BSSType[] = [];

  private static gaussianRandom(): number {
    let u = 0, v = 0;
    while (u === 0) u = Math.random();
    while (v === 0) v = Math.random();
    return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
  }

  static initBSS(numBSS: number): void {
    this.bssList = [];
    for (let i = 0; i < numBSS; i++) {
      this.bssList.push({
        bssId: i,
        color: i % 4 + 1,
        centerFreq: 2400 + i * 20,
        channelWidth: 80,
      });
    }
  }

  static getUserBSS(userId: number): BSSType | undefined {
    const pos = this.userPositions.get(userId);
    if (!pos) return undefined;
    return this.bssList[pos.bssId];
  }

  static getBSSColor(userId: number): number {
    const pos = this.userPositions.get(userId);
    if (!pos) return 0;
    return this.bssList[pos.bssId]?.color || 0;
  }

  static checkSpatialReuse(userId: number, otherUserId: number): boolean {
    const pos1 = this.userPositions.get(userId);
    const pos2 = this.userPositions.get(otherUserId);
    if (!pos1 || !pos2) return false;

    if (pos1.bssId === pos2.bssId) return false;

    const distance = Math.sqrt(
      Math.pow(pos1.x - pos2.x, 2) + Math.pow(pos1.y - pos2.y, 2)
    );

    return distance > this.cellRadius * 0.5;
  }

  static calculateInterferenceReduction(): number {
    let totalInterference = 0;
    let allowedSR = 0;

    for (let i = 0; i < this.userPositions.size; i++) {
      for (let j = i + 1; j < this.userPositions.size; j++) {
        const pos1 = this.userPositions.get(i);
        const pos2 = this.userPositions.get(j);
        if (!pos1 || !pos2) continue;

        const bss1 = this.bssList[pos1.bssId];
        const bss2 = this.bssList[pos2.bssId];

        if (bss1 && bss2 && bss1.color !== bss2.color) {
          if (this.checkSpatialReuse(i, j)) {
            allowedSR++;
          }
        }
        totalInterference++;
      }
    }

    return totalInterference > 0 ? (allowedSR / totalInterference) * 100 : 0;
  }

  static initUserPositions(numUsers: number, numBSS: number = 1): void {
    this.userPositions.clear();
    this.initBSS(numBSS);

    for (let i = 0; i < numUsers; i++) {
      const bssId = i % numBSS;
      const angleOffset = (bssId / numBSS) * 2 * Math.PI;
      const distance = this.cellRadius * (0.3 + Math.random() * 0.4);
      const angle = angleOffset + (Math.random() - 0.5) * (2 * Math.PI / numBSS);
      const speed = 3 + Math.random() * 10;
      const direction = Math.random() * 2 * Math.PI;

      this.userPositions.set(i, {
        userId: i,
        x: distance * Math.cos(angle),
        y: distance * Math.sin(angle),
        vx: speed * Math.cos(direction),
        vy: speed * Math.sin(direction),
        distance,
        angle,
        bssId,
      });
    }
  }

  static updateUserPositions(slotInterval: number = 1): void {
    this.userPositions.forEach((pos) => {
      pos.x += pos.vx * slotInterval * 0.1;
      pos.y += pos.vy * slotInterval * 0.1;

      pos.distance = Math.sqrt(pos.x * pos.x + pos.y * pos.y);
      pos.angle = Math.atan2(pos.y, pos.x);

      if (pos.distance > this.cellRadius * 0.9) {
        const normalX = pos.x / pos.distance;
        const normalY = pos.y / pos.distance;
        const dot = pos.vx * normalX + pos.vy * normalY;
        pos.vx -= 2 * dot * normalX;
        pos.vy -= 2 * dot * normalY;
      }
    });
  }

  static getUserPosition(userId: number): UserPosition | undefined {
    return this.userPositions.get(userId);
  }

  static getPathLoss(userId: number): number {
    const pos = this.userPositions.get(userId);
    if (!pos) return 0;

    const referenceDistance = 1;
    const pathLossExponent = 3.5;
    const shadowFading = this.gaussianRandom() * 2;

    const distance = Math.max(pos.distance, referenceDistance);
    const pathLoss = 128.1 + 37.6 * Math.log10(distance / 1000);

    return -(pathLoss + shadowFading);
  }

  static generateSNR(
    userId: number,
    slotIndex: number,
    config: { snrMin: number; snrMax: number; channelModel: ChannelModel }
  ): number {
    const { snrMin, snrMax, channelModel } = config;

    const pathLossSNR = this.getPathLoss(userId);
    const normalizedPathLoss = Math.max(0, Math.min(1, (pathLossSNR + 140) / 60));
    const baseSNR = snrMin + normalizedPathLoss * (snrMax - snrMin);

    let fading = 0;
    switch (channelModel.type) {
      case 'AWGN':
        fading = this.gaussianRandom() * 1;
        break;
      case 'Rayleigh':
        const rayleigh = Math.sqrt(
          Math.pow(this.gaussianRandom(), 2) + Math.pow(this.gaussianRandom(), 2)
        );
        fading = 20 * Math.log10(rayleigh);
        break;
      case 'Rician':
        const k = channelModel.kFactor || 3;
        const s = Math.sqrt(k / (k + 1));
        const sigma = Math.sqrt(1 / (2 * (k + 1)));
        const rician = Math.sqrt(
          Math.pow(s + sigma * this.gaussianRandom(), 2) +
          Math.pow(sigma * this.gaussianRandom(), 2)
        );
        fading = 20 * Math.log10(rician);
        break;
    }

    const dopplerEffect = Math.sin(slotIndex * channelModel.dopplerFreq * 0.01) * 2;
    const result = baseSNR + fading + dopplerEffect;

    return Math.max(snrMin - 5, Math.min(snrMax + 5, result));
  }

  static calculateChannelOrthogonality(user1: number, user2: number): number {
    const pos1 = this.userPositions.get(user1);
    const pos2 = this.userPositions.get(user2);
    if (!pos1 || !pos2) return 0;

    const angleDiff = Math.abs(pos1.angle - pos2.angle);
    const normalizedAngleDiff = Math.min(angleDiff, 2 * Math.PI - angleDiff) / Math.PI;

    const spatialSeparation = Math.min(
      Math.sqrt(Math.pow(pos1.x - pos2.x, 2) + Math.pow(pos1.y - pos2.y, 2)) / this.cellRadius,
      1
    );

    return 0.5 * normalizedAngleDiff + 0.5 * spatialSeparation;
  }

  static findBestMimoPair(
    userId: number,
    candidateUsers: number[],
    minOrthogonality: number = 0.3
  ): number | null {
    let bestPair: number | null = null;
    let bestOrthogonality = minOrthogonality;

    for (const candidate of candidateUsers) {
      if (candidate === userId) continue;

      const orthogonality = this.calculateChannelOrthogonality(userId, candidate);
      if (orthogonality > bestOrthogonality) {
        bestOrthogonality = orthogonality;
        bestPair = candidate;
      }
    }

    return bestPair;
  }

  static snrToMCS(snr: number): number {
    if (snr < -2) return 0;
    if (snr < 0) return 1;
    if (snr < 2) return 2;
    if (snr < 4) return 3;
    if (snr < 6) return 4;
    if (snr < 8) return 5;
    if (snr < 10) return 6;
    if (snr < 12) return 7;
    if (snr < 14) return 8;
    if (snr < 16) return 9;
    if (snr < 18) return 10;
    if (snr < 20) return 11;
    if (snr < 22) return 12;
    if (snr < 24) return 13;
    if (snr < 26) return 14;
    return 15;
  }

  static reset(): void {
    this.userPositions.clear();
  }
}
