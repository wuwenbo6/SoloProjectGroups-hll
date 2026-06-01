export interface RbdImage {
  name: string;
  pool: string;
  size: number;
  format: number;
  snapshotCount: number;
  provisionedSize: number;
}

export interface RbdImageDetail extends RbdImage {
  snapshots: RbdSnapshot[];
  features: string[];
  createTime: string;
}

export interface RbdSnapshot {
  id: number;
  name: string;
  size: number;
  timestamp: string;
  isProtected: boolean;
  children?: string[];
}

export interface SnapshotTreeNode {
  id: string;
  type: 'image' | 'snapshot';
  name: string;
  pool?: string;
  size?: number;
  timestamp?: string;
  isProtected?: boolean;
  children?: SnapshotTreeNode[];
  parent?: string;
  level: number;
}

export interface CreateSnapshotRequest {
  snapshotName: string;
}

export interface CloneSnapshotRequest {
  newPool: string;
  newImageName: string;
  size?: number;
}

export interface DeleteSnapshotRequest {
  force?: boolean;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface RbdListOutput {
  name: string;
  size: number;
  format: number;
  snapshots?: string;
}

export interface RbdInfoOutput {
  name: string;
  size: number;
  format: number;
  features: string;
  'create time': string;
  snapshots?: Array<{
    id: number;
    name: string;
    size: number;
    timestamp: string;
    'is protected'?: string;
  }>;
}

export interface SnapshotSchedule {
  id: string;
  name: string;
  pool: string;
  imageName: string;
  cronExpression: string;
  prefix: string;
  retentionCount: number;
  enabled: boolean;
  createdAt: string;
  lastRun?: string;
  nextRun?: string;
  lastSnapshotName?: string;
}

export interface CreateScheduleRequest {
  name: string;
  pool: string;
  imageName: string;
  cronExpression: string;
  prefix: string;
  retentionCount: number;
  enabled: boolean;
}

export interface ExportDiffRequest {
  fromSnapshot?: string;
  toSnapshot?: string;
  outputPath?: string;
}

export interface ExportDiffResult {
  fromSnapshot?: string;
  toSnapshot?: string;
  outputPath: string;
  size: number;
  duration: number;
}

