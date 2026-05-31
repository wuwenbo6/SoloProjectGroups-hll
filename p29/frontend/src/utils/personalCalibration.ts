import { LipLandmarks, Point } from '../types';

export interface CalibrationSample {
  consonant: string;
  landmarks: LipLandmarks;
  timestamp: number;
  mouthOpenness: number;
  lipWidth: number;
  lipHeight: number;
  aspectRatio: number;
}

export interface UserCalibrationProfile {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  samples: CalibrationSample[];
  baselineMetrics: {
    averageMouthOpenness: number;
    averageLipWidth: number;
    averageLipHeight: number;
    averageAspectRatio: number;
  };
  consonantPatterns: Map<string, {
    opennessRange: [number, number];
    widthRange: [number, number];
    aspectRatioRange: [number, number];
  }>;
}

export class PersonalCalibrator {
  private profile: UserCalibrationProfile | null = null;
  private calibrationPhase: 'idle' | 'recording' | 'complete' = 'idle';
  private currentConsonant: string | null = null;
  private samplesPerConsonant: number = 5;
  private targetConsonants: string[] = ['b', 'p', 'm', 'f', 'd', 't'];

  constructor() {
    this.loadProfile();
  }

  startCalibration(): void {
    this.calibrationPhase = 'recording';
    this.profile = {
      id: `profile_${Date.now()}`,
      name: '默认用户',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      samples: [],
      baselineMetrics: {
        averageMouthOpenness: 0,
        averageLipWidth: 0,
        averageLipHeight: 0,
        averageAspectRatio: 0
      },
      consonantPatterns: new Map()
    };
  }

  addSample(consonant: string, landmarks: LipLandmarks): void {
    if (!this.profile || this.calibrationPhase !== 'recording') return;

    const metrics = this.calculateLipMetrics(landmarks);
    
    const sample: CalibrationSample = {
      consonant,
      landmarks,
      timestamp: Date.now(),
      ...metrics
    };

    this.profile.samples.push(sample);
    this.updateBaselineMetrics();
    this.updateConsonantPatterns();
  }

  calculateLipMetrics(landmarks: LipLandmarks): {
    mouthOpenness: number;
    lipWidth: number;
    lipHeight: number;
    aspectRatio: number;
  } {
    const { upperLip, lowerLip } = landmarks;

    const leftCorner = upperLip[0];
    const rightCorner = upperLip[Math.floor(upperLip.length / 2)];
    
    const upperLipCenter = upperLip[Math.floor(upperLip.length / 4)];
    const lowerLipCenter = lowerLip[Math.floor(lowerLip.length / 4)];

    const lipWidth = Math.sqrt(
      Math.pow(rightCorner.x - leftCorner.x, 2) +
      Math.pow(rightCorner.y - leftCorner.y, 2)
    );

    const lipHeight = Math.sqrt(
      Math.pow(lowerLipCenter.x - upperLipCenter.x, 2) +
      Math.pow(lowerLipCenter.y - upperLipCenter.y, 2)
    );

    const mouthOpenness = lipHeight / (lipWidth + 0.001);
    const aspectRatio = lipWidth / (lipHeight + 0.001);

    return {
      mouthOpenness,
      lipWidth,
      lipHeight,
      aspectRatio
    };
  }

  private updateBaselineMetrics(): void {
    if (!this.profile || this.profile.samples.length === 0) return;

    const samples = this.profile.samples;
    const count = samples.length;

    this.profile.baselineMetrics = {
      averageMouthOpenness: samples.reduce((sum, s) => sum + s.mouthOpenness, 0) / count,
      averageLipWidth: samples.reduce((sum, s) => sum + s.lipWidth, 0) / count,
      averageLipHeight: samples.reduce((sum, s) => sum + s.lipHeight, 0) / count,
      averageAspectRatio: samples.reduce((sum, s) => sum + s.aspectRatio, 0) / count
    };
  }

  private updateConsonantPatterns(): void {
    if (!this.profile) return;

    const groupedSamples = new Map<string, CalibrationSample[]>();
    
    for (const sample of this.profile.samples) {
      if (!groupedSamples.has(sample.consonant)) {
        groupedSamples.set(sample.consonant, []);
      }
      groupedSamples.get(sample.consonant)!.push(sample);
    }

    for (const [consonant, samples] of groupedSamples) {
      if (samples.length < 2) continue;

      const opennessValues = samples.map(s => s.mouthOpenness).sort((a, b) => a - b);
      const widthValues = samples.map(s => s.lipWidth).sort((a, b) => a - b);
      const aspectValues = samples.map(s => s.aspectRatio).sort((a, b) => a - b);

      this.profile.consonantPatterns.set(consonant, {
        opennessRange: [
          opennessValues[Math.floor(samples.length * 0.1)],
          opennessValues[Math.floor(samples.length * 0.9)]
        ],
        widthRange: [
          widthValues[Math.floor(samples.length * 0.1)],
          widthValues[Math.floor(samples.length * 0.9)]
        ],
        aspectRatioRange: [
          aspectValues[Math.floor(samples.length * 0.1)],
          aspectValues[Math.floor(samples.length * 0.9)]
        ]
      });
    }
  }

