import {
  Fish,
  EchoData,
  SonarParams,
  SonarState,
  DEFAULT_SONAR_PARAMS,
  SOUND_SPEED,
  BOTTOM_DEPTH,
  AScopeData,
  TargetTrack,
  TargetClassification,
  EchoFeatures,
  FishSpecies,
  SonarLogEntry,
  TRACK_EXPIRY_TIME,
  CLASSIFICATION_INTERVAL,
} from '../types/sonar';

export class SonarSimulator {
  private state: SonarState;
  private lastUpdateTime: number = 0;
  private echoHistory: Map<string, EchoData> = new Map();
  private echoDecayTime: number = 3000;
  private tracks: Map<string, TargetTrack> = new Map();
  private targetEchoHistory: Map<string, EchoData[]> = new Map();
  private classifications: Map<string, TargetClassification> = new Map();
  private lastClassificationTime: number = 0;
  private logBuffer: SonarLogEntry[] = [];
  private isLogging: boolean = false;
  private logStartTime: number = 0;

  constructor(initialFishes: Fish[] = []) {
    const fishes = initialFishes.length > 0 ? initialFishes : this.generateRandomFishes(15);
    this.state = {
      scanAngle: 0,
      fishes,
      echoes: [],
      aScopeData: [],
      tracks: [],
      classifications: [],
      params: { ...DEFAULT_SONAR_PARAMS },
    };
  }

  private generateRandomFishes(count: number): Fish[] {
    const species: FishSpecies[] = ['small_fish', 'medium_fish', 'large_fish', 'shoal'];
    const fishes: Fish[] = [];
    for (let i = 0; i < count; i++) {
      fishes.push({
        id: `fish-${i}`,
        distance: 0.15 + Math.random() * 0.75,
        angle: Math.random() * 360,
        size: 0.3 + Math.random() * 0.7,
        speed: 0.005 + Math.random() * 0.015,
        direction: Math.random() * 360,
        species: species[Math.floor(Math.random() * species.length)],
      });
    }
    return fishes;
  }

  public update(currentTime: number): SonarState {
    const deltaTime = this.lastUpdateTime === 0 ? 0 : (currentTime - this.lastUpdateTime) / 1000;
    this.lastUpdateTime = currentTime;

    this.state.scanAngle = (this.state.scanAngle + this.state.params.scanSpeed * deltaTime) % 360;

    this.updateFishPositions(deltaTime);

    const newEchoes = this.calculateEchoes();
    this.updateEchoHistory(newEchoes, currentTime);

    this.updateTracks(newEchoes, currentTime);

    if (currentTime - this.lastClassificationTime > CLASSIFICATION_INTERVAL) {
      this.classifyTargets(currentTime);
      this.lastClassificationTime = currentTime;
    }

    this.state.echoes = this.getVisibleEchoes(currentTime);
    this.state.aScopeData = this.calculateAScopeData(newEchoes);
    this.state.tracks = Array.from(this.tracks.values());
    this.state.classifications = Array.from(this.classifications.values());

    if (this.isLogging) {
      this.addLogEntry(currentTime);
    }

    return { ...this.state };
  }

  private updateFishPositions(deltaTime: number): void {
    this.state.fishes = this.state.fishes.map((fish) => {
      const directionRad = (fish.direction * Math.PI) / 180;
      const dx = Math.cos(directionRad) * fish.speed * deltaTime;
      const dy = Math.sin(directionRad) * fish.speed * deltaTime;

      const x = fish.distance * Math.cos((fish.angle * Math.PI) / 180);
      const y = fish.distance * Math.sin((fish.angle * Math.PI) / 180);

      let newX = x + dx;
      let newY = y + dy;

      let newDistance = Math.sqrt(newX * newX + newY * newY);
      let newAngle = Math.atan2(newY, newX) * (180 / Math.PI);

      if (newDistance > 0.9) {
        newDistance = 0.9;
        fish.direction = (fish.direction + 180 + (Math.random() - 0.5) * 60) % 360;
      }
      if (newDistance < 0.1) {
        newDistance = 0.1;
        fish.direction = (fish.direction + 180 + (Math.random() - 0.5) * 60) % 360;
      }

      if (Math.random() < 0.01) {
        fish.direction = (fish.direction + (Math.random() - 0.5) * 30 + 360) % 360;
      }

      return {
        ...fish,
        distance: newDistance,
        angle: (newAngle + 360) % 360,
      };
    });
  }

