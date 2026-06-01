export interface DeviceConfig {
  host: string;
  port: number;
  timeout?: number;
  terminator?: string;
  chunkSize?: number;
  chunkDelay?: number;
}

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

export interface ScpiCommandRequest {
  command: string;
  isQuery?: boolean;
  timeout?: number;
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

export interface ConnectRequest {
  host: string;
  port: number;
  timeout?: number;
  chunkSize?: number;
  chunkDelay?: number;
}

export interface QueueStatus {
  length: number;
  isProcessing: boolean;
  pending: QueuedCommand[];
  recent: QueuedCommand[];
}
