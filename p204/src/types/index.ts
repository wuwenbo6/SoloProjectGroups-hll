export interface SCTPMessage {
  streamId: number;
  sequence: number;
  content: string;
  timestamp: number;
  type: 'data' | 'ack';
  lifetime?: number;
  isUnreliable?: boolean;
}

export interface GapAckBlock {
  start: number;
  end: number;
}

export interface SACKMessage {
  streamId: number;
  cumulativeTSN: number;
  gapAckBlocks: GapAckBlock[];
  duplicateTSNs: number[];
  timestamp: number;
  expiredTSNs?: number[];
}

export interface QueuedMessage {
  message: SCTPMessage;
  status: 'pending' | 'sent' | 'acked' | 'lost' | 'expired';
  sentTime?: number;
  ackTime?: number;
  expireTime?: number;
  retransmitCount: number;
}

export interface StreamSendState {
  nextTSN: number;
  lastAckedTSN: number;
  sendQueue: Map<number, QueuedMessage>;
  outstandingBytes: number;
  cwnd: number;
  ssthresh: number;
}

export interface StreamState {
  streamId: number;
  name: string;
  nextSequence: number;
  expectedSequence: number;
  highestReceived: number;
  buffer: Map<number, SCTPMessage>;
  receivedCount: number;
  sentCount: number;
  expiredCount: number;
  sendState: StreamSendState;
  lastSACK?: SACKMessage;
}

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface NetworkConfig {
  lossRate: number;
  minDelay: number;
  maxDelay: number;
  reorderRate: number;
}

export interface ClientToServerMessage {
  type: 'send' | 'batchSend' | 'sack' | 'config';
  streamId: number;
  content?: string;
  count?: number;
  sack?: SACKMessage;
  config?: NetworkConfig;
  lifetime?: number;
  isUnreliable?: boolean;
}

export interface ServerToClientMessage {
  type: 'message' | 'connected' | 'ack' | 'sack' | 'config' | 'expired';
  streamId?: number;
  sequence?: number;
  content?: string;
  timestamp?: number;
  clientId?: string;
  sack?: SACKMessage;
  config?: NetworkConfig;
  expired?: number[];
}

export interface DelayedMessage {
  message: ServerToClientMessage;
  sendTime: number;
  isDropped?: boolean;
}