  normalizeLandmarks(landmarks: LipLandmarks): LipLandmarks {
    if (!this.profile) return landmarks;

    const metrics = this.calculateLipMetrics(landmarks);
    const baseline = this.profile.baselineMetrics;

    const opennessScale = baseline.averageMouthOpenness / (metrics.mouthOpenness + 0.001);
    const widthScale = baseline.averageLipWidth / (metrics.lipWidth + 0.001);
    const heightScale = baseline.averageLipHeight / (metrics.lipHeight + 0.001);

    const centerX = (landmarks.upperLip.reduce((sum, p) => sum + p.x, 0) / landmarks.upperLip.length +
                     landmarks.lowerLip.reduce((sum, p) => sum + p.x, 0) / landmarks.lowerLip.length) / 2;
    const centerY = (landmarks.upperLip.reduce((sum, p) => sum + p.y, 0) / landmarks.upperLip.length +
                     landmarks.lowerLip.reduce((sum, p) => sum + p.y, 0) / landmarks.lowerLip.length) / 2;

    const normalizePoint = (point: Point): Point => {
      const relX = (point.x - centerX) * widthScale + centerX;
      const relY = (point.y - centerY) * heightScale + centerY;
      return {
        x: relX,
        y: relY,
        z: point.z
      };
    };

    return {
      upperLip: landmarks.upperLip.map(normalizePoint),
      lowerLip: landmarks.lowerLip.map(normalizePoint),
      boundingBox: landmarks.boundingBox
    };
  }

  predictConsonantByPattern(landmarks: LipLandmarks): string | null {
    if (!this.profile || this.profile.consonantPatterns.size === 0) return null;

    const metrics = this.calculateLipMetrics(landmarks);
    let bestMatch: string | null = null;
    let bestScore = 0;

    for (const [consonant, patterns] of this.profile.consonantPatterns) {
      let score = 0;
      
      if (metrics.mouthOpenness >= patterns.opennessRange[0] && 
          metrics.mouthOpenness <= patterns.opennessRange[1]) {
        score += 0.4;
      }
      
      if (metrics.lipWidth >= patterns.widthRange[0] && 
          metrics.lipWidth <= patterns.widthRange[1]) {
        score += 0.3;
      }
      
      if (metrics.aspectRatio >= patterns.aspectRatioRange[0] && 
          metrics.aspectRatio <= patterns.aspectRatioRange[1]) {
        score += 0.3;
      }

      if (score > bestScore) {
        bestScore = score;
        bestMatch = consonant;
      }
    }

    return bestScore >= 0.5 ? bestMatch : null;
  }

  getSampleCountForConsonant(consonant: string): number {
    if (!this.profile) return 0;
    return this.profile.samples.filter(s => s.consonant === consonant).length;
  }

  isCalibrationComplete(): boolean {
    if (!this.profile) return false;
    
    for (const consonant of this.targetConsonants) {
      if (this.getSampleCountForConsonant(consonant) < this.samplesPerConsonant) {
        return false;
      }
    }
    return true;
  }

  completeCalibration(): void {
    if (this.profile) {
      this.profile.updatedAt = Date.now();
    }
    this.calibrationPhase = 'complete';
    this.saveProfile();
  }

  saveProfile(): void {
    if (!this.profile) return;
    
    try {
      const profileData = {
        ...this.profile,
        consonantPatterns: Array.from(this.profile.consonantPatterns.entries())
      };
      localStorage.setItem('lip_reading_calibration', JSON.stringify(profileData));
    } catch (e) {
      console.error('Error saving calibration profile:', e);
    }
  }

  loadProfile(): void {
    try {
      const saved = localStorage.getItem('lip_reading_calibration');
      if (saved) {
        const data = JSON.parse(saved);
        this.profile = {
          ...data,
          consonantPatterns: new Map(data.consonantPatterns || [])
        };
        this.calibrationPhase = 'complete';
      }
    } catch (e) {
      console.error('Error loading calibration profile:', e);
    }
  }

  getProfile(): UserCalibrationProfile | null {
    return this.profile;
  }

  getCalibrationPhase(): string {
    return this.calibrationPhase;
  }

  getTargetConsonants(): string[] {
    return this.targetConsonants;
  }

  hasProfile(): boolean {
    return this.profile !== null && this.calibrationPhase === 'complete';
  }

  reset(): void {
    this.profile = null;
    this.calibrationPhase = 'idle';
    localStorage.removeItem('lip_reading_calibration');
  }
}
