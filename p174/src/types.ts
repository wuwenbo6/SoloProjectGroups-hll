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

export interface PoolStats {
  totalBytes: number;
  usedBytes: number;
  availableBytes: number;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface ActivityItem {
  id: string;
  type: 'create' | 'rollback' | 'delete' | 'clone' | 'protect' | 'unprotect' | 'export-diff' | 'schedule';
  message: string;
  timestamp: string;
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

