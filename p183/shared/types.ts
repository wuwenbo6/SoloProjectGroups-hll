export type ModelType = 'diode' | 'bjt' | 'mosfet';

export interface DataPoint {
  v: number;
  i: number;
}

export interface DiodeParameters {
  IS: number;
  N: number;
  RS?: number;
}

export interface BJTParameters {
  IS: number;
  BF: number;
  NF: number;
  VAF?: number;
}

export interface MOSFETParameters {
  KP: number;
  VTO: number;
  LAMBDA?: number;
  W?: number;
  L?: number;
}

export type ModelParameters = DiodeParameters | BJTParameters | MOSFETParameters;

export interface FitStatistics {
  rSquared: number;
  rmse: number;
}

export interface FitResult {
  modelType: ModelType;
  parameters: ModelParameters;
  fittedCurve: DataPoint[];
  statistics: FitStatistics;
  spiceStatement: string;
}

export interface FitResponse {
  success: boolean;
  data?: {
    measuredData: DataPoint[];
    fittedData: DataPoint[];
    parameters: ModelParameters;
    statistics: FitStatistics;
    modelType: ModelType;
    spiceStatement: string;
  };
  error?: string;
}

export interface SampleResponse {
  success: boolean;
  data: DataPoint[];
}

export const MODEL_LABELS: Record<ModelType, string> = {
  diode: '二极管 (Diode)',
  bjt: 'BJT 三极管',
  mosfet: 'MOSFET 场效应管',
};

export const MODEL_DESCRIPTIONS: Record<ModelType, string> = {
  diode: 'I = IS × (e^(V/(N×Vt)) - 1)',
  bjt: 'IC = IS × (e^(VBE/(NF×Vt)) - 1) × (1 + VCE/VAF)',
  mosfet: 'ID = KP/2 × (VGS - VTO)² × (1 + LAMBDA×VDS)',
};
