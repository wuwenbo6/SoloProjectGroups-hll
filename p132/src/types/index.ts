
export enum DataType {
  BOOL = 'BOOL',
  INT8 = 'INT8',
  INT16 = 'INT16',
  INT32 = 'INT32',
  INT64 = 'INT64',
  UINT8 = 'UINT8',
  UINT16 = 'UINT16',
  UINT32 = 'UINT32',
  UINT64 = 'UINT64',
  FLOAT32 = 'FLOAT32',
  FLOAT64 = 'FLOAT64',
  STRING = 'STRING',
}

export const DataTypeBitLength: Record<DataType, number> = {
  [DataType.BOOL]: 1,
  [DataType.INT8]: 8,
  [DataType.INT16]: 16,
  [DataType.INT32]: 32,
  [DataType.INT64]: 64,
  [DataType.UINT8]: 8,
  [DataType.UINT16]: 16,
  [DataType.UINT32]: 32,
  [DataType.UINT64]: 64,
  [DataType.FLOAT32]: 32,
  [DataType.FLOAT64]: 64,
  [DataType.STRING]: 8,
};

export interface PdoEntry {
  id: string;
  index: number;
  subIndex: number;
  name: string;
  dataType: DataType;
  bitLength: number;
}

export type PdoType = 'TxPDO' | 'RxPDO';

export interface ObjectDictionaryItem {
  index: number;
  subIndex: number;
  name: string;
  dataType: DataType;
  description: string;
}

export enum CoEAccessType {
  RO = 'ro',
  RW = 'rw',
  WO = 'wo',
  CONST = 'const',
}

export interface CoEParameter {
  id: string;
  index: number;
  subIndex: number;
  name: string;
  dataType: DataType;
  accessType: CoEAccessType;
  defaultValue?: string;
  lowLimit?: string;
  highLimit?: string;
  description: string;
  pdoMapping?: boolean;
}

export interface SlaveInfo {
  vendorId: string;
  productCode: string;
  revisionNo: string;
  slaveName: string;
  vendorName: string;
  productName: string;
}

export interface EsiConfig {
  id: string;
  name: string;
  slaveInfo: SlaveInfo;
  txPdO: PdoEntry[];
  rxPdO: PdoEntry[];
  coeParameters: CoEParameter[];
  createdAt: Date;
  updatedAt: Date;
}

export interface ValidationError {
  id: string;
  severity: 'error' | 'warning' | 'info';
  code: string;
  message: string;
  location?: {
    line?: number;
    column?: number;
    xpath?: string;
  };
  suggestion?: string;
}

export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  warnings: ValidationError[];
  timestamp: Date;
}

export interface ConfigTemplate {
  id: string;
  name: string;
  description: string;
  config: EsiConfig;
  createdAt: Date;
  updatedAt: Date;
}

export interface MultiSlaveProject {
  id: string;
  name: string;
  description: string;
  slaves: EsiConfig[];
  createdAt: Date;
  updatedAt: Date;
}

export const defaultSlaveInfo: SlaveInfo = {
  vendorId: '0x00000000',
  productCode: '0x00000000',
  revisionNo: '0x00000000',
  slaveName: 'EtherCAT Slave',
  vendorName: 'Vendor Name',
  productName: 'Product Name',
};

export const defaultEsiConfig: EsiConfig = {
  id: '',
  name: 'New Configuration',
  slaveInfo: defaultSlaveInfo,
  txPdO: [],
  rxPdO: [],
  coeParameters: [],
  createdAt: new Date(),
  updatedAt: new Date(),
};

export const defaultMultiSlaveProject: MultiSlaveProject = {
  id: '',
  name: 'Multi-Slave Project',
  description: '',
  slaves: [],
  createdAt: new Date(),
  updatedAt: new Date(),
};
