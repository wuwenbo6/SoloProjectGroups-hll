export type NALUnitType =
  | 'VPS'
  | 'SPS'
  | 'PPS'
  | 'IDR'
  | 'P'
  | 'B'
  | 'RASL'
  | 'RADL'
  | 'AUD'
  | 'SEI'
  | 'EOS'
  | 'EOB'
  | 'FD'
  | 'UNKNOWN';

export interface NALUnit {
  index: number;
  type: NALUnitType;
  typeCode: number;
  size: number;
  offset: number;
  layerId: number;
  temporalId: number;
  firstBytes: string;
  sliceInfo?: SliceInfo;
}

export type CUSize = '64x64' | '32x32' | '16x16' | '8x8';

export type IntraPredMode =
  | 'PLANAR'
  | 'DC'
  | 'ANGULAR_1'
  | 'ANGULAR_2'
  | 'ANGULAR_3'
  | 'ANGULAR_4'
  | 'ANGULAR_5'
  | 'ANGULAR_6'
  | 'ANGULAR_7'
  | 'ANGULAR_8'
  | 'ANGULAR_9'
  | 'ANGULAR_10'
  | 'ANGULAR_11'
  | 'ANGULAR_12'
  | 'ANGULAR_13'
  | 'ANGULAR_14'
  | 'ANGULAR_15'
  | 'ANGULAR_16'
  | 'ANGULAR_17'
  | 'ANGULAR_18'
  | 'ANGULAR_19'
  | 'ANGULAR_20'
  | 'ANGULAR_21'
  | 'ANGULAR_22'
  | 'ANGULAR_23'
  | 'ANGULAR_24'
  | 'ANGULAR_25'
  | 'ANGULAR_26'
  | 'ANGULAR_27'
  | 'ANGULAR_28'
  | 'ANGULAR_29'
  | 'ANGULAR_30'
  | 'ANGULAR_31'
  | 'ANGULAR_32'
  | 'ANGULAR_33'
  | 'ANGULAR_34';

export interface SliceInfo {
  sliceType: 'I' | 'P' | 'B';
  sliceQp: number;
  cuPartitionStats: Record<CUSize, number>;
  intraPredStats: Record<string, number>;
  cuTotalCount: number;
}

export interface CUAnalysisResult {
  cuPartitionDistribution: Record<CUSize, number>;
  intraPredModeDistribution: Record<string, number>;
  cuSizeByFrameType: {
    idr: Record<CUSize, number>;
    p: Record<CUSize, number>;
    b: Record<CUSize, number>;
  };
  totalCUs: number;
  avgCUSize: number;
}

export interface ParseResult {
  fileName: string;
  fileSize: number;
  nalUnits: NALUnit[];
  stats: {
    total: number;
    vps: number;
    sps: number;
    pps: number;
    idr: number;
    pFrame: number;
    bFrame: number;
    raslFrame: number;
    radlFrame: number;
    aud: number;
    sei: number;
    eos: number;
    eob: number;
    fd: number;
    unknown: number;
  };
  gopStructure: GOP[];
  cuAnalysis?: CUAnalysisResult;
}

export interface GOP {
  index: number;
  startIndex: number;
  endIndex: number;
  frameCount: number;
  idrCount: number;
  pFrameCount: number;
  bFrameCount: number;
  raslFrameCount: number;
  radlFrameCount: number;
  size: number;
}

export const NAL_TYPE_COLORS: Record<NALUnitType, string> = {
  VPS: '#8B5CF6',
  SPS: '#06B6D4',
  PPS: '#10B981',
  IDR: '#EF4444',
  P: '#3B82F6',
  B: '#F59E0B',
  RASL: '#0EA5E9',
  RADL: '#14B8A6',
  AUD: '#6366F1',
  SEI: '#EC4899',
  EOS: '#64748B',
  EOB: '#64748B',
  FD: '#64748B',
  UNKNOWN: '#6B7280',
};

export const NAL_TYPE_NAMES: Record<NALUnitType, string> = {
  VPS: '视频参数集',
  SPS: '序列参数集',
  PPS: '图像参数集',
  IDR: 'IDR 帧',
  P: 'P 帧',
  B: 'B 帧',
  RASL: 'RASL 帧',
  RADL: 'RADL 帧',
  AUD: '访问单元分隔符',
  SEI: '补充增强信息',
  EOS: '序列结束',
  EOB: '比特流结束',
  FD: '填充数据',
  UNKNOWN: '未知类型',
};
