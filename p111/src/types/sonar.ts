export type FishSpecies = 'small_fish' | 'medium_fish' | 'large_fish' | 'shoal' | 'unknown';

export interface Fish {
  id: string;
  distance: number;
  angle: number;
  size: number;
  speed: number;
  direction: number;
  species?: FishSpecies;
}

export interface EchoData {
  fishId: string;
  distance: number;
  angle: number;
  intensity: number;
  delay: number;
  timestamp: number;
  isBottomEcho?: boolean;
  isNoise?: boolean;
}

export interface EchoFeatures {
  avgIntensity: number;
  intensityVariance: number;
  echoWidth: number;
  echoCount: number;
}

export interface TargetClassification {
  targetId: string;
  species: FishSpecies;
  confidence: number;
  features: EchoFeatures;
  classifiedAt: number;
}

export interface TrackPoint {
  distance: number;
  angle: number;
  timestamp: number;
  intensity: number;
}

export interface TargetTrack {
  targetId: string;
  points: TrackPoint[];
  firstSeen: number;
  lastSeen: number;
  classification?: TargetClassification;
  isActive: boolean;
}

export interface SonarLogEntry {
  timestamp: number;
  scanAngle: number;
  echoes: EchoData[];
  classifications: TargetClassification[];
  params: SonarParams;
}

export interface AScopeData {
  distance: number;
  intensity: number;
  sources: string[];
}

export interface SonarParams {
  beamAngle: number;
  gain: number;
  scanSpeed: number;
  maxRange: number;
  noiseLevel: number;
  bottomEchoEnabled: boolean;
  distanceResolution: number;
}

export interface SonarState {
  scanAngle: number;
  fishes: Fish[];
  echoes: EchoData[];
  aScopeData: AScopeData[];
  tracks: TargetTrack[];
  classifications: TargetClassification[];
  params: SonarParams;
}

export const FISH_SPECIES_INFO: Record<FishSpecies, { name: string; color: string; description: string }> = {
  small_fish: { name: '小型鱼类', color: '#88ff88', description: '体长10-30cm，回波较弱' },
  medium_fish: { name: '中型鱼类', color: '#ffdd00', description: '体长30-80cm，中等回波强度' },
  large_fish: { name: '大型鱼类', color: '#ff8844', description: '体长80cm以上，强回波' },
  shoal: { name: '鱼群', color: '#ff44aa', description: '多鱼聚集，回波宽且不稳定' },
  unknown: { name: '未知目标', color: '#888888', description: '特征不明显，待观察' },
};

export const DEFAULT_SONAR_PARAMS: SonarParams = {
  beamAngle: 15,
  gain: 50,
  scanSpeed: 60,
  maxRange: 1000,
  noiseLevel: 10,
  bottomEchoEnabled: true,
  distanceResolution: 0.02,
};

export const SOUND_SPEED = 1500;
export const BOTTOM_DEPTH = 0.95;
export const TRACK_EXPIRY_TIME = 5000;
export const CLASSIFICATION_INTERVAL = 1000;