  private calculateEchoes(): EchoData[] {
    const { scanAngle, params } = this.state;
    const halfBeamAngle = params.beamAngle / 2;
    const echoes: EchoData[] = [];

    for (const fish of this.state.fishes) {
      let angleDiff = Math.abs(fish.angle - scanAngle);
      if (angleDiff > 180) {
        angleDiff = 360 - angleDiff;
      }

      if (angleDiff <= halfBeamAngle) {
        const baseIntensity = fish.size;
        const gainFactor = Math.pow(params.gain / 50, 2);
        const distanceAttenuation = 1 / (Math.max(fish.distance, 0.1) * 2);
        const beamFactor = 1 - (angleDiff / halfBeamAngle) * 0.5;

        let intensity = baseIntensity * gainFactor * distanceAttenuation * beamFactor;
        intensity = Math.min(1, Math.max(0, intensity));

        const delay = (2 * fish.distance * params.maxRange) / SOUND_SPEED / 1000;

        echoes.push({
          fishId: fish.id,
          distance: fish.distance,
          angle: fish.angle,
          intensity,
          delay,
          timestamp: performance.now(),
        });
      }
    }

    if (params.bottomEchoEnabled) {
      const bottomIntensity = 0.4 * Math.pow(params.gain / 50, 2);
      const bottomDelay = (2 * BOTTOM_DEPTH * params.maxRange) / SOUND_SPEED / 1000;

      echoes.push({
        fishId: 'bottom-echo',
        distance: BOTTOM_DEPTH,
        angle: scanAngle,
        intensity: bottomIntensity,
        delay: bottomDelay,
        timestamp: performance.now(),
        isBottomEcho: true,
      });
    }

    if (params.noiseLevel > 0) {
      const noiseCount = Math.floor(params.noiseLevel / 5);
      for (let i = 0; i < noiseCount; i++) {
        if (Math.random() < 0.3) {
          const noiseDistance = 0.2 + Math.random() * 0.7;
          const noiseIntensity = (0.1 + Math.random() * 0.3) * (params.gain / 50);

          echoes.push({
            fishId: `noise-${Date.now()}-${i}`,
            distance: noiseDistance,
            angle: scanAngle + (Math.random() - 0.5) * params.beamAngle,
            intensity: Math.min(1, Math.max(0, noiseIntensity)),
            delay: (2 * noiseDistance * params.maxRange) / SOUND_SPEED / 1000,
            timestamp: performance.now(),
            isNoise: true,
          });
        }
      }
    }

    return echoes;
  }

  private updateTracks(echoes: EchoData[], currentTime: number): void {
    for (const echo of echoes) {
      if (echo.isBottomEcho || echo.isNoise) continue;

      const targetId = echo.fishId;
      const existingTrack = this.tracks.get(targetId);

      if (existingTrack) {
        existingTrack.points.push({
          distance: echo.distance,
          angle: echo.angle,
          timestamp: currentTime,
          intensity: echo.intensity,
        });
        existingTrack.lastSeen = currentTime;
        existingTrack.isActive = true;

        if (existingTrack.points.length > 50) {
          existingTrack.points = existingTrack.points.slice(-50);
        }
      } else {
        this.tracks.set(targetId, {
          targetId,
          points: [
            {
              distance: echo.distance,
              angle: echo.angle,
              timestamp: currentTime,
              intensity: echo.intensity,
            },
          ],
          firstSeen: currentTime,
          lastSeen: currentTime,
          isActive: true,
        });
      }

      const history = this.targetEchoHistory.get(targetId) || [];
      history.push(echo);
      if (history.length > 20) {
        history.shift();
      }
      this.targetEchoHistory.set(targetId, history);
    }

    for (const [targetId, track] of this.tracks) {
      if (currentTime - track.lastSeen > TRACK_EXPIRY_TIME) {
        track.isActive = false;
      }
      if (currentTime - track.lastSeen > TRACK_EXPIRY_TIME * 2) {
        this.tracks.delete(targetId);
        this.targetEchoHistory.delete(targetId);
        this.classifications.delete(targetId);
      }
    }
  }

