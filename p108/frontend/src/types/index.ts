export interface SimulationParams {
  id?: number;
  name: string;
  undercooling: number;
  anisotropy: number;
  anisotropyMode: number;
  interfaceWidth: number;
  mobility: number;
  createdAt?: string;
}

export interface SimulationState {
  isRunning: boolean;
  isPaused: boolean;
  currentStep: number;
  totalSteps: number;
  progress: number;
  freeEnergy: number;
  energyHistory: { step: number; energy: number }[];
}

export interface IsosurfaceData {
  x: number[];
  y: number[];
  z: number[];
  values: number[];
  dimensions: [number, number, number];
  total_points?: number;
  rendered_points?: number;
}

export interface WSMessage {
  type: 'init' | 'step' | 'complete' | 'error' | 'pause' | 'resume';
  step?: number;
  data?: {
    isosurface?: IsosurfaceData;
    free_energy?: number;
    progress?: number;
    dimensions?: [number, number, number];
    total_steps?: number;
    message?: string;
  };
}
