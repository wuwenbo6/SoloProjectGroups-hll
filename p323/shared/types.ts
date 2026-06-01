export interface UartConfig {
  path: string;
  baudRate: number;
}

export interface TelnetConfig {
  host: string;
  port: number;
  password?: string;
}

export interface FileUpload {
  filename: string;
  content: string;
}

export type TransportType = 'uart' | 'telnet';

export type ClientMessage =
  | { type: 'connect'; transport: TransportType; config: UartConfig | TelnetConfig }
  | { type: 'disconnect' }
  | { type: 'command'; data: string }
  | { type: 'interrupt' }
  | { type: 'soft_reset' }
  | { type: 'file_upload'; file: FileUpload };

export type ServerMessage =
  | { type: 'connected'; deviceInfo?: string }
  | { type: 'disconnected' }
  | { type: 'output'; data: string }
  | { type: 'error'; message: string }
  | { type: 'status'; state: 'connecting' | 'connected' | 'disconnected' | 'error' }
  | { type: 'file_upload_progress'; filename: string; percent: number }
  | { type: 'file_upload_complete'; filename: string }
  | { type: 'file_upload_error'; filename: string; message: string };