  private extractEchoFeatures(targetId: string): EchoFeatures | null {
    const echoes = this.targetEchoHistory.get(targetId);
    if (!echoes || echoes.length < 5) return null;

    const intensities = echoes.map((e) => e.intensity);
    const avgIntensity = intensities.reduce((a, b) => a + b, 0) / intensities.length;
    const variance =
      intensities.reduce((a, b) => a + Math.pow(b - avgIntensity, 2), 0) / intensities.length;

    const distances = echoes.map((e) => e.distance);
    const minDist = Math.min(...distances);
    const maxDist = Math.max(...distances);
    const echoWidth = maxDist - minDist;

    return {
      avgIntensity,
      intensityVariance: variance,
      echoWidth,
      echoCount: echoes.length,
    };
  }

  private classifyTargets(currentTime: number): void {
    for (const [targetId, track] of this.tracks) {
      if (!track.isActive) continue;

      const features = this.extractEchoFeatures(targetId);
      if (!features) continue;

      const fish = this.state.fishes.find((f) => f.id === targetId);
      const actualSpecies = fish?.species || 'unknown';

      let species: FishSpecies = 'unknown';
      let confidence = 0.5;

      if (features.avgIntensity < 0.2) {
        species = 'small_fish';
        confidence = 0.6 + Math.random() * 0.2;
      } else if (features.avgIntensity < 0.5) {
        species = 'medium_fish';
        confidence = 0.7 + Math.random() * 0.2;
      } else if (features.echoWidth > 0.1 && features.intensityVariance > 0.05) {
        species = 'shoal';
        confidence = 0.65 + Math.random() * 0.2;
      } else {
        species = 'large_fish';
        confidence = 0.7 + Math.random() * 0.2;
      }

      if (actualSpecies !== 'unknown' && Math.random() < 0.8) {
        species = actualSpecies;
        confidence = Math.min(1, confidence + 0.1);
      }

      this.classifications.set(targetId, {
        targetId,
        species,
        confidence,
        features,
        classifiedAt: currentTime,
      });
    }
  }

  private calculateAScopeData(echoes: EchoData[]): AScopeData[] {
    const { params } = this.state;
    const resolution = params.distanceResolution;
    const bins: Map<number, { intensity: number; sources: string[] }> = new Map();

    for (const echo of echoes) {
      const binIndex = Math.round(echo.distance / resolution);

      const existing = bins.get(binIndex) || { intensity: 0, sources: [] };
      existing.intensity = Math.min(1, existing.intensity + echo.intensity);
      if (!existing.sources.includes(echo.fishId)) {
        existing.sources.push(echo.fishId);
      }
      bins.set(binIndex, existing);
    }

    const result: AScopeData[] = [];
    const maxBins = Math.ceil(1 / resolution);
    for (let i = 0; i <= maxBins; i++) {
      const distance = i * resolution;
      const bin = bins.get(i);
      result.push({
        distance,
        intensity: bin ? bin.intensity : 0,
        sources: bin ? bin.sources : [],
      });
    }

    return result;
  }

  private updateEchoHistory(newEchoes: EchoData[], currentTime: number): void {
    for (const echo of newEchoes) {
      const existing = this.echoHistory.get(echo.fishId);
      if (!existing || currentTime - existing.timestamp > 500) {
        this.echoHistory.set(echo.fishId, { ...echo, timestamp: currentTime });
      }
    }

    for (const [fishId, echo] of this.echoHistory) {
      if (currentTime - echo.timestamp > this.echoDecayTime) {
        this.echoHistory.delete(fishId);
      }
    }
  }

