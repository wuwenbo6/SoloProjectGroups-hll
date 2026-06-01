export interface MessageRecord {
  id: string;
  content: string;
  pid: number;
  sequence: number;
  status: 'ACCEPTED' | 'DUPLICATE_DISCARDED' | 'TX_PENDING' | 'TX_COMMITTED' | 'TX_ABORTED';
  timestamp: number;
  partition: number;
  transactionId?: string;
}

export interface ProducerStatus {
  pid: number;
  currentSequence: number;
  enableIdempotence: boolean;
  epoch: number;
  partitionSequences: Record<number, number>;
  transactionalId: string | null;
  activeTransaction: TransactionState | null;
}

export type TransactionPhase = 'BEGIN' | 'SENDING' | 'COMMITTING' | 'ABORTING';

export interface TransactionState {
  transactionId: string;
  pid: number;
  epoch: number;
  phase: TransactionPhase;
  partitions: number[];
  messageIds: string[];
  startedAt: number;
  committedAt?: number;
  abortedAt?: number;
}

export interface PartitionState {
  partition: number;
  lastSequence: number;
  lastTimestamp: number;
}

export interface PIDState {
  pid: number;
  epoch: number;
  partitions: Record<number, PartitionState>;
  createdAt: number;
  lastUsedAt: number;
}

export interface ProducerStats {
  totalSent: number;
  accepted: number;
  discarded: number;
  deduplicationRate: number;
}

export interface SendMessageRequest {
  content: string;
  partition?: number;
}

export interface SendDuplicateRequest {
  content: string;
  pid: number;
  sequence: number;
  partition?: number;
}

export interface SendMessageResponse {
  success: boolean;
  message: MessageRecord;
  isDuplicate: boolean;
}

export interface ToggleIdempotenceRequest {
  enable: boolean;
}

export interface ToggleIdempotenceResponse {
  success: boolean;
  enableIdempotence: boolean;
}

export interface ResetResponse {
  success: boolean;
  status: ProducerStatus;
}

export interface MessagesResponse {
  messages: MessageRecord[];
  stats: ProducerStats;
}

export interface BeginTransactionRequest {
  transactionalId?: string;
}

export interface TransactionalSendRequest {
  content: string;
  partition: number;
}

export interface ExportStatsResponse {
  format: 'json' | 'csv';
  data: string;
  filename: string;
}
