export interface DeviceStatus {
  connected: boolean;
  host: string;
  port: number;
  lastCommand?: string;
  lastResponse?: string;
  error?: string;
  queueLength: number;
  isProcessing: boolean;
}

export interface ScpiCommandResponse {
  success: boolean;
  command: string;
  response?: string;
  error?: string;
  timestamp: number;
}

export interface QueuedCommand {
  id: string;
  command: string;
  isQuery: boolean;
  timeout: number;
  timestamp: number;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  response?: ScpiCommandResponse;
}

export interface QueueStatus {
  length: number;
  isProcessing: boolean;
  pending: QueuedCommand[];
  recent: QueuedCommand[];
}

export interface ConnectRequest {
  host: string;
  port: number;
  timeout?: number;
  chunkSize?: number;
  chunkDelay?: number;
}

export interface ScpiCommandRequest {
  command: string;
  isQuery?: boolean;
  timeout?: number;
}

export interface CommandHistoryItem {
  id: string;
  command: string;
  response?: string;
  error?: string;
  timestamp: number;
  success: boolean;
  status: 'pending' | 'processing' | 'completed' | 'failed';
}

export interface EnqueueResponse {
  success: boolean;
  message: string;
  commandId: string;
  queueLength: number;
}