  private getVisibleEchoes(currentTime: number): EchoData[] {
    const visible: EchoData[] = [];
    for (const echo of this.echoHistory.values()) {
      const age = currentTime - echo.timestamp;
      if (age < this.echoDecayTime) {
        const decayFactor = 1 - age / this.echoDecayTime;
        visible.push({
          ...echo,
          intensity: echo.intensity * decayFactor,
        });
      }
    }
    return visible;
  }

  private addLogEntry(currentTime: number): void {
    const entry: SonarLogEntry = {
      timestamp: currentTime,
      scanAngle: this.state.scanAngle,
      echoes: [...this.state.echoes],
      classifications: [...this.state.classifications],
      params: { ...this.state.params },
    };
    this.logBuffer.push(entry);

    if (this.logBuffer.length > 10000) {
      this.logBuffer = this.logBuffer.slice(-10000);
    }
  }

  public startLogging(): void {
    this.isLogging = true;
    this.logStartTime = performance.now();
    this.logBuffer = [];
  }

  public stopLogging(): void {
    this.isLogging = false;
  }

  public isLoggingActive(): boolean {
    return this.isLogging;
  }

  public getLogData(): SonarLogEntry[] {
    return [...this.logBuffer];
  }

  public exportLogAsJSON(): string {
    const data = {
      exportTime: new Date().toISOString(),
      startTime: this.logStartTime,
      duration: performance.now() - this.logStartTime,
      totalEntries: this.logBuffer.length,
      entries: this.logBuffer,
    };
    return JSON.stringify(data, null, 2);
  }

  public exportLogAsCSV(): string {
    let csv = 'Timestamp,ScanAngle,TargetID,Distance,Angle,Intensity,Species,Confidence\n';

    for (const entry of this.logBuffer) {
      for (const echo of entry.echoes) {
        if (echo.isBottomEcho || echo.isNoise) continue;

        const classification = entry.classifications.find((c) => c.targetId === echo.fishId);
        csv += `${entry.timestamp},${entry.scanAngle.toFixed(2)},${echo.fishId},${echo.distance.toFixed(4)},${echo.angle.toFixed(2)},${echo.intensity.toFixed(4)},${classification?.species || 'unknown'},${classification?.confidence.toFixed(4) || '0'}\n`;
      }
    }

    return csv;
  }

  public downloadLog(format: 'json' | 'csv'): void {
    let content: string;
    let filename: string;
    let mimeType: string;

    if (format === 'json') {
      content = this.exportLogAsJSON();
      filename = `sonar_log_${Date.now()}.json`;
      mimeType = 'application/json';
    } else {
      content = this.exportLogAsCSV();
      filename = `sonar_log_${Date.now()}.csv`;
      mimeType = 'text/csv';
    }

    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  public getClassification(targetId: string): TargetClassification | undefined {
    return this.classifications.get(targetId);
  }

  public getTrack(targetId: string): TargetTrack | undefined {
    return this.tracks.get(targetId);
  }

  public setParams(params: Partial<SonarParams>): void {
    this.state.params = { ...this.state.params, ...params };
  }

  public getParams(): SonarParams {
    return { ...this.state.params };
  }

  public addFish(fish: Omit<Fish, 'id'>): void {
    const newFish: Fish = {
      ...fish,
      id: `fish-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    };
    this.state.fishes.push(newFish);
  }

  public removeFish(fishId: string): void {
    this.state.fishes = this.state.fishes.filter((f) => f.id !== fishId);
    this.echoHistory.delete(fishId);
    this.tracks.delete(fishId);
    this.classifications.delete(fishId);
  }

  public reset(): void {
    this.state.fishes = this.generateRandomFishes(15);
    this.echoHistory.clear();
    this.tracks.clear();
    this.classifications.clear();
    this.targetEchoHistory.clear();
    this.state.echoes = [];
    this.state.tracks = [];
    this.state.classifications = [];
    this.state.scanAngle = 0;
    this.logBuffer = [];
    this.isLogging = false;
  }
}
